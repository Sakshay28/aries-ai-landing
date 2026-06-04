import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const { customer_name, customer_phone, party_size, slot_id, special_request, internal_notes, source, booking_status } = body;

  if (!customer_name || !customer_phone || !party_size || !slot_id) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }

  // Verify booking belongs to this tenant
  const { data: existing } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('id')
    .eq('id', id)
    .eq('restaurant_id', tenantId)
    .single();

  if (!existing) {
    return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
  }

  // Verify the new slot belongs to this tenant
  const { data: slot } = await supabaseAdmin
    .from('restaurant_slots')
    .select('id')
    .eq('id', slot_id)
    .eq('restaurant_id', tenantId)
    .single();

  if (!slot) {
    return NextResponse.json({ success: false, error: 'Slot not found' }, { status: 404 });
  }

  const cleanPhone = String(customer_phone).replace(/\D/g, '');
  const guestCount = Math.max(1, parseInt(String(party_size)) || 1);

  const VALID_STATUSES = ['confirmed', 'completed', 'no_show', 'cancelled'];

  const updatePayload: Record<string, unknown> = {
    customer_name: customer_name.trim(),
    customer_phone: cleanPhone,
    party_size: guestCount,
    slot_id,
  };

  if (special_request !== undefined) updatePayload.special_request = special_request || null;
  if (internal_notes !== undefined) updatePayload.internal_notes = internal_notes || null;
  if (source !== undefined) updatePayload.source = source;
  if (booking_status !== undefined && VALID_STATUSES.includes(booking_status)) {
    updatePayload.booking_status = booking_status;
  }

  const { data, error } = await supabaseAdmin
    .from('restaurant_bookings')
    .update(updatePayload)
    .eq('id', id)
    .eq('restaurant_id', tenantId)
    .select()
    .single();

  if (error) {
    console.error('❌ PATCH /api/restaurant/bookings/[id] error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
