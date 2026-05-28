// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant Bookings — Update Status
// PATCH /api/restaurant/bookings/[id]/status
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;
  const { id } = await params;

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { status } = body;
  const allowedStatuses = ['no_show', 'completed', 'cancelled'];

  if (!status || !allowedStatuses.includes(status)) {
    return NextResponse.json(
      { success: false, error: `status must be one of: ${allowedStatuses.join(', ')}` },
      { status: 400 }
    );
  }

  // Verify ownership before update
  const { data: existing } = await supabaseAdmin
    .from('restaurant_bookings')
    .select('id, restaurant_id, booking_status')
    .eq('id', id)
    .eq('restaurant_id', tenantId)
    .single();

  if (!existing) {
    return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('restaurant_bookings')
    .update({ booking_status: status })
    .eq('id', id)
    .eq('restaurant_id', tenantId)
    .select()
    .single();

  if (error) {
    console.error('❌ PATCH /api/restaurant/bookings/[id]/status error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update booking status' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: updated });
}
