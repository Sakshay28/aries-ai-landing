// Cron: drain the Shiprocket sync queue (webhook_event jobs). Backstop only
// — the webhook route's after() self-drain is the primary path; this exists
// for jobs that don't finish before the function suspends, and to reclaim
// jobs whose worker died mid-processing.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ShiprocketWorker } from '@/lib/shiprocket/queue';

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

  const { data: reclaimed } = await supabaseAdmin.rpc('reclaim_stuck_shiprocket_jobs', { p_timeout_minutes: 10 });

  let purgedWebhookEvents = 0;
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from('shiprocket_webhook_events')
      .delete({ count: 'exact' })
      .lt('received_at', cutoff);
    purgedWebhookEvents = count ?? 0;
  } catch (err) {
    console.warn('[shiprocket cron] webhook event purge failed:', (err as Error).message);
  }

  const startedAt = Date.now();
  const totalTarget = 60;
  let processed = 0;
  const deadline = startedAt + 55_000;

  while (Date.now() < deadline && processed < totalTarget) {
    const n = await ShiprocketWorker.processQueue(undefined, 20);
    processed += n;
    if (n === 0) break; // queue empty
  }

  return NextResponse.json({
    ok: true,
    processed,
    reclaimed_stuck: reclaimed ?? 0,
    purged_webhook_events: purgedWebhookEvents,
    duration_ms: Date.now() - startedAt,
  });
}

export const GET = handler;
export const POST = handler;
