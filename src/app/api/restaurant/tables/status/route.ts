import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

type Action = 'free' | 'free_to_cleaning' | 'available' | 'cleaning' | 'block' | 'unblock' | 'cancel';

const REASONS: Record<string, string> = {
  table_busy: 'Free or cancel the current guest/reservation first.',
  table_not_found: 'Table not found.',
  invalid_status: 'Invalid status change.',
};

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const tenantId = me.tenant_id;
  const actor = me.email || 'dashboard';

  const body = await req.json().catch(() => ({}));
  const tableId: string = body.tableId;
  const action: Action = body.action;
  const reason: string | null = body.reason || null;

  if (!tableId || !action) {
    return NextResponse.json({ success: false, error: 'tableId and action required' }, { status: 400 });
  }

  // Verify ownership (RPCs are service-role; enforce tenant scoping here)
  const { data: table } = await supabaseAdmin
    .from('restaurant_tables')
    .select('id, name, status, current_booking_id, guest_name, guest_phone, guest_count')
    .eq('id', tableId)
    .eq('restaurant_id', tenantId)
    .maybeSingle();

  if (!table) {
    return NextResponse.json({ success: false, error: 'Table not found' }, { status: 404 });
  }

  switch (action) {
    case 'free':
    case 'free_to_cleaning': {
      const toStatus = action === 'free_to_cleaning' ? 'cleaning' : 'available';
      const { data: rpc, error } = await supabaseAdmin.rpc('free_table', {
        p_table_id: tableId,
        p_to_status: toStatus,
        p_actor: actor,
      });
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      // Complete the linked booking (guest actually dined)
      if (table.current_booking_id) {
        await supabaseAdmin
          .from('restaurant_bookings')
          .update({ booking_status: 'completed' })
          .eq('id', table.current_booking_id);
      }
      return NextResponse.json({ success: true, data: rpc });
    }

    case 'cancel': {
      // Cancellation must NOT count as a visit or trigger a review request.
      const { error } = await supabaseAdmin
        .from('restaurant_tables')
        .update({
          status: 'available',
          reservation_type: 'guest',
          reservation_label: null,
          reserved_for: null,
          current_booking_id: null,
          guest_name: null,
          guest_phone: null,
          guest_count: null,
          reservation_time: null,
          notes: null,
          reserved_at: null,
          seated_at: null,
        })
        .eq('id', tableId)
        .eq('restaurant_id', tenantId);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

      if (table.current_booking_id) {
        await supabaseAdmin
          .from('restaurant_bookings')
          .update({ booking_status: 'cancelled' })
          .eq('id', table.current_booking_id);
      }
      await supabaseAdmin.from('restaurant_table_activity').insert({
        restaurant_id: tenantId,
        table_id: tableId,
        table_name: table.name,
        action: 'cancelled',
        actor,
        guest_name: table.guest_name,
        guest_phone: table.guest_phone,
        guest_count: table.guest_count,
        from_status: table.status,
        to_status: 'available',
      });
      return NextResponse.json({ success: true });
    }

    case 'available':
    case 'cleaning':
    case 'block':
    case 'unblock': {
      const toStatus = action === 'block' ? 'blocked' : action === 'unblock' ? 'available' : action;
      const { data: rpc, error } = await supabaseAdmin.rpc('set_table_status', {
        p_table_id: tableId,
        p_to_status: toStatus,
        p_reason: reason,
        p_actor: actor,
      });
      const result = (rpc || {}) as { ok?: boolean; reason?: string };
      if (error || !result.ok) {
        const r = result.reason || 'invalid_status';
        return NextResponse.json(
          { success: false, error: error?.message || REASONS[r] || 'Status change failed.', reason: r },
          { status: r === 'table_not_found' ? 404 : 409 }
        );
      }
      return NextResponse.json({ success: true, data: rpc });
    }

    default:
      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  }
}
