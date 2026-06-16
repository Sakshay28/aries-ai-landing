import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

const CONFLICT_MESSAGES: Record<string, string> = {
  time_conflict: 'Table already reserved during selected slot.',
  table_unavailable: 'That table is no longer available.',
  table_not_found: 'Table not found.',
};

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const tenantId = me.tenant_id;
  const actor = me.email || 'dashboard';

  const body = await req.json().catch(() => ({}));
  const reservationType: 'guest' | 'internal' = body.reservationType === 'internal' ? 'internal' : 'guest';
  const guestName: string = (body.guestName || '').trim();
  const guestPhone: string = (body.guestPhone || '').trim();
  const reservationLabel: string = (body.reservationLabel || '').trim();
  const time: string = body.time;
  const notes: string = (body.notes || '').trim();
  const tableId: string | undefined = body.tableId || undefined;
  const durationMin = clampInt(body.durationMin, 30, 480, 120);
  const date = isISODate(body.date) ? body.date : new Date().toISOString().split('T')[0];

  // Validation by type
  if (reservationType === 'guest' && !guestName) {
    return NextResponse.json({ success: false, error: 'Guest name is required.' }, { status: 400 });
  }
  if (reservationType === 'internal' && !reservationLabel) {
    return NextResponse.json({ success: false, error: 'Reservation label is required.' }, { status: 400 });
  }
  if (!time) {
    return NextResponse.json({ success: false, error: 'Time is required.' }, { status: 400 });
  }

  const partySize = clampInt(body.guestCount, 1, 100, reservationType === 'internal' ? 2 : 0);
  if (!partySize) {
    return NextResponse.json({ success: false, error: 'Guest count is required.' }, { status: 400 });
  }

  const slotTime = normalizeTime(time);            // "19:30:00"
  const reservedMin = toMinutes(slotTime);          // 1170
  const reservedFor = `${date}T${slotTime}`;        // naive local timestamp

  // ── EDIT an existing reservation on a specific table ───────────────────────
  if (body.mode === 'edit') {
    if (!tableId) {
      return NextResponse.json({ success: false, error: 'tableId required to edit.' }, { status: 400 });
    }
    const existingBookingId: string | null = body.bookingId || null;

    // Keep the linked booking in sync (guest reservations only)
    if (reservationType === 'guest' && existingBookingId) {
      await supabaseAdmin
        .from('restaurant_bookings')
        .update({
          customer_name: guestName,
          customer_phone: guestPhone || '',
          party_size: partySize,
          special_request: notes || null,
        })
        .eq('id', existingBookingId)
        .eq('restaurant_id', tenantId);
    }

    const { data: rpc, error } = await supabaseAdmin.rpc('reserve_specific_table', {
      p_restaurant_id: tenantId,
      p_table_id: tableId,
      p_party_size: partySize,
      p_reservation_type: reservationType,
      p_guest_name: reservationType === 'guest' ? guestName : null,
      p_guest_phone: reservationType === 'guest' ? (guestPhone || null) : null,
      p_reservation_label: reservationType === 'internal' ? reservationLabel : null,
      p_booking_date: date,
      p_reserved_min: reservedMin,
      p_duration_min: durationMin,
      p_reserved_for: reservedFor,
      p_time_display: displayTime(time),
      p_notes: notes || null,
      p_booking_id: existingBookingId,
      p_actor: actor,
      p_is_edit: true,
    });
    const result = (rpc || {}) as { ok?: boolean; reason?: string; table_name?: string };
    if (error || !result.ok) {
      const reason = result.reason || 'table_unavailable';
      const status = reason === 'time_conflict' ? 409 : reason === 'table_not_found' ? 404 : 409;
      return NextResponse.json(
        { success: false, error: error?.message || CONFLICT_MESSAGES[reason] || 'Update failed.', reason },
        { status }
      );
    }
    return NextResponse.json({ success: true, data: { tableName: result.table_name, tableId, bookingId: existingBookingId } });
  }

  // ── Guest reservations create a booking record (capacity model + history).
  //    Internal holds do not.
  let bookingId: string | null = null;
  if (reservationType === 'guest') {
    const created = await createGuestBooking({
      tenantId, date, slotTime, guestName, guestPhone, partySize, notes,
    });
    if ('error' in created) {
      return NextResponse.json({ success: false, error: created.error }, { status: 500 });
    }
    bookingId = created.bookingId;
  }

  // ── Assign to a table ──────────────────────────────────────────────────────
  let targetTableId = tableId;

  // Auto-assign: pick best-fit available table (specific table provided → skip)
  if (!targetTableId) {
    if (reservationType === 'guest') {
      // Atomic best-fit assign that also links the booking + logs activity
      const { data: rpc, error } = await supabaseAdmin.rpc('assign_best_table', {
        p_restaurant_id: tenantId,
        p_party_size: partySize,
        p_booking_id: bookingId,
        p_guest_name: guestName,
        p_guest_phone: guestPhone || null,
        p_reservation_time: displayTime(time),
        p_notes: notes || null,
        p_status: 'reserved',
      });
      const result = (rpc || {}) as { assigned?: boolean; table_name?: string; table_id?: string };
      if (error || !result.assigned) {
        if (bookingId) await supabaseAdmin.from('restaurant_bookings').delete().eq('id', bookingId);
        return NextResponse.json(
          { success: false, error: `No available table for ${partySize} guest${partySize > 1 ? 's' : ''}.` },
          { status: 409 }
        );
      }
      return NextResponse.json({
        success: true,
        data: { tableName: result.table_name, tableId: result.table_id, bookingId },
      });
    }
    // Internal auto: find a best-fit table, then reserve it explicitly
    const picked = await pickBestTableId(tenantId, partySize);
    if (!picked) {
      return NextResponse.json(
        { success: false, error: `No available table for ${partySize} guest${partySize > 1 ? 's' : ''}.` },
        { status: 409 }
      );
    }
    targetTableId = picked;
  }

  // Specific table (or resolved internal-auto) → conflict-checked reserve
  const { data: rpc, error } = await supabaseAdmin.rpc('reserve_specific_table', {
    p_restaurant_id: tenantId,
    p_table_id: targetTableId,
    p_party_size: partySize,
    p_reservation_type: reservationType,
    p_guest_name: reservationType === 'guest' ? guestName : null,
    p_guest_phone: reservationType === 'guest' ? (guestPhone || null) : null,
    p_reservation_label: reservationType === 'internal' ? reservationLabel : null,
    p_booking_date: date,
    p_reserved_min: reservedMin,
    p_duration_min: durationMin,
    p_reserved_for: reservedFor,
    p_time_display: displayTime(time),
    p_notes: notes || null,
    p_booking_id: bookingId,
    p_actor: actor,
  });

  const result = (rpc || {}) as { ok?: boolean; reason?: string; table_name?: string };

  if (error || !result.ok) {
    // roll back the orphan booking if we created one
    if (bookingId) await supabaseAdmin.from('restaurant_bookings').delete().eq('id', bookingId);
    const reason = result.reason || 'table_unavailable';
    const status = reason === 'time_conflict' ? 409 : reason === 'table_not_found' ? 404 : 409;
    return NextResponse.json(
      { success: false, error: error?.message || CONFLICT_MESSAGES[reason] || 'Reservation failed.', reason },
      { status }
    );
  }

  return NextResponse.json({
    success: true,
    data: { tableName: result.table_name, tableId: targetTableId, bookingId },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function createGuestBooking(args: {
  tenantId: string; date: string; slotTime: string;
  guestName: string; guestPhone: string; partySize: number; notes: string;
}): Promise<{ bookingId: string } | { error: string }> {
  const { tenantId, date, slotTime, guestName, guestPhone, partySize, notes } = args;

  const { data: tenant } = await supabaseAdmin
    .from('tenants').select('short_code').eq('id', tenantId).single();
  const shortCode = (tenant?.short_code || 'RES').toUpperCase();
  const reservationId = `${shortCode}-${date.replace(/-/g, '')}-${Math.floor(Math.random() * 9000) + 1000}`;

  // Map requested time to nearest existing active slot, else create one
  const slotId = await resolveSlotId(tenantId, slotTime);
  if (!slotId) return { error: 'Could not resolve time slot' };

  const { data: booking, error } = await supabaseAdmin
    .from('restaurant_bookings')
    .insert({
      restaurant_id: tenantId,
      slot_id: slotId,
      booking_date: date,
      customer_name: guestName,
      customer_phone: guestPhone || '',
      party_size: partySize,
      booking_status: 'confirmed',
      reservation_id: reservationId,
      source: 'dashboard',
      special_request: notes || null,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { bookingId: booking.id };
}

async function resolveSlotId(tenantId: string, slotTime: string): Promise<string | null> {
  const { data: slots } = await supabaseAdmin
    .from('restaurant_slots')
    .select('id, slot_time')
    .eq('restaurant_id', tenantId)
    .eq('is_active', true);

  if (slots && slots.length > 0) {
    const reqMins = toMinutes(slotTime);
    let best: string | null = null;
    let minDiff = Infinity;
    for (const s of slots) {
      const diff = Math.abs(toMinutes(s.slot_time) - reqMins);
      if (diff < minDiff) { minDiff = diff; best = s.id; }
    }
    if (best) return best;
  }

  const { data: newSlot } = await supabaseAdmin
    .from('restaurant_slots')
    .insert({ restaurant_id: tenantId, slot_time: slotTime, day_type: 'both', total_capacity: 50, is_active: true })
    .select('id')
    .single();
  return newSlot?.id ?? null;
}

async function pickBestTableId(tenantId: string, partySize: number): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('restaurant_tables')
    .select('id')
    .eq('restaurant_id', tenantId)
    .eq('is_active', true)
    .eq('status', 'available')
    .gte('capacity', partySize)
    .order('capacity', { ascending: true })
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

function normalizeTime(time: string): string {
  // "7:30 PM" → "19:30:00", "19:30" → "19:30:00", "19:30:00" → "19:30:00"
  const m = String(time).match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return '19:00:00';
  let h = parseInt(m[1]);
  const min = m[2];
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}:00`;
}

function displayTime(time: string): string {
  const hhmm = normalizeTime(time).slice(0, 5);
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isISODate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
