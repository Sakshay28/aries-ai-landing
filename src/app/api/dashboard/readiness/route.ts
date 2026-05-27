import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { getTenantById } from '@/lib/tenant/manager';
import { computeReadinessScore } from '@/lib/readiness/score';
import { getRedisClient } from '@/lib/redis/client';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const tenant = await getTenantById(tenantId);
  if (!tenant) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

  // Check published flows
  const { data: flows } = await supabaseAdmin
    .from('automation_flows')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .limit(1);

  // Check knowledge base
  const { data: kbDocs } = await supabaseAdmin
    .from('knowledge_docs')
    .select('id')
    .eq('tenant_id', tenantId)
    .limit(1);

  // Redis connectivity
  let redisConnected = false;
  try {
    const redis = getRedisClient();
    if (redis) { await redis.ping(); redisConnected = true; }
  } catch {}

  const report = computeReadinessScore({
    tenant,
    hasPublishedFlow: (flows?.length ?? 0) > 0,
    hasActiveBillingPlan: tenant.plan_status === 'active' || tenant.plan_status === 'trialing',
    hasKnowledgeBase: (kbDocs?.length ?? 0) > 0,
    redisConnected,
    sentryConfigured: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN),
    webhookVerified: Boolean(process.env.GUPSHUP_APP_SECRET || process.env.META_APP_SECRET),
  });

  return NextResponse.json({ success: true, data: report });
}
