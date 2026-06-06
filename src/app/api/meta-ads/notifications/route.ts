// ═══════════════════════════════════════════════════════════
// 🔔 Meta Ads — Notification Center
// ═══════════════════════════════════════════════════════════
// GET   → list notifications (+ unread count)
// PATCH → mark one / all as read
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireUser, errorResponse } from '@/lib/meta-ads/guard';

export async function GET(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const unreadOnly = searchParams.get('unread') === '1';

    let query = supabaseAdmin
      .from('meta_ads_notifications')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (unreadOnly) query = query.eq('is_read', false);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { count: unreadCount } = await supabaseAdmin
      .from('meta_ads_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_read', false);

    return NextResponse.json({ notifications: data || [], unread_count: unreadCount || 0 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    const body = await req.json().catch(() => ({}));
    const id = body.id as string | undefined;

    let query = supabaseAdmin
      .from('meta_ads_notifications')
      .update({ is_read: true })
      .eq('tenant_id', tenantId);

    if (id) query = query.eq('id', id); // single
    // else: mark all read

    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
