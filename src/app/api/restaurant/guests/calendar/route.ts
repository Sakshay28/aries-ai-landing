// ═══════════════════════════════════════════════════════════
// 📅  Guest Calendar + KPI Data
// GET /api/restaurant/guests/calendar?year=2026&month=6
//
// Returns:
//   days     – unique guest count per date in the month
//   kpis     – today / week / month / total counts + trends
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

function getISTDateStr(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function getWeekStart(today: string): string {
  const d = new Date(today + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function getMonthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + '-01';
}

function trendPct(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return Math.round(((curr - prev) / prev) * 100);
}

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const today      = getISTDateStr();
  const weekStart  = getWeekStart(today);
  const monthStart = getMonthStart(today);

  // Calendar month params
  const year  = parseInt(req.nextUrl.searchParams.get('year')  || today.slice(0, 4));
  const month = parseInt(req.nextUrl.searchParams.get('month') || today.slice(5, 7));
  const calFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const calTo   = new Date(year, month, 0).toISOString().split('T')[0]; // last day of month

  // ── Fetch all non-cancelled bookings ────────────────────────────────────
  const { data: rawBookings } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('customer_phone, booking_date')
    .eq('restaurant_id', tenantId)
    .neq('booking_status', 'cancelled');

  const bookings = rawBookings ?? [];

  // ── Calendar: unique guests per day in selected month ───────────────────
  const calDays: Record<string, Set<string>> = {};
  for (const b of bookings) {
    if (b.booking_date >= calFrom && b.booking_date <= calTo) {
      if (!calDays[b.booking_date]) calDays[b.booking_date] = new Set();
      calDays[b.booking_date].add(b.customer_phone);
    }
  }
  const days: Record<string, number> = {};
  for (const [date, phones] of Object.entries(calDays)) {
    days[date] = phones.size;
  }

  // ── KPIs: unique guest counts ────────────────────────────────────────────
  function uniqueGuests(from: string, to: string): number {
    const phones = new Set<string>();
    for (const b of bookings) {
      if (b.booking_date >= from && b.booking_date <= to) phones.add(b.customer_phone);
    }
    return phones.size;
  }

  const totalGuests = new Set(bookings.map(b => b.customer_phone)).size;

  // Today vs yesterday
  const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().split('T')[0];
  const todayCount     = uniqueGuests(today, today);
  const yesterdayCount = uniqueGuests(yesterday, yesterday);

  // This week vs last week (same days elapsed)
  const weekCount     = uniqueGuests(weekStart, today);
  const lastWeekStart = new Date(new Date(weekStart).getTime() - 7 * 86400000).toISOString().split('T')[0];
  const lastWeekEnd   = new Date(new Date(yesterday).getTime()).toISOString().split('T')[0];
  const lastWeekCount = uniqueGuests(lastWeekStart, lastWeekEnd);

  // This month vs last month (same days elapsed)
  const monthCount      = uniqueGuests(monthStart, today);
  const dayOfMonth      = parseInt(today.slice(8, 10));
  const prevMonthStart  = new Date(new Date(monthStart).getTime() - 86400000).toISOString().split('T')[0].slice(0, 7) + '-01';
  const prevMonthEnd    = `${prevMonthStart.slice(0, 7)}-${String(dayOfMonth).padStart(2, '0')}`;
  const prevMonthCount  = uniqueGuests(prevMonthStart, prevMonthEnd);

  return NextResponse.json({
    success: true,
    days,
    kpis: {
      total: { count: totalGuests,  trend: null },
      today: { count: todayCount,   trend: trendPct(todayCount, yesterdayCount) },
      week:  { count: weekCount,    trend: trendPct(weekCount, lastWeekCount) },
      month: { count: monthCount,   trend: trendPct(monthCount, prevMonthCount) },
    },
  });
}
