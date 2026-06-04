// PATCH /api/restaurant/waitlist/[id]
// Update status: notified | converted | removed

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const { status, notes } = body;

  const VALID = ['waiting', 'notified', 'converted', 'removed'];
  if (status && !VALID.includes(status)) {
    return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (status) update.status = status;
  if (notes !== undefined) update.notes = notes || null;

  const { data, error } = await supabaseAdmin
    .from('restaurant_waitlist')
    .update(update)
    .eq('id', id)
    .eq('restaurant_id', tenantId)
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
