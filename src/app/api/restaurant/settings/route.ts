// Restaurant settings — booking commitment fee + unpaid-hold window.
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

const CAN_EDIT = ['owner', 'admin', 'manager'];

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabaseAdmin
    .from('tenants')
    .select('booking_fee_per_person, booking_hold_minutes')
    .eq('id', me.tenant_id)
    .single();

  return NextResponse.json({
    success: true,
    booking_fee_per_person: data?.booking_fee_per_person ?? 0,
    booking_hold_minutes: data?.booking_hold_minutes ?? 20,
    can_edit: CAN_EDIT.includes(me.role),
  });
}

export async function PATCH(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!CAN_EDIT.includes(me.role)) {
    return NextResponse.json({ error: 'Only owners, admins and managers can change this.' }, { status: 403 });
  }

  const body = await req.json();
  const updates: Record<string, number> = {};
  if (body.booking_fee_per_person !== undefined) {
    updates.booking_fee_per_person = Math.max(0, Math.min(10000, Math.round(Number(body.booking_fee_per_person) || 0)));
  }
  if (body.booking_hold_minutes !== undefined) {
    updates.booking_hold_minutes = Math.max(5, Math.min(240, Math.round(Number(body.booking_hold_minutes) || 20)));
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('tenants')
    .update(updates)
    .eq('id', me.tenant_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, ...updates });
}
