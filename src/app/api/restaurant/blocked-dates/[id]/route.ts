// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant Blocked Dates — Unblock
// DELETE /api/restaurant/blocked-dates/[id]
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;
  const { id } = await params;

  const { error, count } = await supabaseAdmin
    .from('restaurant_blocked_dates')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('restaurant_id', tenantId);

  if (error) {
    console.error('❌ DELETE /api/restaurant/blocked-dates/[id] error:', error);
    return NextResponse.json({ success: false, error: 'Failed to unblock date' }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json({ success: false, error: 'Blocked date not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: 'Date unblocked' });
}
