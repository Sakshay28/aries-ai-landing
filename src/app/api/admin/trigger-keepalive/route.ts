import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Admin-only endpoint — triggers the staff keepalive for all tenants immediately.
// Use this when windows are already closed and you can't wait for the 4-hour cron.
//
// POST /api/admin/trigger-keepalive
// POST /api/admin/trigger-keepalive  { "tenant_id": "..." }  — single tenant
export async function POST(req: NextRequest) {
  // Auth — platform admin only
  const cookieStore = cookies();
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Cookie: cookieStore.toString() } } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Platform admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const targetTenantId: string | null = body.tenant_id ?? null;

  // Clear heartbeats so the cron doesn't skip recently-failed phones
  if (targetTenantId) {
    await supabaseAdmin
      .from('system_heartbeats')
      .delete()
      .like('key', `staff_keepalive:${targetTenantId}:%`);
  } else {
    await supabaseAdmin
      .from('system_heartbeats')
      .delete()
      .like('key', 'staff_keepalive:%');
  }

  // Delegate to the actual cron route via internal fetch
  const cronUrl = new URL('/api/cron/session-keepalive', req.url);
  const cronRes = await fetch(cronUrl.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });

  const cronData = await cronRes.json().catch(() => ({}));

  return NextResponse.json({
    triggered: true,
    cleared_heartbeats: targetTenantId ? `tenant:${targetTenantId}` : 'all',
    cron_result: cronData,
  });
}
