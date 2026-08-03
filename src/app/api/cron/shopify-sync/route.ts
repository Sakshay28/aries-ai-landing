// Cron: drain the Shopify sync queue.
// Runs every N minutes (configure in vercel.json). Also reclaims stuck
// jobs whose worker died mid-processing.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ShopifyWorker } from '@/lib/shopify/queue';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  return auth === `Bearer ${cronSecret}`;
}

async function handler(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Reclaim jobs that a previous worker started but never finished (worker
  // crashed, function timed out). SKIP LOCKED means the reclaim is safe.
  const { data: reclaimed } = await supabaseAdmin.rpc('reclaim_stuck_shopify_jobs', { p_timeout_minutes: 10 });

  // Prune expired order snapshots. snapshot_expires_at is stamped 90 days out
  // at ingest time; anything past that is stale and only inflating egress. We
  // don't count the row-limit precisely — Supabase caps deletes at 1000 rows
  // per call by default, which is plenty for daily cleanup on a single shop.
  let purgedOrders = 0;
  try {
    const { count } = await supabaseAdmin
      .from('shopify_orders')
      .delete({ count: 'exact' })
      .lt('snapshot_expires_at', new Date().toISOString());
    purgedOrders = count ?? 0;
  } catch (err) {
    console.warn('[shopify cron] order snapshot purge failed:', (err as Error).message);
  }

  // Prune old webhook idempotency rows too — the UNIQUE(webhook_id) index is
  // small but the payload column is JSONB and adds up over months.
  let purgedWebhookEvents = 0;
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('shopify_webhook_events')
      .delete({ count: 'exact' })
      .lt('received_at', cutoff);
    purgedWebhookEvents = count ?? 0;
  } catch (err) {
    console.warn('[shopify cron] webhook event purge failed:', (err as Error).message);
  }

  const startedAt = Date.now();
  const totalTarget = 60;
  let processed = 0;
  const deadline = startedAt + 55_000;

  while (Date.now() < deadline && processed < totalTarget) {
    const n = await ShopifyWorker.processQueue(undefined, 20);
    processed += n;
    if (n === 0) break; // queue empty
  }

  return NextResponse.json({
    ok: true,
    processed,
    reclaimed_stuck: reclaimed ?? 0,
    purged_order_snapshots: purgedOrders,
    purged_webhook_events: purgedWebhookEvents,
    duration_ms: Date.now() - startedAt,
  });
}

export const GET = handler;
export const POST = handler;
