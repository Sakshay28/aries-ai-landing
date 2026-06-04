// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant Bookings — List by Date
// GET /api/restaurant/bookings?date=YYYY-MM-DD&status=confirmed
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { appendBookingRow } from '@/lib/integrations/google-sheets';

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

// ── POST: manually create a booking from the dashboard ────────────────────
export async function POST(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const body = await req.json().catch(() => ({}));
  const { customer_name, customer_phone, party_size, booking_date, slot_id, special_request } = body;

  if (!customer_name || !customer_phone || !party_size || !booking_date || !slot_id) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }

  // Verify slot belongs to this tenant
  const { data: slot } = await supabaseAdmin
    .from('restaurant_slots')
    .select('id, slot_time')
    .eq('id', slot_id)
    .eq('restaurant_id', tenantId)
    .single();

  if (!slot) return NextResponse.json({ success: false, error: 'Slot not found' }, { status: 404 });

  // Fetch tenant short code for reservation ID
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('short_code, business_name')
    .eq('id', tenantId)
    .single();

  const shortCode = (tenant?.short_code || 'RES').toUpperCase();
  const dateStr = booking_date.replace(/-/g, '');
  const seq = Math.floor(Math.random() * 9000) + 1000;
  const reservation_id = `${shortCode}-${dateStr}-${seq}`;
  const cleanPhone = String(customer_phone).replace(/\D/g, '');
  const guestCount = Math.max(1, parseInt(String(party_size)) || 1);

  const { data: booking, error } = await supabaseAdmin
    .from('restaurant_bookings')
    .insert({
      restaurant_id: tenantId,
      slot_id,
      booking_date,
      customer_name: customer_name.trim(),
      customer_phone: cleanPhone,
      party_size: guestCount,
      payment_amount: 0,
      payment_status: 'paid',
      booking_status: 'confirmed',
      reservation_id,
      ...(special_request?.trim() && { special_request: special_request.trim() }),
    })
    .select()
    .single();

  if (error) {
    console.error('❌ POST /api/restaurant/bookings error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Sync to Google Sheets (non-blocking)
  appendBookingRow(tenantId, {
    reservation_id,
    customer_name: customer_name.trim(),
    customer_phone: cleanPhone,
    party_size: guestCount,
    slot_time: slot.slot_time,
    booking_date,
    booking_status: 'confirmed',
    payment_status: 'paid',
    payment_amount: 0,
    created_at: new Date().toISOString(),
  }).catch(() => {});

  return NextResponse.json({ success: true, data: { ...booking, slot_time: slot.slot_time } });
}
