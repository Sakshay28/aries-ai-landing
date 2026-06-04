// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant Slots — List & Create
// GET  /api/restaurant/slots?date=YYYY-MM-DD
// POST /api/restaurant/slots
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { expireStalePendingBookings } from '@/lib/restaurant/expiry';
import type { RestaurantSlot } from '@/lib/types';

// ── GET: List all active slots (with remaining_capacity for a date) ────────
export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  // Release any unpaid holds past their window so freed seats show as available.
  await expireStalePendingBookings(tenantId);

  const dateStr = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];

  // 1. Fetch active slots
  const { data: slots, error: slotsErr } = await supabaseAdmin
    .from('restaurant_slots')
    .select('*')
    .eq('restaurant_id', tenantId)
    .eq('is_active', true)
    .order('slot_time', { ascending: true });

  if (slotsErr || !slots) {
    console.error('❌ GET /api/restaurant/slots DB error:', slotsErr);
    return NextResponse.json({ success: false, error: 'Failed to fetch slots' }, { status: 500 });
  }

  // 2. Fetch confirmed party sizes sum per slot on this date
  const { data: bookings, error: bookingsErr } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('slot_id, party_size')
    .eq('restaurant_id', tenantId)
    .eq('booking_date', dateStr)
    .eq('booking_status', 'confirmed');

  // 3. Fetch active seat locks sum per slot on this date
  const { data: locks, error: locksErr } = await supabaseAdmin
    .from('seat_locks')
    .select('slot_id, locked_seats')
    .eq('booking_date', dateStr)
    .gt('expires_at', new Date().toISOString());

  // Aggregate bookings and locks by slot_id
  const bookingsMap: Record<string, number> = {};
  bookings?.forEach(b => {
    bookingsMap[b.slot_id] = (bookingsMap[b.slot_id] || 0) + b.party_size;
  });

  const locksMap: Record<string, number> = {};
  locks?.forEach(l => {
    locksMap[l.slot_id] = (locksMap[l.slot_id] || 0) + l.locked_seats;
  });

  const slotsWithCapacity = slots.map(s => {
    const booked = bookingsMap[s.id] || 0;
    const locked = locksMap[s.id] || 0;
    return {
      ...s,
      remaining_capacity: Math.max(0, s.total_capacity - booked - locked)
    };
  });

  return NextResponse.json({ success: true, data: slotsWithCapacity });
}

// ── POST: Create a new slot ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  let body: { slot_time?: string; day_type?: string; total_capacity?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { slot_time, day_type = 'both', total_capacity } = body;

  if (!slot_time || !total_capacity || total_capacity < 1) {
    return NextResponse.json(
      { success: false, error: 'slot_time and total_capacity are required' },
      { status: 400 }
    );
  }

  const validDayTypes = ['weekday', 'weekend', 'both'];
  if (!validDayTypes.includes(day_type)) {
    return NextResponse.json({ success: false, error: 'Invalid day_type' }, { status: 400 });
  }

  const { data: slot, error } = await supabaseAdmin
    .from('restaurant_slots')
    .insert({
      restaurant_id: tenantId,
      slot_time,
      day_type,
      total_capacity,
    })
    .select()
    .single();

  if (error) {
    console.error('❌ POST /api/restaurant/slots error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create slot' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: slot }, { status: 201 });
}
