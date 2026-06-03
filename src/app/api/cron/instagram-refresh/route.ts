import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken, encryptToken } from '@/lib/utils/crypto';

export const maxDuration = 10;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  return handler(req);
}
export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch all tenants that have an Instagram token configured
  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select('id, ig_access_token')
    .not('ig_access_token', 'is', null)
    .eq('is_active', true);

  if (error || !tenants || tenants.length === 0) {
    console.log('[cron/instagram-refresh] No tenants with IG tokens found');
    return NextResponse.json({ success: true, refreshed: 0, failed: 0 });
  }

  let refreshed = 0;
  let failed = 0;

  for (const tenant of tenants) {
    try {
      const rawToken = decryptToken(tenant.ig_access_token as string) as string;
      if (!rawToken) continue;

      // Instagram long-lived tokens last 60 days; refresh daily to keep them alive
      const res = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(rawToken)}`
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.warn(`[cron/instagram-refresh] Tenant ${tenant.id} refresh failed:`, body);
        failed++;
        continue;
      }

      const body = await res.json() as { access_token?: string };
      if (!body.access_token) {
        failed++;
        continue;
      }

      const newEncrypted = encryptToken(body.access_token);
      await supabaseAdmin
        .from('tenants')
        .update({ ig_access_token: newEncrypted, updated_at: new Date().toISOString() })
        .eq('id', tenant.id);

      refreshed++;
    } catch (err) {
      console.error(`[cron/instagram-refresh] Tenant ${tenant.id} exception:`, err);
      failed++;
    }
  }

  console.log(`[cron/instagram-refresh] Done — refreshed: ${refreshed}, failed: ${failed}`);
  return NextResponse.json({ success: true, refreshed, failed });
}
