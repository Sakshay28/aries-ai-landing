// ═══════════════════════════════════════════════════════════════════════════
// 🚀 BROADCAST WORKER — persistent, per-tenant parallel drain
// ═══════════════════════════════════════════════════════════════════════════
// Runs as a long-lived process on any host (Railway / Render / Fly / EC2):
//
//     npx tsx worker.ts
//
// It drains the Postgres `broadcast_queue` directly (no BullMQ, no Redis broker
// — the Upstash REST client cannot back BullMQ anyway). Each tenant with pending
// work gets its OWN lane that loops independently, so a 50k campaign for one
// tenant can never starve another. Each lane paces sends through a per-number
// TokenBucket and the engine enforces the Meta 24h messaging-tier budget.
//
// Throughput ≈ (active lanes) × (per-number msgs/sec). 50 lanes × 10/sec ≈
// 500/sec; raise BROADCAST_MAX_LANES / wa_throughput_per_second for more.
// ═══════════════════════════════════════════════════════════════════════════

import http from 'http';
import os from 'os';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';
import { SchedulerService } from '@/lib/broadcast/services/scheduler.service';
import { TokenBucket, safeThroughputPerSecond } from '@/lib/broadcast/services/rate-limiter';
import { notifyAdmin } from '@/lib/alerts/admin';
import { GoogleSheetsWorkerService } from '@/lib/integrations/google-sheets-worker';
import { MicrosoftExcelWorkerService } from '@/lib/integrations/microsoft-excel-worker';
import { MediaAnalysisWorkerService } from '@/lib/ai/media-analysis-worker';

const WORKER_ID = process.env.WORKER_ID || `broadcast-worker-${os.hostname()}-${process.pid}`;
const TICK_MS = Number(process.env.BROADCAST_TICK_MS || 1000);
const HEARTBEAT_MS = Number(process.env.BROADCAST_HEARTBEAT_MS || 15_000);
const MAX_LANES = Number(process.env.BROADCAST_MAX_LANES || 50);
const PER_TENANT_BATCH = Number(process.env.BROADCAST_TENANT_BATCH || 50);
const STALL_ALERT_SECONDS = Number(process.env.BROADCAST_STALL_ALERT_SECONDS || 600);
const PORT = Number(process.env.PORT || 3001);

let shuttingDown = false;
const activeLanes = new Map<string, Promise<void>>();
const buckets = new Map<string, TokenBucket>();

console.log(`🚀 Broadcast worker "${WORKER_ID}" starting — maxLanes=${MAX_LANES}, batch=${PER_TENANT_BATCH}`);

// ── Per-number pacer (cached for the process lifetime) ──
async function getBucket(tenantId: string): Promise<TokenBucket> {
  const existing = buckets.get(tenantId);
  if (existing) return existing;
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('wa_throughput_per_second')
    .eq('id', tenantId)
    .single();
  const rate = safeThroughputPerSecond(data?.wa_throughput_per_second);
  const bucket = new TokenBucket(rate, rate); // 1s burst capacity, refill = rate/sec
  buckets.set(tenantId, bucket);
  return bucket;
}

// ── One independent draining lane per tenant ──
function startLane(tenantId: string): void {
  if (activeLanes.has(tenantId)) return;
  const lane = (async () => {
    try {
      const limiter = await getBucket(tenantId);
      for (;;) {
        if (shuttingDown) break;
        const n = await BroadcastEngineService.processTenantQueue(tenantId, PER_TENANT_BATCH, { limiter });
        if (n === 0) break; // nothing claimable (drained, throttled, or tier budget hit)
      }
    } catch (err) {
      console.error(`❌ Lane ${tenantId} crashed:`, (err as Error).message);
    } finally {
      activeLanes.delete(tenantId);
    }
  })();
  activeLanes.set(tenantId, lane);
}

// ── Discover tenants with claimable work and spin up lanes ──
async function dispatchLanes(): Promise<void> {
  const { data: tenants, error } = await supabaseAdmin
    .rpc('get_active_broadcast_tenants', { max_tenants: MAX_LANES });
  if (error) {
    console.error('❌ get_active_broadcast_tenants failed:', error.message);
    return;
  }
  for (const t of (tenants || []) as { tenant_id: string }[]) {
    if (!activeLanes.has(t.tenant_id) && activeLanes.size >= MAX_LANES) continue;
    startLane(t.tenant_id);
  }
}

// ── Durable heartbeat (DB) so the health check works without Redis ──
async function heartbeat(): Promise<void> {
  try {
    await supabaseAdmin.from('worker_heartbeats').upsert({
      worker_id: WORKER_ID,
      last_beat_at: new Date().toISOString(),
      meta: { activeLanes: activeLanes.size, maxLanes: MAX_LANES },
    });
  } catch (err) {
    console.error('❌ Heartbeat write failed:', (err as Error).message);
  }
}

// ── Stall watchdog: alert if the oldest claimable item is aging (drain wedged) ──
async function checkStall(): Promise<void> {
  try {
    const { data: ageSecs } = await supabaseAdmin.rpc('broadcast_queue_oldest_pending_age');
    if (Number(ageSecs ?? 0) > STALL_ALERT_SECONDS) {
      notifyAdmin({
        dedupeKey: 'broadcast-queue-stalled',
        subject: 'Broadcast queue is stalling',
        summary: `Oldest pending broadcast message has been waiting ${Math.round(Number(ageSecs) / 60)} min. The drain may be wedged (Meta outage, all-failing campaign, or worker overload).`,
        context: { oldestPendingSeconds: Number(ageSecs), worker: WORKER_ID, activeLanes: activeLanes.size },
      }).catch(() => {});
    }
  } catch { /* non-critical */ }
}

// ── Main loop ──
async function main(): Promise<void> {
  let lastHeartbeat = 0;
  let lastStallCheck = 0;
  let lastSchedulerTick = 0;
  let lastStaleReset = 0;
  let lastMediaReconcile = 0;

  await heartbeat();

  while (!shuttingDown) {
    const now = Date.now();
    try {
      if (now - lastHeartbeat >= HEARTBEAT_MS) { await heartbeat(); lastHeartbeat = now; }
      if (now - lastStaleReset >= 60_000) { await BroadcastEngineService.resetStaleProcessing().catch(() => {}); lastStaleReset = now; }
      if (now - lastSchedulerTick >= 30_000) { await SchedulerService.checkAndDispatchScheduled().catch(() => {}); lastSchedulerTick = now; }
      if (now - lastStallCheck >= 120_000) { await checkStall(); lastStallCheck = now; }
      if (now - lastMediaReconcile >= 120_000) {
        await MediaAnalysisWorkerService.processQueue(WORKER_ID, 20).catch(err => {
          console.error('❌ Media Analysis Worker error:', err.message || err);
        });
        lastMediaReconcile = now;
      }

      await dispatchLanes();
      await GoogleSheetsWorkerService.processQueue(WORKER_ID, 20).catch(err => {
        console.error('❌ Google Sheets Worker error:', err.message || err);
      });
      await MicrosoftExcelWorkerService.processQueue(WORKER_ID, 20).catch(err => {
        console.error('❌ Microsoft Excel Worker error:', err.message || err);
      });
    } catch (err) {
      console.error('❌ Worker tick error:', (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }

  console.log('🛑 Draining active lanes before exit...');
  await Promise.allSettled([...activeLanes.values()]);
  console.log('✅ Worker shut down cleanly.');
}

// ── Tiny health endpoint (used by container HEALTHCHECK / platform probes) ──
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(shuttingDown ? 503 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: shuttingDown ? 'draining' : 'ok', worker: WORKER_ID, activeLanes: activeLanes.size }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(PORT, () => console.log(`🩺 Worker health endpoint on :${PORT}/health`));

// ── Graceful shutdown ──
function shutdown(signal: string) {
  if (shuttingDown) return;
  console.log(`🛑 ${signal} received — shutting down...`);
  shuttingDown = true;
  server.close();
  setTimeout(() => { console.warn('⏱️ Forced exit after 30s'); process.exit(0); }, 30_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().then(() => process.exit(0)).catch((err) => {
  console.error('💥 Worker fatal error:', err);
  process.exit(1);
});
