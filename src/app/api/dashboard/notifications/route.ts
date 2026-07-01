// ═══════════════════════════════════════════════════════════
// 🔔 Business Notification Center
// ═══════════════════════════════════════════════════════════
// GET   → list notifications (+ unread count)
// PATCH → mark one / all as read
// Mirrors /api/meta-ads/notifications/route.ts, reading business_notifications
// instead — the durable, guaranteed-delivery record for booking, escalation,
// payment, and staff-keepalive events (see src/lib/whatsapp/businessNotify.ts).
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { withTenantGuard } from '@/lib/auth/tenantGuard';

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
  const unreadOnly = searchParams.get('unread') === '1';

  let query = supabaseAdmin
    .from('business_notifications')
    .select('id, event_type, severity, title, body, payload, wa_status, is_read, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq('is_read', false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count: unreadCount } = await supabaseAdmin
    .from('business_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_read', false);

  return NextResponse.json({ notifications: data || [], unread_count: unreadCount || 0, tenant_id: tenantId });
}

export async function PATCH(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? (body.ids as string[]) : undefined;
  const id = typeof body.id === 'string' ? body.id : undefined;

  let query = supabaseAdmin
    .from('business_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);

  if (id) query = query.eq('id', id);
  else if (ids && ids.length > 0) query = query.in('id', ids);
  // else: mark all read for this tenant

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
