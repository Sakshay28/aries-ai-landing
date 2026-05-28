// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant Blocked Dates — List & Block
// GET  /api/restaurant/blocked-dates?month=YYYY-MM
// POST /api/restaurant/blocked-dates
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

// ── GET: List blocked dates for a month ───────────────────────────────────
export async function GET(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const month = req.nextUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7); // YYYY-MM

  // Fetch blocked dates for the selected month scoped to this restaurant
  const { data: blocked, error } = await supabaseAdmin
    .from('restaurant_blocked_dates')
    .select('*')
    .eq('restaurant_id', tenantId)
    .like('blocked_date', `${month}%`);

  if (error) {
    console.error('❌ GET /api/restaurant/blocked-dates DB error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch blocked dates' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: blocked || [] });
}

// ── POST: Block a date (or specific slot on a date) ───────────────────────
export async function POST(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  let body: {
    blocked_date?: string;
    reason?: string;
    specific_slot_id?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { blocked_date, reason, specific_slot_id = null } = body;

  if (!blocked_date || !/^\d{4}-\d{2}-\d{2}$/.test(blocked_date)) {
    return NextResponse.json(
      { success: false, error: 'blocked_date is required (YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  // If specific_slot_id is provided, verify it belongs to this tenant
  if (specific_slot_id) {
    const { data: slot } = await supabaseAdmin
      .from('restaurant_slots')
      .select('id')
      .eq('id', specific_slot_id)
      .eq('restaurant_id', tenantId)
      .single();

    if (!slot) {
      return NextResponse.json({ success: false, error: 'Slot not found' }, { status: 404 });
    }
  }

  const { data: blocked, error } = await supabaseAdmin
    .from('restaurant_blocked_dates')
    .insert({
      restaurant_id: tenantId,
      blocked_date,
      reason: reason || null,
      specific_slot_id: specific_slot_id || null,
    })
    .select()
    .single();

  if (error) {
    // Ignore duplicate — return existing gracefully
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'This date (or slot) is already blocked' },
        { status: 409 }
      );
    }
    console.error('❌ POST /api/restaurant/blocked-dates error:', error);
    return NextResponse.json({ success: false, error: 'Failed to block date' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: blocked }, { status: 201 });
}
