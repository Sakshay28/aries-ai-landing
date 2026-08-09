// ═══════════════════════════════════════════════════════════
// Shiprocket webhook receiver — verify + dedupe + enqueue
// ═══════════════════════════════════════════════════════════
// Unlike Shopify, Shiprocket has no per-tenant routing header (no
// X-Shiprocket-Shop-Domain equivalent) — one static webhook URL + one
// static x-api-key are configured per merchant in Shiprocket's own
// dashboard. So the tenant is resolved from the URL path itself, and the
// x-api-key (a secret we generate, not one Shiprocket issues) is the
// authenticity check, verified with a timing-safe compare.
//
// Same fast-ack-then-async contract as the Shopify webhook: dedupe on a
// UNIQUE constraint (sha256 of the raw body — Shiprocket's docs don't
// document a stable per-delivery id [UNVERIFIED]), enqueue, ack 200, and
// kick a same-request worker drain via after(). MUST await inside after() —
// a fire-and-forget there orphaned jobs for 25 days in production once
// already (src/app/api/webhooks/whatsapp/route.ts:208-220).
// ═══════════════════════════════════════════════════════════

import crypto from 'crypto';
import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptTokenV2 } from '@/lib/security/keyManager';
import { verifyShiprocketApiKey } from '@/lib/shiprocket/webhookVerify';
import { enqueueWebhookEvent, ShiprocketWorker } from '@/lib/shiprocket/queue';
import * as Sentry from '@/lib/sentry-stub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }): Promise<NextResponse> {
  const { tenantId } = await params;
  const rawBody = await req.text();
  const apiKey = req.headers.get('x-api-key'); // [UNVERIFIED header name — confirm against a live webhook config]

  const { data: conn } = await supabaseAdmin
    .from('shiprocket_connections')
    .select('webhook_secret_enc')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!conn) {
    // Unknown/disconnected tenant — ack so Shiprocket stops retrying, there's
    // nothing we can do about it.
    return NextResponse.json({ ok: true, ignored: 'unknown_tenant' }, { status: 200 });
  }

  const secret = decryptTokenV2(conn.webhook_secret_enc);
  if (!verifyShiprocketApiKey(apiKey, secret)) {
    return NextResponse.json({ error: 'invalid_api_key' }, { status: 401 });
  }

  let payload: unknown = null;
  try { payload = JSON.parse(rawBody); } catch { /* leave null */ }
  const dedupeKey = crypto.createHash('sha256').update(rawBody).digest('hex');
  const awb = extractAwb(payload);

  const insert = await supabaseAdmin
    .from('shiprocket_webhook_events')
    .insert({ tenant_id: tenantId, dedupe_key: dedupeKey, awb_code: awb, payload, status: 'received' })
    .select('id')
    .single();

  if (insert.error) {
    if ((insert.error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }
    console.error('❌ [shiprocket webhook] failed to record event', insert.error);
  }

  try {
    await enqueueWebhookEvent({ tenantId, webhookEventId: insert.data?.id || null, payload });
  } catch (err) {
    Sentry.captureException(err, { tags: { component: 'shiprocket-webhook' }, extra: { tenantId } });
    console.error('❌ [shiprocket webhook] failed to enqueue', err);
    return NextResponse.json({ error: 'enqueue_failed' }, { status: 500 });
  }

  after(async () => {
    try {
      await ShiprocketWorker.processQueue(undefined, 5);
    } catch (err) {
      console.error('❌ [shiprocket webhook after()] worker tick failed', err);
    }
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

function extractAwb(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const awb = p.awb ?? p.awb_code ?? null;
  return awb == null ? null : String(awb);
}
