import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { parseWebhookPayload, verifySignature } from '@/lib/whatsapp/service';
import { isDuplicateMessage } from '@/lib/redis/client';
import { enqueueWebhookMessage } from '@/lib/webhook/queue';
import { checkRedisRateLimit } from '@/lib/redis/client';

export const maxDuration = 60;
import * as Sentry from '@/lib/sentry-stub';

// ═══════════════════════════════════════
// GET: Webhook Verification
// ═══════════════════════════════════════
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, wa_verify_token')
      .eq('wa_verify_token', token)
      .single();

    if (tenant) {
      console.log(`✅ Webhook verified for tenant ${tenant.id}`);
      await supabaseAdmin
        .from('tenants')
        .update({ wa_webhook_verified: true })
        .eq('id', tenant.id);
      return new NextResponse(challenge, { status: 200 });
    }

    if (token === process.env.GLOBAL_WEBHOOK_VERIFY_TOKEN) {
      console.log('✅ Webhook verified (global token)');
      return new NextResponse(challenge, { status: 200 });
    }
  }

  console.warn('❌ Webhook verification failed');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// ═══════════════════════════════════════
// POST: Incoming Messages
// ═══════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
    const rateLimit = await checkRedisRateLimit(`webhook:wa:${ip}`, 2000, 60); // 2000 per minute per IP for Meta
    if (!rateLimit.allowed) {
      console.warn(`❌ Webhook rate limit exceeded for IP: ${ip}`);
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > 2 * 1024 * 1024) { // 2MB hard limit
      console.warn(`❌ Webhook payload too large: ${contentLength} bytes`);
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');

    // ── Signature verification BEFORE parsing body ──
    // Must validate HMAC before trusting any payload content
    if (process.env.NODE_ENV === 'production') {
      if (!signature) {
        console.warn('❌ Missing webhook signature');
        return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
      }

      const appSecret = process.env.META_APP_SECRET;
      // Fail CLOSED: if META_APP_SECRET is not set or empty, reject all webhooks.
      // An empty string is a misconfiguration — do not silently bypass verification.
      if (!appSecret) {
        console.error('CRITICAL: META_APP_SECRET is not configured — rejecting webhook to prevent spoofing');
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
      }
      if (!verifySignature(rawBody, signature, appSecret)) {
        console.warn('❌ Invalid webhook signature — rejecting');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else if (signature) {
      // Dev mode: still verify if signature is provided
      const appSecret = process.env.META_APP_SECRET;
      if (appSecret && !verifySignature(rawBody, signature, appSecret)) {
        console.warn('❌ Invalid webhook signature — rejecting (dev mode)');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const messages = parseWebhookPayload(body);

    for (const msg of messages) {
      if (msg.isStatusUpdate) {
        console.log(`📋 [${msg.phoneNumberId}] Status: ${msg.status} for ${msg.recipientId}`);
        continue;
      }
      if (msg.isReaction) continue;
      if (!msg.text && !msg.buttonReplyId && !msg.listReplyId) continue;

      // ── Redis-backed deduplication ──
      const duplicate = await isDuplicateMessage(msg.messageId);
      if (duplicate) {
        console.log(`⏩ Duplicate message skipped: ${msg.messageId}`);
        continue;
      }

      // ── Enqueue to BullMQ worker (Decoupled from 200 OK) ──
      enqueueWebhookMessage(msg).catch((err) => {
        console.error(`❌ Failed to enqueue message from ${msg.from}:`, err);
        Sentry.captureException(err);
      });
    }
  } catch (error) {
    console.error('❌ Webhook parse error:', error);
    Sentry.captureException(error);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}
