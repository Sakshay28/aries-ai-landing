import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRedisClient } from '@/lib/redis/client';

// Operator-only readiness probe for the broadcast subsystem.
// Surfaces the two config-dependent risks that don't show up in code:
//   C6 — Meta webhook signing: a WhatsApp-connected tenant with no app secret
//        (neither global META_APP_SECRET nor per-tenant wa_app_secret) has its
//        inbound webhooks REJECTED in production.
//   C7 — Redis: launch rate-limit + app-secret caching use it; the system
//        degrades gracefully without it, so this is informational, not fatal.
export const maxDuration = 10;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get('Authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // C7: Redis
  let redisOk = false;
  try {
    const redis = getRedisClient();
    if (redis) { await redis.ping(); redisOk = true; }
  } catch { redisOk = false; }

  // C6: Meta webhook signing
  const globalMetaSecret = !!(process.env.META_APP_SECRET || process.env.WHATSAPP_WEBHOOK_SECRET);
  let tenantsMissingSecret: number | null = null;
  if (!globalMetaSecret) {
    const { count } = await supabaseAdmin
      .from('tenants')
      .select('id', { count: 'exact', head: true })
      .is('wa_app_secret', null)
      .not('wa_phone_number_id', 'is', null); // only WhatsApp-connected tenants matter
    tenantsMissingSecret = count ?? 0;
  }

  const metaSigning = globalMetaSecret
    ? 'global_secret_set'
    : (tenantsMissingSecret && tenantsMissingSecret > 0)
      ? `WARN: ${tenantsMissingSecret} connected tenant(s) missing wa_app_secret — their webhooks will be 401-rejected in production`
      : 'per_tenant_secrets_ok';

  const checks = {
    redis: redisOk ? 'ok' : 'not_configured (rate-limit + secret cache disabled; degrades gracefully)',
    metaWebhookSigning: metaSigning,
    cronSecret: process.env.CRON_SECRET ? 'set' : 'MISSING',
  };

  const healthy = !!process.env.CRON_SECRET && !metaSigning.startsWith('WARN');

  return NextResponse.json({ healthy, checks, ts: new Date().toISOString() }, {
    status: healthy ? 200 : 503,
  });
}
