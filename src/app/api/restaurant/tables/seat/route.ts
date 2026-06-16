import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

// Seat guests immediately — either a walk-in (auto or specific table) or
// seating an existing reservation (tableId of a 'reserved' table).
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const tenantId = me.tenant_id;
  const actor = me.email || 'dashboard';

  const body = await req.json().catch(() => ({}));
  const tableId: string | undefined = body.tableId || undefined;
  const guestName: string = (body.guestName || '').trim();
  const guestPhone: string = (body.guestPhone || '').trim();
  const notes: string = (body.notes || '').trim();
  const guestCount = Math.round(Number(body.guestCount));

  if (!Number.isFinite(guestCount) || guestCount < 1 || guestCount > 100) {
    return NextResponse.json({ success: false, error: 'Guest count is required (1+).' }, { status: 400 });
  }

  // Specific table → seat it (works for walk-in onto an available table OR
  // seating a reservation that's currently 'reserved').
  if (tableId) {
    const { data: rpc, error } = await supabaseAdmin.rpc('seat_table', {
      p_restaurant_id: tenantId,
      p_table_id: tableId,
      p_party_size: guestCount,
      p_guest_name: guestName || null,
      p_guest_phone: guestPhone || null,
      p_notes: notes || null,
      p_actor: actor,
    });
    const result = (rpc || {}) as { ok?: boolean; reason?: string; table_name?: string };
    if (error || !result.ok) {
      const reason = result.reason || 'table_unavailable';
      const status = reason === 'table_not_found' ? 404 : 409;
      const msg = reason === 'table_unavailable' ? 'That table is not available to seat.' : (error?.message || 'Could not seat table.');
      return NextResponse.json({ success: false, error: msg, reason }, { status });
    }
    return NextResponse.json({ success: true, data: { tableName: result.table_name } });
  }

  // Auto-assign best-fit available table, mark occupied immediately
  const { data: rpc, error } = await supabaseAdmin.rpc('assign_best_table', {
    p_restaurant_id: tenantId,
    p_party_size: guestCount,
    p_booking_id: null,
    p_guest_name: guestName || 'Walk-in',
    p_guest_phone: guestPhone || null,
    p_reservation_time: null,
    p_notes: notes || null,
    p_status: 'occupied',
  });

  const result = (rpc || {}) as { assigned?: boolean; table_name?: string };
  if (error || !result.assigned) {
    return NextResponse.json(
      { success: false, error: `No available table for ${guestCount} guest${guestCount > 1 ? 's' : ''}.` },
      { status: 409 }
    );
  }
  return NextResponse.json({ success: true, data: { tableName: result.table_name } });
}
