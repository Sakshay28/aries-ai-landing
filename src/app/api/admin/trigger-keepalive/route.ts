import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Admin-only endpoint — triggers the staff keepalive for all tenants immediately.
// Use this when windows are already closed and you can't wait for the 4-hour cron.
//
// POST /api/admin/trigger-keepalive
//   Header: Authorization: Bearer <CRON_SECRET>
//   Body:   {} or { "tenant_id": "..." }
export async function POST(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      .like('key', 'staff_keepalive:%:%');
  }

  // Delegate to the actual cron route
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
