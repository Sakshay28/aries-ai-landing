import { NextRequest, NextResponse, after } from 'next/server';
import { SchedulerService } from '@/lib/broadcast/services/scheduler.service';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';
import { TokenBucket, safeThroughputPerSecond } from '@/lib/broadcast/services/rate-limiter';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRedisClient } from '@/lib/redis/client';
import { notifyAdmin } from '@/lib/alerts/admin';

export const dynamic = 'force-dynamic';
// Unchanged (10s) so the deploy is valid on any Vercel plan. We time-box the
// drain loop INTERNALLY to return cleanly before this limit. If you move to a
// plan with a 60s function limit, raise both maxDuration and BROADCAST_DRAIN_BUDGET_MS.
export const maxDuration = 10;

// Stop the parallel drain loop with headroom under maxDuration so the function
// returns cleanly (no mid-flight kill). Tunable via env for larger limits.
const DRAIN_BUDGET_MS = Number(process.env.BROADCAST_DRAIN_BUDGET_MS || 8000);
// How many tenants to drain in parallel per round (one lane each).
const MAX_LANES = Number(process.env.BROADCAST_MAX_LANES || 25);
// Per-tenant batch per round — kept small so each lane returns within the budget
// (a Meta send is ~600ms, so ~10 sequential sends ≈ 6s; lanes run concurrently).
const PER_TENANT_BATCH = Number(process.env.BROADCAST_TENANT_BATCH || 10);

// Circuit breaker: cap self-chain links per rolling minute so a hung / all-failing
// campaign can't self-invoke forever. The pg_cron tick is the steady recovery path.
const CHAIN_LIMIT_PER_MINUTE = 30;
const CHAIN_WINDOW_SECS = 60;
const CHAIN_KEY = 'broadcast:queue:chains_per_min';

async function withinChainBudget(): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true; // fail open if Redis unavailable
  try {
    const count = await redis.incr(CHAIN_KEY);
    if (count === 1) await redis.expire(CHAIN_KEY, CHAIN_WINDOW_SECS);
    if (count > CHAIN_LIMIT_PER_MINUTE) {
      console.warn(`[queue] Circuit breaker: ${count} chains this minute — halting auto-chain. pg_cron will resume.`);
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

// This cron tick (GitHub Actions, every 10 min) is the ONE thing guaranteed to
// run regardless of whether the persistent worker (worker.ts) is deployed or
// alive — worker.ts's own stall/heartbeat checks are useless precisely when the
// worker itself is down. /api/health exposes worker + DLQ status but nothing
// was ever polling it, so a dead worker or a growing DLQ backlog had no path
// to actually paging anyone. Piggyback the check here instead of adding new infra.
async function checkPipelineHealth(): Promise<void> {
  const { data: hb } = await supabaseAdmin
    .from('worker_heartbeats')
    .select('worker_id, last_beat_at')
    .order('last_beat_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (hb) {
    const ageMs = Date.now() - new Date(hb.last_beat_at).getTime();
    if (ageMs > 5 * 60 * 1000) {
      await notifyAdmin({
        dedupeKey: 'broadcast-worker-heartbeat-stale',
        subject: 'Broadcast worker heartbeat is stale',
        summary: `Worker ${hb.worker_id} last reported ${Math.round(ageMs / 1000)}s ago. The persistent per-tenant drain worker may have crashed, been redeployed, or lost its DB connection — broadcasts are now relying solely on this 10-minute cron backstop, which is far slower.`,
        context: { workerId: hb.worker_id, ageSeconds: Math.round(ageMs / 1000) },
      }).catch(() => {});
    }
  }
  // If hb is null, no worker has EVER registered a heartbeat — that's the
  // expected state if the persistent worker was never deployed (see
  // render.yaml). Not alerting on that here since it's a standing deployment
  // decision, not a new failure; /api/health still surfaces it as "degraded".

  const { count: dlqBacklog } = await supabaseAdmin
    .from('dead_letter_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('job_type', 'broadcast');
  if ((dlqBacklog ?? 0) > 20) {
    await notifyAdmin({
      dedupeKey: 'broadcast-dlq-backlog-high',
      subject: `${dlqBacklog} broadcast messages stuck in the Dead Letter Queue`,
      summary: `${dlqBacklog} permanently-failed broadcast sends are sitting unretried in the DLQ. Review at /dashboard/system/dead-letter.`,
      context: { dlqBacklog },
    }).catch(() => {});
  }

  // Campaigns whose scheduled_for time has passed but are still 'scheduled' mean
  // SchedulerService.checkAndDispatchScheduled() has been silently failing on its
  // own internal catch (it never throws — see scheduler.service.ts) for at least
  // one full tick. A single miss recovers next tick; a PERSISTENT failure would
  // otherwise leave campaigns stuck 'scheduled' forever with nothing but a
  // console.error to show for it.
  const { count: overdueScheduled } = await supabaseAdmin
    .from('broadcast_campaigns')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .lt('scheduled_for', new Date(Date.now() - 15 * 60 * 1000).toISOString());
  if ((overdueScheduled ?? 0) > 0) {
    await notifyAdmin({
      dedupeKey: 'broadcast-scheduled-overdue',
      subject: `${overdueScheduled} scheduled broadcast(s) overdue by 15+ minutes`,
      summary: `${overdueScheduled} campaign(s) are still 'scheduled' well past their scheduled_for time. The scheduler dispatch tick may be failing silently — check logs for "Scheduler cron execution failed".`,
      context: { overdueScheduled },
    }).catch(() => {});
  }
}

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.get('Authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  return handler(req);
}
export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error('[queue] CRON_SECRET is not configured.');
    return NextResponse.json({ success: false, error: 'CRON_SECRET configuration missing' }, { status: 500 });
  }
  if (!isAuthorized(req)) {
    console.warn('[queue] Unauthorized attempt to invoke process-queue.');
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  // 0. Pipeline health check — see checkPipelineHealth() for why this lives here.
  await checkPipelineHealth().catch(err => console.error('[queue] health check failed:', err));

  // 1. Dispatch any scheduled campaigns that are now due.
  //    checkAndDispatchScheduled() never throws (it has its own internal catch),
  //    but resetStaleProcessing() previously could — and this handler had NO
  //    top-level try/catch, so a throw here would abort the ENTIRE tick before
  //    reaching step 3 below, meaning zero messages get sent for the whole
  //    10-minute window even though the failure was in an unrelated recovery
  //    step. Isolate each step so one failing sub-task can't block the drain.
  let triggered = 0;
  try {
    triggered = await SchedulerService.checkAndDispatchScheduled();
  } catch (err) {
    console.error('[queue] checkAndDispatchScheduled threw unexpectedly:', err);
  }

  // 2. Recover items left 'processing' by a crashed/killed prior run.
  try {
    await BroadcastEngineService.resetStaleProcessing();
  } catch (err) {
    console.error('[queue] resetStaleProcessing threw unexpectedly:', err);
  }

  // 3. PARALLEL per-tenant drain. Each active tenant gets its own lane (paced by a
  //    per-number token bucket + the engine's Meta 24h tier budget), so one big
  //    campaign can't starve the others. Loop rounds until the time budget is spent.
  const buckets = new Map<string, TokenBucket>();
  let processed = 0;
  let exhaustedBudget = false;

  for (;;) {
    if (Date.now() - start >= DRAIN_BUDGET_MS) { exhaustedBudget = true; break; }

    const { data: tenants, error } = await supabaseAdmin
      .rpc('get_active_broadcast_tenants', { max_tenants: MAX_LANES });
    if (error) {
      console.error('[queue] get_active_broadcast_tenants failed:', error.message);
      break;
    }
    if (!tenants || tenants.length === 0) break;

    const results = await Promise.allSettled(
      (tenants as { tenant_id: string }[]).map(async (t) => {
        let limiter = buckets.get(t.tenant_id);
        if (!limiter) {
          const { data } = await supabaseAdmin
            .from('tenants')
            .select('wa_throughput_per_second')
            .eq('id', t.tenant_id)
            .single();
          const rate = safeThroughputPerSecond(data?.wa_throughput_per_second);
          limiter = new TokenBucket(rate, rate);
          buckets.set(t.tenant_id, limiter);
        }
        return BroadcastEngineService.processTenantQueue(t.tenant_id, PER_TENANT_BATCH, { limiter });
      })
    );

    const round = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? (r.value || 0) : 0), 0);
    processed += round;
    // round === 0 means every active tenant is throttled / tier-capped / drained.
    if (round === 0) break;
  }

  // 4. If we stopped because we ran out of time (not work), chain one more run so a
  //    large backlog keeps draining between pg_cron ticks. Bounded by the breaker.
  if (exhaustedBudget) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    const cronSecret = process.env.CRON_SECRET;
    if (appUrl && cronSecret) {
      after(async () => {
        if (!(await withinChainBudget())) return;
        try {
          await fetch(`${appUrl}/api/broadcast/process-queue`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cronSecret}` },
          });
        } catch (err) {
          console.error('[queue] Failed to chain next run:', err);
        }
      });
    }
  }

  console.log(`[queue] Tick done — triggered: ${triggered}, processed: ${processed}, chained: ${exhaustedBudget}`);
  return NextResponse.json({
    success: true,
    triggeredCampaigns: triggered,
    processedMessages: processed,
  });
}
