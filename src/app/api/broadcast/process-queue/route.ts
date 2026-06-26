import { NextRequest, NextResponse, after } from 'next/server';
import { SchedulerService } from '@/lib/broadcast/services/scheduler.service';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';
import { TokenBucket, safeThroughputPerSecond } from '@/lib/broadcast/services/rate-limiter';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRedisClient } from '@/lib/redis/client';

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

  // 1. Dispatch any scheduled campaigns that are now due.
  const triggered = await SchedulerService.checkAndDispatchScheduled();

  // 2. Recover items left 'processing' by a crashed/killed prior run.
  await BroadcastEngineService.resetStaleProcessing();

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
