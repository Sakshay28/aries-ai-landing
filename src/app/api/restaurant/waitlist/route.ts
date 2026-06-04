// GET  /api/restaurant/waitlist?date=YYYY-MM-DD
// POST /api/restaurant/waitlist

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const date = req.nextUrl.searchParams.get('date') ||
    new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin
    .from('restaurant_waitlist')
    .select('*, restaurant_slots(slot_time)')
    .eq('restaurant_id', tenantId)
    .eq('booking_date', date)
    .in('status', ['waiting', 'notified'])
    .order('position', { ascending: true });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const formatted = (data ?? []).map(w => ({
    ...w,
    slot_time: (w as any).restaurant_slots?.slot_time ?? null,
  }));

  return NextResponse.json({ success: true, data: formatted, tenantId });
}

export async function POST(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const body = await req.json().catch(() => ({}));
  const { customer_name, customer_phone, party_size, booking_date, requested_slot_id, notes } = body;

  if (!customer_name || !customer_phone || !party_size || !booking_date) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }

  // Calculate next position for this date
  const { data: existing } = await supabaseAdmin
    .from('restaurant_waitlist')
    .select('position')
    .eq('restaurant_id', tenantId)
    .eq('booking_date', booking_date)
    .in('status', ['waiting', 'notified'])
    .order('position', { ascending: false })
    .limit(1);

  const nextPosition = (existing?.[0]?.position ?? 0) + 1;
  const cleanPhone = String(customer_phone).replace(/\D/g, '');

  const { data, error } = await supabaseAdmin
    .from('restaurant_waitlist')
    .insert({
      restaurant_id: tenantId,
      customer_name: customer_name.trim(),
      customer_phone: cleanPhone,
      party_size: Math.max(1, parseInt(String(party_size)) || 1),
      booking_date,
      requested_slot_id: requested_slot_id || null,
      position: nextPosition,
      notes: notes?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
