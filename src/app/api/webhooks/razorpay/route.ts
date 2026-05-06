// ═══════════════════════════════════════════════════════════
// 💳 Razorpay Webhook Route
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyWebhookSignature, handleRazorpayWebhook } from '@/lib/billing/razorpay';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';

    // Verify signature
    if (process.env.RAZORPAY_WEBHOOK_SECRET && !verifyWebhookSignature(rawBody, signature)) {
      console.warn('❌ Razorpay webhook: invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    const body = JSON.parse(rawBody);
    const event = body.event as string;
    const payload = body.payload as Record<string, Record<string, Record<string, unknown>>>;

    // Idempotency Check
    const subscriptionId = payload?.subscription?.entity?.id || payload?.payment?.entity?.id;
    if (subscriptionId) {
      const { data: existing } = await supabaseAdmin.from('analytics_events')
        .select('id')
        .eq('event_type', `billing_${event}`)
        .eq('metadata->>subscription_id', subscriptionId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .single();
        
      if (existing) {
        console.log(`⏩ Razorpay webhook: Idempotent skip for ${event} (${subscriptionId})`);
        return NextResponse.json({ status: 'ok', idempotent: true });
      }
    }

    console.log(`💳 Razorpay webhook: ${event}`);

    await handleRazorpayWebhook(event, payload);

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('❌ Razorpay webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
