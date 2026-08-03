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
    duration_ms: Date.now() - startedAt,
  });
}

export const GET = handler;
export const POST = handler;
