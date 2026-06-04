// ═══════════════════════════════════════════════════════════
// 👥  Restaurant Guests — Date-filtered guest directory
// GET /api/restaurant/guests/list?mode=today|week|month|total
//
// Returns unique guests filtered by booking date range.
// Also returns counts for all 4 modes (for tab badges).
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface GuestListItem {
  customer_phone: string;
  customer_name: string;
  latest_booking_date: string;  // most recent booking in the selected mode
  latest_slot_time: string | null;
}

function getISTDateStr(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function getWeekStart(today: string): string {
  const d = new Date(today + 'T00:00:00');
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function getMonthStart(today: string): string {
  return today.slice(0, 7) + '-01';
}

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const mode = (req.nextUrl.searchParams.get('mode') || 'total') as 'today' | 'week' | 'month' | 'total';

  const today      = getISTDateStr();
  const weekStart  = getWeekStart(today);
  const monthStart = getMonthStart(today);

  // ── Fetch all non-cancelled bookings (compact) ───────────────────────────
  const { data: rawBookings, error } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('customer_phone, customer_name, booking_date, booking_status, restaurant_slots(slot_time)')
    .eq('restaurant_id', tenantId)
    .neq('booking_status', 'cancelled')
    .order('booking_date', { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const bookings = (rawBookings ?? []).map(b => ({
    customer_phone: b.customer_phone,
    customer_name: b.customer_name,
    booking_date: b.booking_date,
    slot_time: (b as any).restaurant_slots?.slot_time ?? null,
  }));

  // ── Helper: get date range filter ────────────────────────────────────────
  function inMode(date: string, m: 'today' | 'week' | 'month' | 'total'): boolean {
    if (m === 'today')  return date === today;
    if (m === 'week')   return date >= weekStart && date <= today;
    if (m === 'month')  return date >= monthStart && date <= today;
    return true; // total
  }

  // ── Build unique guest list per mode ─────────────────────────────────────
  function buildGuestList(m: 'today' | 'week' | 'month' | 'total'): GuestListItem[] {
    const phoneMap = new Map<string, GuestListItem>();
    for (const b of bookings) {
      if (!inMode(b.booking_date, m)) continue;
      if (!phoneMap.has(b.customer_phone)) {
        phoneMap.set(b.customer_phone, {
          customer_phone: b.customer_phone,
          customer_name: b.customer_name,
          latest_booking_date: b.booking_date,
          latest_slot_time: b.slot_time,
        });
      }
    }
    // Sort: for "today" sort by slot time, others by booking date desc
    const list = Array.from(phoneMap.values());
    if (m === 'today') {
      list.sort((a, b) => (a.latest_slot_time ?? '').localeCompare(b.latest_slot_time ?? ''));
    }
    return list;
  }

  const guestList = buildGuestList(mode);

  // ── Counts for all modes (for tab badges) ────────────────────────────────
  const counts = {
    today: buildGuestList('today').length,
    week:  buildGuestList('week').length,
    month: buildGuestList('month').length,
    total: buildGuestList('total').length,
  };

  return NextResponse.json({
    success: true,
    guests: guestList,
    counts,
    tenantId,
  });
}
