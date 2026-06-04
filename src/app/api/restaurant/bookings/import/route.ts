// ═══════════════════════════════════════════════════════════
// 📥  Restaurant Bookings — Bulk Import (Excel / CSV)
// POST /api/restaurant/bookings/import
//
// Guarantees NO guest name is wasted:
//   • Missing date  → defaults to today (IST)  → "uploaded today = visited today"
//   • Missing slot  → auto-assigned to a default slot (created if none exists)
//   • Every unique phone → upserted into restaurant_guests (profile record)
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withTenantGuard } from '@/lib/auth/tenantGuard';
import { supabaseAdmin } from '@/lib/supabase/admin';

function getISTDateStr(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export async function POST(req: NextRequest) {
  const guard = await withTenantGuard(req);
  if (guard.error) return guard.error;
  const { tenantId } = guard;

  const body = await req.json().catch(() => ({}));
  const { rows } = body as { rows: Array<{
    customer_name: string;
    customer_phone: string;
    party_size?: number;
    booking_date?: string;
    slot_id?: string;
    special_request?: string;
  }> };

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ success: false, error: 'No rows provided' }, { status: 400 });
  }
  if (rows.length > 500) {
    return NextResponse.json({ success: false, error: 'Max 500 rows per import' }, { status: 400 });
  }

  const today = getISTDateStr();

  // ── Resolve a fallback slot once (find active, else create) ───────────────
  let fallbackSlotId: string | null = null;
  const { data: activeSlots } = await supabaseAdmin
    .from('restaurant_slots')
    .select('id')
    .eq('restaurant_id', tenantId)
    .eq('is_active', true)
    .limit(1);
  fallbackSlotId = activeSlots?.[0]?.id ?? null;

  if (!fallbackSlotId) {
    const { data: newSlot } = await supabaseAdmin
      .from('restaurant_slots')
      .insert({
        restaurant_id: tenantId,
        slot_time: '19:30:00',
        day_type: 'both',
        total_capacity: 50,
        is_active: true,
      })
      .select('id')
      .single();
    fallbackSlotId = newSlot?.id ?? null;
  }

  if (!fallbackSlotId) {
    return NextResponse.json({ success: false, error: 'Could not resolve a time slot' }, { status: 500 });
  }

  // Validate that any provided slot_ids belong to this tenant (avoid FK errors)
  const providedSlotIds = [...new Set(rows.map(r => r.slot_id).filter(Boolean) as string[])];
  let validSlotSet = new Set<string>();
  if (providedSlotIds.length > 0) {
    const { data: ownedSlots } = await supabaseAdmin
      .from('restaurant_slots')
      .select('id')
      .eq('restaurant_id', tenantId)
      .in('id', providedSlotIds);
    validSlotSet = new Set((ownedSlots ?? []).map(s => s.id));
  }

  // ── Tenant short code for reservation IDs ────────────────────────────────
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('short_code')
    .eq('id', tenantId)
    .single();
  const shortCode = (tenant?.short_code || 'RES').toUpperCase();

  // ── Build insert rows — nothing gets dropped ─────────────────────────────
  const guestUpserts = new Map<string, string>(); // phone -> name
  let skipped = 0;

  const inserts = rows.flatMap((row) => {
    const cleanPhone = String(row.customer_phone ?? '').replace(/\D/g, '');
    const name = String(row.customer_name ?? '').trim();

    // The only two truly required fields: a name and a usable phone.
    if (!name || cleanPhone.length < 10) { skipped++; return []; }

    // Date: use provided if valid, else default to today (upload day = visit day)
    const bookingDate = /^\d{4}-\d{2}-\d{2}$/.test(row.booking_date ?? '')
      ? (row.booking_date as string)
      : today;

    // Slot: use provided if it belongs to this tenant, else fallback
    const slotId = (row.slot_id && validSlotSet.has(row.slot_id)) ? row.slot_id : fallbackSlotId!;

    const guestCount = Math.max(1, parseInt(String(row.party_size)) || 1);
    const dateStr = bookingDate.replace(/-/g, '');
    const seq = Math.floor(Math.random() * 9000) + 1000;

    guestUpserts.set(cleanPhone, name);

    return [{
      restaurant_id: tenantId,
      slot_id: slotId,
      booking_date: bookingDate,
      customer_name: name,
      customer_phone: cleanPhone,
      party_size: guestCount,
      payment_amount: 0,
      payment_status: 'paid',
      booking_status: 'confirmed',
      reservation_id: `${shortCode}-${dateStr}-${seq}`,
      source: 'import',
      ...(row.special_request?.trim() ? { special_request: row.special_request.trim() } : {}),
    }];
  });

  if (inserts.length === 0) {
    return NextResponse.json({ success: false, error: 'No valid rows — every row was missing a name or phone.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('restaurant_bookings')
    .insert(inserts)
    .select('id, reservation_id, customer_name');

  if (error) {
    console.error('❌ POST /api/restaurant/bookings/import error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // ── Upsert guest profiles (non-blocking) — every imported name kept ──────
  void (async () => {
    try {
      const guestRows = [...guestUpserts.entries()].map(([phone, name]) => ({
        restaurant_id: tenantId,
        customer_phone: phone,
        customer_name: name,
      }));
      if (guestRows.length > 0) {
        await supabaseAdmin
          .from('restaurant_guests')
          .upsert(guestRows, { onConflict: 'restaurant_id,customer_phone', ignoreDuplicates: true });
      }
    } catch { /* non-blocking */ }
  })();

  return NextResponse.json({
    success: true,
    imported: data?.length ?? 0,
    skipped,
    data,
  });
}
