// ═══════════════════════════════════════════════════════════
// 🍽️  Restaurant — Confirm Booking (Razorpay Webhook)
// POST /api/restaurant/bookings/confirm
// ═══════════════════════════════════════════════════════════
// Called by Razorpay webhook on payment.captured event.
// Steps:
//   1. Verify Razorpay payment signature
//   2. Idempotency check on razorpay_payment_id
//   3. Call confirm_booking RPC (validates lock, writes booking, deletes lock)
//   4. Fire-and-forget: WhatsApp confirmation to customer
//   5. Fire-and-forget: WhatsApp alert to notify_phone
//   6. Fire-and-forget: Google Sheets append
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTextMessage } from '@/lib/meta/service';
import { sendBusinessEvent } from '@/lib/whatsapp/businessNotify';
import { decryptToken } from '@/lib/utils/crypto';
import { appendBookingRow } from '@/lib/integrations/google-sheets';
import { fireIntegrations } from '@/lib/integrations/runner';
import crypto from 'crypto';
import { format } from 'date-fns';

// ── Verify Razorpay webhook signature ─────────────────────────────────────
function verifyRazorpaySignature(
  paymentId: string,
  orderId: string,
  signature: string,
  secret: string
): boolean {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signature, 'utf8')
  );
}

// ── Format slot time for display (19:00:00 → 7:00 PM) ───────────────────
function formatSlotTime(timeStr: string): string {
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return timeStr;
  }
}

// ── Format booking date for display in IST ────────────────────────────────
function formatBookingDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return format(date, 'EEEE, d MMMM yyyy');
  } catch {
    return dateStr;
  }
}

export async function POST(req: NextRequest) {
  // The body can come from Razorpay webhook OR direct call from WhatsApp flow
  let body: {
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
    session_token?: string;
    customer_name?: string;
    customer_phone?: string;
    party_size?: number;
    slot_id?: string;
    booking_date?: string;
    payment_amount?: number;
    restaurant_id?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    session_token,
    customer_name,
    customer_phone,
    party_size,
    slot_id,
    booking_date,
    payment_amount = 0,
    restaurant_id,
  } = body;

  // Validate required fields
  if (
    !razorpay_payment_id ||
    !session_token ||
    !customer_name ||
    !customer_phone ||
    !party_size ||
    !slot_id ||
    !booking_date ||
    !restaurant_id
  ) {
    return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
  }

  // Fetch tenant for Razorpay secret + WA credentials
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select(
      'id, business_name, razorpay_customer_id, wa_phone_number_id, wa_access_token, staff_phone, manager_phone, short_code, modules'
    )
    .eq('id', restaurant_id)
    .single();

  if (tenantErr || !tenant) {
    return NextResponse.json({ success: false, error: 'Restaurant not found' }, { status: 404 });
  }

  const modules = (tenant.modules as string[] | null) ?? [];
  if (!modules.includes('restaurant_reservations')) {
    return NextResponse.json({ success: false, error: 'Restaurant module not enabled' }, { status: 403 });
  }

  // ── Verify Razorpay signature (if provided — skip for test/manual calls) ──
  const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
  if (razorpay_signature && razorpay_order_id && razorpaySecret) {
    const valid = verifyRazorpaySignature(
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      razorpaySecret
    );
    if (!valid) {
      console.warn('⚠️ Razorpay signature verification failed for payment:', razorpay_payment_id);
      return NextResponse.json({ success: false, error: 'Invalid payment signature' }, { status: 400 });
    }
  }

  // ── Call confirm_booking RPC (atomic transaction) ──────────────────────
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('confirm_booking', {
    p_restaurant_id: restaurant_id,
    p_slot_id: slot_id,
    p_booking_date: booking_date,
    p_session_token: session_token,
    p_razorpay_payment_id: razorpay_payment_id,
    p_customer_name: customer_name,
    p_customer_phone: customer_phone,
    p_party_size: party_size,
    p_payment_amount: payment_amount,
  });

  if (rpcError) {
    console.error('❌ confirm_booking RPC error:', rpcError);
    return NextResponse.json({ success: false, error: 'Booking confirmation failed' }, { status: 500 });
  }

  const result = rpcResult as {
    success: boolean;
    idempotent?: boolean;
    reservation_id?: string;
    booking_id?: string;
    reason?: string;
    slot_time?: string;
  };

  if (!result.success) {
    return NextResponse.json({ success: false, reason: result.reason }, { status: 409 });
  }

  // ── Fire-and-forget post-booking actions ──────────────────────────────
  // These are best-effort — booking is already confirmed in DB
  if (!result.idempotent && result.reservation_id) {
    const { reservation_id, slot_time = '', booking_id = '' } = result;
    const displayTime = formatSlotTime(slot_time);
    const displayDate = formatBookingDate(booking_date);
    const businessName = tenant.business_name;
    const waPhoneId = tenant.wa_phone_number_id as string | null;
    const waToken = tenant.wa_access_token
      ? (decryptToken(tenant.wa_access_token as string) as string)
      : null;

    // Log loaded phones for debugging
    console.log(`[confirm] Loaded settings — staff_phone=${(tenant as any).staff_phone ?? 'null'}, manager_phone=${(tenant as any).manager_phone ?? 'null'}`);

    // Fetch full booking for Sheets sync
    const { data: bookingRow } = await supabaseAdmin
      .from('restaurant_bookings')
      .select('*, restaurant_slots!inner(slot_time)')
      .eq('id', booking_id)
      .single();

    // Non-blocking — intentionally not awaited
    void (async () => {
      if (waPhoneId && waToken) {
        // ── 1. Customer confirmation ───────────────────────────────────
        try {
          await sendTextMessage(
            waToken,
            waPhoneId,
            customer_phone,
            `✅ Your reservation at ${businessName} is confirmed!\n\n` +
            `📋 Reservation ID: ${reservation_id}\n` +
            `📅 Date: ${displayDate}\n` +
            `⏰ Time: ${displayTime}\n` +
            `👥 Guests: ${party_size}\n\n` +
            `See you soon! 🍽️`
          );
        } catch (err) {
          console.error('❌ WA customer confirmation failed:', (err as Error).message);
        }

        // ── 2. Staff + Manager notification — guaranteed delivery: durable
        //    dashboard record first, then WhatsApp session-or-template send
        //    with automatic retry (see src/lib/whatsapp/businessNotify.ts) ─
        const staffAlertMsg =
          `🔔 New Booking!\n\n` +
          `👤 ${customer_name}, ${party_size} guests\n` +
          `⏰ ${displayTime} on ${displayDate}\n` +
          `📋 Reservation ID: ${reservation_id}\n` +
          `📞 Phone: ${customer_phone}`;

        const eventResult = await sendBusinessEvent({
          tenantId: restaurant_id,
          eventType: 'booking_confirmation',
          title: `New booking — ${customer_name}`,
          body: staffAlertMsg,
          variables: {
            customer_name, customer_phone,
            reservation_id, guest_count: String(party_size ?? ''),
          },
        });
        console.log(`[confirm] Booking alert — waStatus=${eventResult.waStatus}`);
      }

      // ── 3. Google Sheets sync ──────────────────────────────────────
      if (bookingRow) {
        try {
          await appendBookingRow(restaurant_id, {
            reservation_id,
            customer_name,
            customer_phone,
            party_size: party_size ?? 0,
            slot_time: (bookingRow as Record<string, unknown> & { restaurant_slots?: { slot_time: string } }).restaurant_slots?.slot_time ?? slot_time,
            booking_date,
            booking_status: 'confirmed',
            payment_status: 'paid',
            payment_amount: payment_amount ?? 0,
            created_at: new Date().toISOString(),
          });
        } catch (err) {
          console.error('❌ Google Sheets sync failed (non-critical):', (err as Error).message);
        }
      }

      // ── 4. Integrations (Pabbly / Google Calendar / CRM) ───────────
      fireIntegrations({
        type: 'booking_confirmed',
        tenantId: restaurant_id,
        lead: { name: customer_name, phone: customer_phone },
        details: {
          reservation_id,
          party_size: String(party_size ?? ''),
          date: booking_date,
          time: slot_time || '',
        },
      }).catch(() => {});
    })();
  }

  return NextResponse.json({
    success: true,
    reservation_id: result.reservation_id,
    booking_id: result.booking_id,
    idempotent: result.idempotent ?? false,
  });
}
