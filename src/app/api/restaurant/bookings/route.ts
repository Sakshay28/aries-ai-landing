// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant Bookings — List by Date
// GET /api/restaurant/bookings?date=YYYY-MM-DD&status=confirmed
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
  const statusFilter = req.nextUrl.searchParams.get('status');

  let query = supabaseAdmin
    .from('restaurant_bookings')
    .select('*, restaurant_slots!inner(slot_time)')
    .eq('restaurant_id', tenantId)
    .eq('booking_date', date);

  if (statusFilter) {
    query = query.eq('booking_status', statusFilter);
  }

  const { data: bookings, error } = await query;

  if (error) {
    console.error('❌ GET /api/restaurant/bookings DB error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch bookings' }, { status: 500 });
  }

  // Flatten the slot_time from the join for easy consumption
  const formattedBookings = (bookings || []).map(b => ({
    ...b,
    slot_time: (b as any).restaurant_slots?.slot_time || ''
  }));

  // Sort bookings chronologically by slot_time
  formattedBookings.sort((a, b) => a.slot_time.localeCompare(b.slot_time));

  return NextResponse.json({ success: true, data: formattedBookings });
}
