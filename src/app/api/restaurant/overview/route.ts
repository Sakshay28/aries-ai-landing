// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant Operations Overview — Today's Service
// GET /api/restaurant/overview
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

function getISTDateStr(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const today = req.nextUrl.searchParams.get('date') || getISTDateStr();

  // ── All today's bookings ─────────────────────────────────────────────────
  const { data: rawBookings } = await supabaseAdmin
    .from('restaurant_bookings')
    .select(`
      id, reservation_id, customer_name, customer_phone,
      party_size, booking_status, slot_id, booking_date,
      special_request, source, created_at, updated_at,
      restaurant_slots!inner(slot_time)
    `)
    .eq('restaurant_id', tenantId)
    .eq('booking_date', today)
    .order('created_at', { ascending: false });

  const allBookings = (rawBookings ?? []).map(b => ({
    ...b,
    slot_time: (b as any).restaurant_slots?.slot_time ?? null,
  }));

  const confirmedBookings = allBookings
    .filter(b => b.booking_status === 'confirmed')
    .sort((a, b) => (a.slot_time ?? '').localeCompare(b.slot_time ?? ''));

  // ── KPI summary ──────────────────────────────────────────────────────────
  const confirmedCount  = confirmedBookings.length;
  const expectedCovers  = confirmedBookings.reduce((s, b) => s + b.party_size, 0);
  const totalReservations = allBookings.length;

  // ── Waitlist count ───────────────────────────────────────────────────────
  const { data: waitlistRaw } = await supabaseAdmin
    .from('restaurant_waitlist')
    .select('id, customer_name, customer_phone, party_size, position, status, notes, restaurant_slots(slot_time)')
    .eq('restaurant_id', tenantId)
    .eq('booking_date', today)
    .in('status', ['waiting', 'notified'])
    .order('position', { ascending: true });

  const waitlistToday = (waitlistRaw ?? []).map(w => ({
    ...w,
    slot_time: (w as any).restaurant_slots?.slot_time ?? null,
  }));

  // ── VIP enrichment for confirmed bookings ────────────────────────────────
  const confirmedPhones = [...new Set(confirmedBookings.map(b => b.customer_phone))];

  let vipRecordsMap: Record<string, { tags: string[]; vip_status: boolean; customer_name: string | null }> = {};

  if (confirmedPhones.length > 0) {
    const { data: guestRecords } = await supabaseAdmin
      .from('restaurant_guests')
      .select('customer_phone, customer_name, tags, vip_status')
      .eq('restaurant_id', tenantId)
      .in('customer_phone', confirmedPhones);

    (guestRecords ?? []).forEach(g => {
      vipRecordsMap[g.customer_phone] = {
        tags: g.tags ?? [],
        vip_status: g.vip_status ?? false,
        customer_name: g.customer_name ?? null,
      };
    });

    // Visit history for VIP phones only
    const vipPhones = Object.entries(vipRecordsMap)
      .filter(([, g]) => g.vip_status || g.tags.includes('VIP'))
      .map(([phone]) => phone);

    if (vipPhones.length > 0) {
      const { data: visits } = await supabaseAdmin
        .from('restaurant_bookings')
        .select('customer_phone, booking_date')
        .eq('restaurant_id', tenantId)
        .in('customer_phone', vipPhones)
        .eq('booking_status', 'completed')
        .order('booking_date', { ascending: false });

      // Attach visit count + last visit to vipRecordsMap
      const visitCountMap: Record<string, { count: number; lastVisit: string | null }> = {};
      (visits ?? []).forEach(v => {
        if (!visitCountMap[v.customer_phone]) {
          visitCountMap[v.customer_phone] = { count: 0, lastVisit: v.booking_date };
        }
        visitCountMap[v.customer_phone].count++;
      });

      vipPhones.forEach(phone => {
        (vipRecordsMap[phone] as any).visit_count = visitCountMap[phone]?.count ?? 0;
        (vipRecordsMap[phone] as any).last_visit  = visitCountMap[phone]?.lastVisit ?? null;
      });
    }
  }

  // Enrich confirmed bookings with VIP data
  const enrichedConfirmed = confirmedBookings.map(b => {
    const g = vipRecordsMap[b.customer_phone];
    const isVip = !!(g?.vip_status || g?.tags?.includes('VIP'));
    return {
      ...b,
      is_vip: isVip,
      vip_tags: g?.tags ?? [],
      visit_count: (g as any)?.visit_count ?? 0,
      last_visit: (g as any)?.last_visit ?? null,
    };
  });

  // VIP-only list for the dedicated section
  const vipGuestsToday = enrichedConfirmed.filter(b => b.is_vip);

  return NextResponse.json({
    success: true,
    tenantId,
    todaySummary: {
      confirmed:          confirmedCount,
      expectedCovers,
      totalReservations,
      waitlistCount:      waitlistToday.length,
    },
    allBookings,
    confirmedBookings: enrichedConfirmed,
    vipGuestsToday,
    waitlistToday,
  });
}
