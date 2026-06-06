// ═══════════════════════════════════════════════════════════
// 💳 Razorpay Webhook Handler
// ═══════════════════════════════════════════════════════════
// Receives subscription lifecycle events from Razorpay.
// Security: HMAC-SHA256 verified via x-razorpay-signature.
// Idempotency: skips events already recorded in analytics_events.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyWebhookSignature, handleRazorpayWebhook } from '@/lib/billing/razorpay';
import { fireIntegrations } from '@/lib/integrations/runner';

export async function POST(req: NextRequest) {
  // Read raw body first — signature verification requires the unmodified bytes.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 });
  }

  // ── HMAC-SHA256 signature verification ──
  // Razorpay sends x-razorpay-signature: HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
  // If RAZORPAY_WEBHOOK_SECRET is not set we reject ALL requests to prevent accidental
  // open endpoints in production.
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('❌ RAZORPAY_WEBHOOK_SECRET is not configured — rejecting webhook');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const signature = req.headers.get('x-razorpay-signature') ?? '';
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('❌ Razorpay webhook: invalid signature — possible forgery');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  // ── Parse event ──
  let body: { event: string; payload: Record<string, Record<string, Record<string, unknown>>> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const event = body.event as string;
  const payload = body.payload;

  // ── Booking commitment fee: payment_link.paid → confirm the reservation ──
  if (event === 'payment_link.paid') {
    try {
      const entity = (payload as any)?.payment_link?.entity;
      const reservationId: string | undefined = entity?.reference_id || entity?.notes?.reservation_id;
      const paymentId = (payload as any)?.payment?.entity?.id ?? null;
      if (reservationId) {
        // First fetch the booking to get the tenant (restaurant_id) — never update blindly.
        const { data: existingBooking } = await supabaseAdmin
          .from('restaurant_bookings')
          .select('id, restaurant_id, customer_name, customer_phone, party_size, booking_date, payment_status')
          .eq('reservation_id', reservationId)
          .single();

        // Guard: only update if booking exists and hasn't already been marked paid (idempotency).
        if (!existingBooking || existingBooking.payment_status === 'paid') {
          console.log(`⏩ Razorpay: booking ${reservationId} not found or already paid — skipping.`);
          return NextResponse.json({ status: 'ok' });
        }

        const { data: booking } = await supabaseAdmin
          .from('restaurant_bookings')
          .update({ payment_status: 'paid', razorpay_payment_id: paymentId, booking_status: 'confirmed' })
          .eq('reservation_id', reservationId)
          .eq('restaurant_id', existingBooking.restaurant_id) // ← explicit tenant scope
          .select('restaurant_id, customer_name, customer_phone, party_size, booking_date')
          .single();
        if (booking) {
          fireIntegrations({
            type: 'booking_confirmed',
            tenantId: booking.restaurant_id as string,
            lead: { name: (booking.customer_name as string) || '', phone: (booking.customer_phone as string) || '' },
            details: {
              reservation_id: reservationId,
              party_size: String(booking.party_size ?? ''),
              date: String(booking.booking_date ?? ''),
            },
          }).catch(() => {});
          console.log(`✅ Booking ${reservationId} marked paid + confirmed`);
        }
      }
    } catch (e) {
      console.error('❌ Razorpay booking payment handling failed:', (e as Error).message);
    }
    return NextResponse.json({ status: 'ok' });
  }

  // ── Idempotency: skip events we already processed within the last 24 h ──
  const subscriptionId =
    payload?.subscription?.entity?.id ??
    (payload?.payment?.entity as Record<string, unknown>)?.subscription_id ??
    payload?.payment?.entity?.id;

  if (subscriptionId) {
    const { data: existing } = await supabaseAdmin
      .from('analytics_events')
      .select('id')
      .eq('event_type', `billing_${event}`)
      .eq('metadata->>subscription_id', subscriptionId as string)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
      .single();

    if (existing) {
      console.log(`⏩ Razorpay: idempotent skip — ${event} (${subscriptionId})`);
      return NextResponse.json({ status: 'ok', idempotent: true });
    }
  }

  console.log(`💳 Razorpay event: ${event}`);

  try {
    await handleRazorpayWebhook(event, payload as Record<string, unknown>);
  } catch (err) {
    console.error('❌ Razorpay webhook processing error:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }

  return NextResponse.json({ status: 'ok' });
}
