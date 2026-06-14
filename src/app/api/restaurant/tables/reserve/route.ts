import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { withTenantGuard } from '@/lib/auth/tenantGuard';

export async function POST(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const { guestName, guestPhone, guestCount, time, notes, tableId } = await req.json();

  if (!guestName || !guestCount || !time) {
    return NextResponse.json(
      { success: false, error: 'guestName, guestCount, and time are required' },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().split('T')[0];

  // Generate reservation ID
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('short_code')
    .eq('id', tenantId)
    .single();

  const shortCode = (tenant?.short_code || 'RES').toUpperCase();
  const dateStr = today.replace(/-/g, '');
  const seq = Math.floor(Math.random() * 9000) + 1000;
  const reservationId = `${shortCode}-${dateStr}-${seq}`;

  // Find or create a matching slot
  const slotTime = normalizeTime(time);
  let slotId: string | null = null;

  const { data: slots } = await supabaseAdmin
    .from('restaurant_slots')
    .select('id, slot_time')
    .eq('restaurant_id', tenantId)
    .eq('is_active', true);

  if (slots && slots.length > 0) {
    const [reqH, reqM] = slotTime.split(':').map(Number);
    const reqMins = reqH * 60 + reqM;
    let minDiff = Infinity;
    for (const s of slots) {
      const [sH, sM] = s.slot_time.split(':').map(Number);
      const diff = Math.abs(sH * 60 + sM - reqMins);
      if (diff < minDiff) { minDiff = diff; slotId = s.id; }
    }
  }

  if (!slotId) {
    const { data: newSlot } = await supabaseAdmin
      .from('restaurant_slots')
      .insert({
        restaurant_id: tenantId,
        slot_time: slotTime,
        day_type: 'both',
        total_capacity: 50,
        is_active: true,
      })
      .select()
      .single();
    if (newSlot) slotId = newSlot.id;
  }

  if (!slotId) {
    return NextResponse.json({ success: false, error: 'Could not resolve time slot' }, { status: 500 });
  }

  // Create booking
  const { data: booking, error: bookingErr } = await supabaseAdmin
    .from('restaurant_bookings')
    .insert({
      restaurant_id: tenantId,
      slot_id: slotId,
      booking_date: today,
      customer_name: guestName,
      customer_phone: guestPhone || '',
      party_size: Number(guestCount),
      booking_status: 'confirmed',
      reservation_id: reservationId,
      source: 'dashboard',
      special_request: notes || null,
    })
    .select()
    .single();

  if (bookingErr) {
    return NextResponse.json({ success: false, error: bookingErr.message }, { status: 500 });
  }

  // Assign table (specific or best available)
  let assignResult: { assigned: boolean; table_name?: string; table_id?: string } | null = null;

  if (tableId) {
    // Assign specific table
    const { error: updateErr } = await supabaseAdmin
      .from('restaurant_tables')
      .update({
        status: 'reserved',
        current_booking_id: booking.id,
        guest_name: guestName,
        guest_phone: guestPhone || null,
        guest_count: Number(guestCount),
        reservation_time: time,
        notes: notes || null,
        reserved_at: new Date().toISOString(),
      })
      .eq('id', tableId)
      .eq('restaurant_id', tenantId)
      .eq('status', 'available');

    if (updateErr) {
      assignResult = { assigned: false };
    } else {
      await supabaseAdmin
        .from('restaurant_bookings')
        .update({ table_id: tableId })
        .eq('id', booking.id);

      const { data: tbl } = await supabaseAdmin
        .from('restaurant_tables')
        .select('name')
        .eq('id', tableId)
        .single();
      assignResult = { assigned: true, table_name: tbl?.name, table_id: tableId };
    }
  } else {
    // Auto-assign best table
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('assign_best_table', {
      p_restaurant_id: tenantId,
      p_party_size: Number(guestCount),
      p_booking_id: booking.id,
      p_guest_name: guestName,
      p_guest_phone: guestPhone || null,
      p_reservation_time: time,
      p_notes: notes || null,
      p_status: 'reserved',
    });

    if (!rpcErr && rpcResult) {
      assignResult = rpcResult as { assigned: boolean; table_name?: string; table_id?: string };
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      reservationId,
      bookingId: booking.id,
      tableName: assignResult?.table_name || null,
      tableAssigned: assignResult?.assigned || false,
    },
  });
}

function normalizeTime(time: string): string {
  // "7:30 PM" → "19:30:00", "19:30" → "19:30:00"
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '19:00:00';
  let h = parseInt(match[1]);
  const m = match[2];
  const ampm = match[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}:00`;
}
