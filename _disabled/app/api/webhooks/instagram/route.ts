// ═══════════════════════════════════════════════════════════
// 🔗 Instagram Webhook — Multi-Tenant Dispatcher
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { isDuplicateMessage, checkRedisRateLimit } from '@/lib/redis/client';
import { enqueueIGWebhookMessage } from '@/lib/webhook/queue';
import { verifySignature } from '@/lib/whatsapp/service';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.GLOBAL_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown-ip';
    const rateLimit = await checkRedisRateLimit(`webhook:ig:${ip}`, 2000, 60);
    if (!rateLimit.allowed) {
      console.warn(`❌ Instagram webhook rate limit exceeded for IP: ${ip}`);
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
    if (contentLength > 2 * 1024 * 1024) { // 2MB hard limit
      console.warn(`❌ Webhook payload too large: ${contentLength} bytes`);
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');

    if (!signature && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const appSecret = process.env.META_APP_SECRET || '';
    if (signature && appSecret) {
      if (!verifySignature(rawBody, signature, appSecret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);
    
    if (body.object === 'instagram') {
      for (const entry of body.entry) {
        const igPageId = entry.id;

        for (const messagingItem of entry.messaging) {
          if (!messagingItem.message || !messagingItem.message.text) continue;

          const senderId = messagingItem.sender.id;
          const messageText = messagingItem.message.text;
          const messageId = messagingItem.message.mid;
            
          // Deduplication
          const duplicate = await isDuplicateMessage(messageId);
          if (duplicate) {
            console.log(`⏩ Duplicate IG message skipped: ${messageId}`);
            continue;
          }

          enqueueIGWebhookMessage({ igPageId, senderId, messageText, messageId }).catch((err) => {
            console.error(`❌ Failed to enqueue IG message from ${senderId}:`, err);
          });
        }
      }
    }
  } catch (error) {
    console.error('❌ IG Webhook Error:', error);
  }

  return NextResponse.json({ status: 'ok' }, { status: 200 });
}

// Handlers imported from webhook queue
