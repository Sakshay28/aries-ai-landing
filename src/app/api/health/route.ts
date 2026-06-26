import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRedisClient } from '@/lib/redis/client';

interface ServiceStatus {
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  detail?: string;
}

async function checkDB(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const { error } = await supabaseAdmin.from('tenants').select('id').limit(1);
    if (error) return { status: 'down', detail: error.message };
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (e) {
    return { status: 'down', detail: (e as Error).message };
  }
}

async function checkRedis(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const redis = getRedisClient();
    if (!redis) return { status: 'degraded', detail: 'No Redis URL configured' };
    const pong = await redis.ping();
    if (pong !== 'PONG') return { status: 'down', detail: `Unexpected ping response: ${pong}` };
    return { status: 'up', latencyMs: Date.now() - start };
  } catch (e) {
    return { status: 'down', detail: (e as Error).message };
  }
}

async function checkWorkerHeartbeat(): Promise<ServiceStatus> {
  try {
    // Durable DB heartbeat written by the persistent broadcast worker (worker.ts).
    const { data, error } = await supabaseAdmin
      .from('worker_heartbeats')
      .select('worker_id, last_beat_at, meta')
      .order('last_beat_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { status: 'degraded', detail: 'Could not query worker heartbeat' };
    if (!data) return { status: 'degraded', detail: 'No broadcast worker registered — draining via cron backstop only' };
    const age = Date.now() - new Date(data.last_beat_at).getTime();
    const lanes = (data.meta as { activeLanes?: number } | null)?.activeLanes ?? 0;
    if (age > 90_000) return { status: 'down', detail: `Worker ${data.worker_id} last beat ${Math.round(age / 1000)}s ago` };
    return { status: 'up', detail: `${data.worker_id} healthy · ${lanes} active lanes` };
  } catch (e) {
    return { status: 'degraded', detail: (e as Error).message };
  }
}

// Detects "the drain pipeline died" — the failure the old system had no signal for.
async function checkQueueStall(): Promise<ServiceStatus> {
  try {
    const { data: ageSecs } = await supabaseAdmin.rpc('broadcast_queue_oldest_pending_age');
    const secs = Number(ageSecs ?? 0);
    if (secs > 900) return { status: 'down', detail: `Oldest pending broadcast ${Math.round(secs / 60)}m old — drain wedged` };
    if (secs > 300) return { status: 'degraded', detail: `Oldest pending broadcast ${Math.round(secs / 60)}m old` };
    return { status: 'up', detail: secs > 0 ? `Oldest pending ${secs}s` : 'Queue clear' };
  } catch {
    return { status: 'degraded', detail: 'Could not query queue age' };
  }
}

async function checkDLQBacklog(): Promise<ServiceStatus> {
  try {
    const { count } = await supabaseAdmin
      .from('dead_letter_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    const backlog = count ?? 0;
    if (backlog > 50) return { status: 'degraded', detail: `${backlog} jobs in DLQ` };
    return { status: 'up', detail: `${backlog} jobs in DLQ` };
  } catch {
    return { status: 'degraded', detail: 'Could not query DLQ' };
  }
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const [db, redis, worker, dlq, broadcastQueue] = await Promise.all([
    checkDB(),
    checkRedis(),
    checkWorkerHeartbeat(),
    checkDLQBacklog(),
    checkQueueStall(),
  ]);

  const services = { db, redis, worker, dlq, broadcastQueue };

  const allUp = Object.values(services).every(s => s.status === 'up');
  const anyDown = Object.values(services).some(s => s.status === 'down');
  const overallStatus = anyDown ? 'unhealthy' : allUp ? 'healthy' : 'degraded';

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
    },
    { status: anyDown ? 503 : 200 }
  );
}
