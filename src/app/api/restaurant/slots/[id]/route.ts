// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant Slots — Update & Soft-Delete
// PUT    /api/restaurant/slots/[id]
// DELETE /api/restaurant/slots/[id]
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Params = { params: Promise<{ id: string }> };

// ── PUT: Update capacity / day_type ────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;
  const { id } = await params;

  let body: { total_capacity?: number; day_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('restaurant_slots')
    .select('id, restaurant_id')
    .eq('id', id)
    .eq('restaurant_id', tenantId)
    .single();

  if (!existing) {
    return NextResponse.json({ success: false, error: 'Slot not found' }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (body.total_capacity !== undefined) {
    if (body.total_capacity < 1) {
      return NextResponse.json({ success: false, error: 'Capacity must be at least 1' }, { status: 400 });
    }
    updates.total_capacity = body.total_capacity;
  }
  if (body.day_type !== undefined) {
    const valid = ['weekday', 'weekend', 'both'];
    if (!valid.includes(body.day_type)) {
      return NextResponse.json({ success: false, error: 'Invalid day_type' }, { status: 400 });
    }
    updates.day_type = body.day_type;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('restaurant_slots')
    .update(updates)
    .eq('id', id)
    .eq('restaurant_id', tenantId)
    .select()
    .single();

  if (error) {
    console.error('❌ PUT /api/restaurant/slots/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update slot' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: updated });
}

// ── DELETE: Soft-delete (is_active = false) ────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;
  const { id } = await params;

  // Check for future confirmed bookings before deleting
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const { count: futureBookings } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('slot_id', id)
    .eq('restaurant_id', tenantId)
    .eq('booking_status', 'confirmed')
    .gte('booking_date', tomorrowStr);

  const { error } = await supabaseAdmin
    .from('restaurant_slots')
    .update({ is_active: false })
    .eq('id', id)
    .eq('restaurant_id', tenantId);

  if (error) {
    console.error('❌ DELETE /api/restaurant/slots/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete slot' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Slot deactivated',
    warning: (futureBookings ?? 0) > 0
      ? `${futureBookings} future confirmed booking(s) exist for this slot — please handle them manually.`
      : undefined,
  });
}
