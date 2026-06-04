// GET  /api/restaurant/guests?phone=91XXX&name=Name
// PATCH /api/restaurant/guests  { phone, tags, notes, vip_status }

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const phone = req.nextUrl.searchParams.get('phone');
  if (!phone) return NextResponse.json({ success: false, error: 'phone required' }, { status: 400 });

  // Fetch booking history + guest record in parallel
  const [bookingsRes, guestRes] = await Promise.all([
    supabaseAdmin
      .from('restaurant_bookings')
      .select('id, reservation_id, booking_date, booking_status, party_size, slot_id, special_request, internal_notes, source, created_at, restaurant_slots!inner(slot_time)')
      .eq('restaurant_id', tenantId)
      .eq('customer_phone', phone)
      .order('booking_date', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('restaurant_guests')
      .select('*')
      .eq('restaurant_id', tenantId)
      .eq('customer_phone', phone)
      .maybeSingle(),
  ]);

  const bookings = (bookingsRes.data ?? []).map(b => ({
    ...b,
    slot_time: (b as any).restaurant_slots?.slot_time ?? null,
  }));

  const totalVisits = bookings.filter(b => b.booking_status === 'completed').length;
  const avgPartySize = bookings.length
    ? Math.round((bookings.reduce((s, b) => s + b.party_size, 0) / bookings.length) * 10) / 10
    : 0;
  const lastVisit = bookings.find(b => b.booking_status === 'completed')?.booking_date ?? null;
  const guestName = req.nextUrl.searchParams.get('name') ?? null;

  return NextResponse.json({
    success: true,
    data: {
      phone,
      name: guestName,
      totalBookings: bookings.length,
      totalVisits,
      lastVisit,
      avgPartySize,
      tags: guestRes.data?.tags ?? [],
      notes: guestRes.data?.notes ?? null,
      vip_status: guestRes.data?.vip_status ?? false,
      bookings,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const body = await req.json().catch(() => ({}));
  const { phone, tags, notes, vip_status, customer_name } = body;

  if (!phone) return NextResponse.json({ success: false, error: 'phone required' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (Array.isArray(tags)) update.tags = tags;
  if (notes !== undefined) update.notes = notes || null;
  if (vip_status !== undefined) update.vip_status = !!vip_status;
  if (customer_name) update.customer_name = customer_name;

  // Upsert guest record
  const { data, error } = await supabaseAdmin
    .from('restaurant_guests')
    .upsert({
      restaurant_id: tenantId,
      customer_phone: phone,
      ...update,
    }, { onConflict: 'restaurant_id,customer_phone' })
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
