// ═══════════════════════════════════════════════════════════
// 🔒 Restaurant — Lock Seats (Public, API-key Auth)
// POST /api/restaurant/slots/lock
// ═══════════════════════════════════════════════════════════
// Authentication: x-api-key header matched against tenants.api_key
// Called by WhatsApp bot when customer reaches the payment step.
// Locks seats for exactly 8 minutes.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { SeatLockResult } from '@/lib/types';

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

  let body: {
    slot_id?: string;
    booking_date?: string;
    party_size?: number;
    session_token?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { slot_id, booking_date, party_size, session_token } = body;

  if (!slot_id || !booking_date || !party_size || !session_token) {
    return NextResponse.json(
      { success: false, error: 'slot_id, booking_date, party_size, session_token are required' },
      { status: 400 }
    );
  }

  if (party_size < 1) {
    return NextResponse.json({ success: false, error: 'party_size must be at least 1' }, { status: 400 });
  }

  // Lock expires exactly 8 minutes from now
  const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString();

  const { data: result, error } = await supabaseAdmin.rpc('lock_seats', {
    p_slot_id: slot_id,
    p_booking_date: booking_date,
    p_party_size: party_size,
    p_session_token: session_token,
    p_expires_at: expiresAt,
  });

  if (error) {
    console.error('❌ lock_seats RPC error:', error);
    return NextResponse.json({ success: false, error: 'Lock operation failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: result as SeatLockResult });
}
