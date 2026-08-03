// ═══════════════════════════════════════════════════════════
// Shopify webhook receiver — verify + dedupe + enqueue
// ═══════════════════════════════════════════════════════════
// Contract with Shopify:
//   - Respond 2xx within ~5 seconds or Shopify retries (up to 19x
//     over 48 hours). We ack fast and process asynchronously.
//   - HMAC-SHA256 over the raw body; secret is the Custom App's
//     shared secret stored on tenants.shopify_webhook_secret
//     (encrypted at rest with keyManager v2).
//   - X-Shopify-Webhook-Id is unique per delivery attempt of a
//     given event, so we use it for idempotency dedupe.
//
// All heavy work is deferred to shopify_sync_jobs so this endpoint
// stays inside the 5s budget even during a burst.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantByShopifyUrl } from '@/lib/tenant/manager';
import { decryptTokenV2 } from '@/lib/security/keyManager';
import { verifyShopifyHmac, domainFromHeader } from '@/lib/shopify/webhookVerify';
import { enqueueWebhookEvent, ShopifyWorker } from '@/lib/shopify/queue';
import * as Sentry from '@/lib/sentry-stub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read body ONCE as text; HMAC is over these exact bytes.
  const rawBody = await req.text();

  const hmac = req.headers.get('x-shopify-hmac-sha256');
  const topic = req.headers.get('x-shopify-topic');            // e.g. 'orders/create'
  const domain = domainFromHeader(req.headers.get('x-shopify-shop-domain'));
  const webhookId = req.headers.get('x-shopify-webhook-id');
  const apiVersion = req.headers.get('x-shopify-api-version');

  if (!hmac || !topic || !domain || !webhookId) {
    return NextResponse.json({ error: 'missing required Shopify headers' }, { status: 400 });
  }

  // Route to tenant by shop domain.
  const tenant = await getTenantByShopifyUrl(domain);
  if (!tenant) {
    // Not our tenant OR tenant disconnected. Ack so Shopify stops retrying —
    // there is nothing we can do about it.
    return NextResponse.json({ ok: true, ignored: 'unknown_tenant' }, { status: 200 });
  }

  const sharedSecret = decryptTokenV2(tenant.shopify_webhook_secret || null);
  if (!sharedSecret) {
    // Misconfiguration — do NOT return 200; force Shopify to retry once we've
    // reconfigured. But log so we notice.
    console.error('❌ [shopify webhook] tenant has no webhook secret', { tenantId: tenant.id, domain });
    return NextResponse.json({ error: 'webhook_secret_missing' }, { status: 500 });
  }

  if (!verifyShopifyHmac(rawBody, hmac, sharedSecret)) {
    // Fail closed — likely spoof or wrong secret. 401 also tells Shopify not
    // to spam retries in the intended way (it will still retry, but our audit
    // logs will show the pattern).
    return NextResponse.json({ error: 'invalid_hmac' }, { status: 401 });
  }

  // Idempotency: insert with UNIQUE(webhook_id). If it fails, we've seen this
  // delivery attempt already — ack and return.
  let payload: unknown = null;
  try { payload = JSON.parse(rawBody); } catch { /* leave null */ }
  const resourceId = extractResourceId(payload);

  const insert = await supabaseAdmin
    .from('shopify_webhook_events')
    .insert({
      tenant_id: tenant.id,
      webhook_id: webhookId,
      topic,
      resource_id: resourceId,
      payload,
      status: 'received',
    })
    .select('id')
    .single();

  if (insert.error) {
    // Unique-violation code is 23505 — that's a duplicate delivery, ack it.
    if ((insert.error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }
    console.error('❌ [shopify webhook] failed to record event', insert.error);
    // Fall through — we still want to try to enqueue, but return 500 so
    // Shopify retries if enqueue also fails.
  }

  try {
    await enqueueWebhookEvent({
      tenantId: tenant.id,
      topic,
      webhookEventId: insert.data?.id || null,
      resourceId,
      payload,
      apiVersion,
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'shopify-webhook', topic }, extra: { tenantId: tenant.id } });
    console.error('❌ [shopify webhook] failed to enqueue', err);
    return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
  }

  // Kick a worker drain AFTER responding so this webhook doesn't wait on it.
  // Vercel keeps `after()` work running past the response — up to the function
  // timeout — which is where our webhook_event gets processed in the common
  // case. The cron endpoint is the safety net for stalled jobs.
  after(async () => {
    try {
      await ShopifyWorker.processQueue(undefined, 5);
    } catch (err) {
      console.error('❌ [shopify webhook after()] worker tick failed', err);
    }
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

function extractResourceId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const id = p.id ?? p.admin_graphql_api_id ?? null;
  return id == null ? null : String(id);
}
