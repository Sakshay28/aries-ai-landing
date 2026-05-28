// ═══════════════════════════════════════════════════════════
// 📊 Restaurant Stats
// GET /api/restaurant/stats
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { RestaurantStats } from '@/lib/types';
import { startOfWeek, endOfWeek, startOfMonth, subDays } from 'date-fns';

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Fetch bookings count today
  const { count: bookingsToday } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', tenantId)
    .eq('booking_date', todayStr)
    .eq('booking_status', 'confirmed');

  // 2. Fetch bookings count this week
  const startWeek = startOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split('T')[0];
  const endWeek = endOfWeek(new Date(), { weekStartsOn: 1 }).toISOString().split('T')[0];
  const { count: bookingsThisWeek } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', tenantId)
    .gte('booking_date', startWeek)
    .lte('booking_date', endWeek)
    .eq('booking_status', 'confirmed');

  // 3. Fetch no show rate last 30 days
  const thirtyDaysAgo = subDays(new Date(), 30).toISOString().split('T')[0];
  const { data: recentBookings } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('booking_status')
    .eq('restaurant_id', tenantId)
    .gte('booking_date', thirtyDaysAgo);

  let noShowRate = 0;
  if (recentBookings && recentBookings.length > 0) {
    const total = recentBookings.length;
    const noShows = recentBookings.filter(b => b.booking_status === 'no_show').length;
    noShowRate = Math.round((noShows / total) * 100);
  }

  // 4. Fetch total deposit collected this month (in rupees)
  const startMonth = startOfMonth(new Date()).toISOString().split('T')[0];
  const { data: monthlyDeposits } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('payment_amount')
    .eq('restaurant_id', tenantId)
    .gte('booking_date', startMonth)
    .eq('payment_status', 'paid');

  const totalDeposit = (monthlyDeposits || []).reduce((acc, curr) => acc + (curr.payment_amount || 0), 0);
  const totalDepositRupees = Math.round(totalDeposit / 100);

  // 5. Popular slot calculation
  const { data: popularSlots } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('slot_id, restaurant_slots(slot_time)')
    .eq('restaurant_id', tenantId)
    .eq('booking_status', 'confirmed');

  const slotCounts: Record<string, { count: number; time: string }> = {};
  popularSlots?.forEach((b: any) => {
    const slotTime = b.restaurant_slots?.slot_time;
    if (slotTime) {
      if (!slotCounts[b.slot_id]) {
        slotCounts[b.slot_id] = { count: 0, time: slotTime };
      }
      slotCounts[b.slot_id].count++;
    }
  });

  let mostPopularSlot: string | null = null;
  let maxCount = 0;
  Object.values(slotCounts).forEach(item => {
    if (item.count > maxCount) {
      maxCount = item.count;
      mostPopularSlot = item.time;
    }
  });

  // 6. Upcoming bookings today
  const { data: upcomingToday } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('*, restaurant_slots!inner(slot_time)')
    .eq('restaurant_id', tenantId)
    .eq('booking_date', todayStr)
    .neq('booking_status', 'cancelled')
    .order('created_at', { ascending: true })
    .limit(10);

  const formattedUpcoming = (upcomingToday || []).map(b => ({
    ...b,
    slot_time: (b as any).restaurant_slots?.slot_time || ''
  }));
  formattedUpcoming.sort((a, b) => a.slot_time.localeCompare(b.slot_time));

  const stats: RestaurantStats = {
    bookings_today: bookingsToday || 0,
    bookings_this_week: bookingsThisWeek || 0,
    no_show_rate: noShowRate,
    total_deposit_collected_this_month: totalDepositRupees,
    most_popular_slot: mostPopularSlot,
    upcoming_bookings_today: formattedUpcoming
  };

  return NextResponse.json({ success: true, data: stats });
}
