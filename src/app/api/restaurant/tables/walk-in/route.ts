import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { withTenantGuard } from '@/lib/auth/tenantGuard';

export async function POST(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const { guestCount, guestName } = await req.json();
  if (!guestCount || guestCount < 1) {
    return NextResponse.json({ success: false, error: 'guestCount required (1+)' }, { status: 400 });
  }

  const { data: result, error } = await supabaseAdmin.rpc('assign_best_table', {
    p_restaurant_id: tenantId,
    p_party_size: Number(guestCount),
    p_booking_id: null,
    p_guest_name: guestName || 'Walk-in',
    p_guest_phone: null,
    p_reservation_time: null,
    p_notes: null,
    p_status: 'occupied',
  });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const assignResult = result as { assigned: boolean; table_name?: string; reason?: string };

  if (!assignResult.assigned) {
    return NextResponse.json({
      success: false,
      error: `No available table for ${guestCount} guests`,
    }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    data: {
      tableName: assignResult.table_name,
      guestCount,
    },
  });
}
