// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant — Check Seat Availability (Public, API-key Auth)
// POST /api/restaurant/slots/check-availability
// ═══════════════════════════════════════════════════════════
// Authentication: x-api-key header matched against tenants.api_key
// Used by WhatsApp bot — no user session available.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { SlotAvailabilityResult } from '@/lib/types';

// ── Helper: authenticate via api_key header ────────────────────────────────
async function authenticateApiKey(req: NextRequest): Promise<{ tenantId: string } | NextResponse> {
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'Missing x-api-key header' }, { status: 401 });
  }

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('id, modules')
    .eq('api_key', apiKey)
    .eq('is_active', true)
    .single();

  if (error || !tenant) {
    return NextResponse.json({ success: false, error: 'Invalid API key' }, { status: 401 });
  }

  const modules = (tenant.modules as string[] | null) ?? [];
  if (!modules.includes('restaurant_reservations')) {
    return NextResponse.json({ success: false, error: 'Restaurant module not enabled' }, { status: 403 });
  }

  return { tenantId: tenant.id };
}

export async function POST(req: NextRequest) {
  const authResult = await authenticateApiKey(req);
  if (authResult instanceof NextResponse) return authResult;
  const { tenantId } = authResult;

  let body: {
    restaurant_id?: string;
    slot_id?: string;
    booking_date?: string;
    party_size?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { slot_id, booking_date, party_size } = body;

  if (!slot_id || !booking_date || !party_size || party_size < 1) {
    return NextResponse.json(
      { success: false, error: 'slot_id, booking_date, and party_size are required' },
      { status: 400 }
    );
  }

  // ── 1. Check if date is blocked ────────────────────────────────────────
  const { data: blockRecord } = await supabaseAdmin
    .from('restaurant_blocked_dates')
    .select('id, specific_slot_id')
    .eq('restaurant_id', tenantId)
    .eq('blocked_date', booking_date)
    .or(`specific_slot_id.is.null,specific_slot_id.eq.${slot_id}`)
    .limit(1);

  if (blockRecord && blockRecord.length > 0) {
    return NextResponse.json({
      success: true,
      data: { available: false, remaining_seats: 0, error: 'date_blocked' } as SlotAvailabilityResult,
    });
  }

  // ── 2. Check seat availability via RPC (SELECT FOR UPDATE) ─────────────
  const { data: result, error } = await supabaseAdmin.rpc('check_seat_availability', {
    p_slot_id: slot_id,
    p_booking_date: booking_date,
    p_party_size: party_size,
  });

  if (error) {
    console.error('❌ check_seat_availability RPC error:', error);
    return NextResponse.json({ success: false, error: 'Availability check failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: result as SlotAvailabilityResult });
}
