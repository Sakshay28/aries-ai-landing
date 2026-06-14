import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { withTenantGuard } from '@/lib/auth/tenantGuard';

const STATUS_CYCLE: Record<string, string> = {
  available: 'reserved',
  reserved: 'occupied',
  occupied: 'available',
};

export async function POST(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const { tableId } = await req.json();
  if (!tableId) {
    return NextResponse.json({ success: false, error: 'tableId required' }, { status: 400 });
  }

  const { data: table, error: fetchErr } = await supabaseAdmin
    .from('restaurant_tables')
    .select('*')
    .eq('id', tableId)
    .eq('restaurant_id', tenantId)
    .single();

  if (fetchErr || !table) {
    return NextResponse.json({ success: false, error: 'Table not found' }, { status: 404 });
  }

  const nextStatus = STATUS_CYCLE[table.status] || 'available';

  if (nextStatus === 'available') {
    // Free the table — clear all guest data
    const { error } = await supabaseAdmin.rpc('free_table', { p_table_id: tableId });
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Mark linked booking as completed
    if (table.current_booking_id) {
      await supabaseAdmin
        .from('restaurant_bookings')
        .update({ booking_status: 'completed' })
        .eq('id', table.current_booking_id);
    }
  } else if (nextStatus === 'occupied') {
    const { error } = await supabaseAdmin
      .from('restaurant_tables')
      .update({ status: 'occupied', seated_at: new Date().toISOString() })
      .eq('id', tableId);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Mark linked booking as seated (completed)
    if (table.current_booking_id) {
      await supabaseAdmin
        .from('restaurant_bookings')
        .update({ booking_status: 'completed' })
        .eq('id', table.current_booking_id);
    }
  } else {
    // reserved
    const { error } = await supabaseAdmin
      .from('restaurant_tables')
      .update({ status: 'reserved', reserved_at: new Date().toISOString() })
      .eq('id', tableId);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }

  // Fetch updated table
  const { data: updated } = await supabaseAdmin
    .from('restaurant_tables')
    .select('*')
    .eq('id', tableId)
    .single();

  return NextResponse.json({ success: true, data: updated, previousStatus: table.status, newStatus: nextStatus });
}
