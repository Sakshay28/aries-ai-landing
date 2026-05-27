import { NextResponse } from 'next/server';
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
    const redis = getRedisClient();
    if (!redis) return { status: 'degraded', detail: 'Redis unavailable — cannot verify worker' };
    const lastBeat = await redis.get('worker:heartbeat');
    if (!lastBeat) return { status: 'down', detail: 'No heartbeat received — worker may be offline' };
    const age = Date.now() - parseInt(lastBeat, 10);
    if (age > 90_000) return { status: 'down', detail: `Last heartbeat ${Math.round(age / 1000)}s ago` };
    return { status: 'up', detail: `Last heartbeat ${Math.round(age / 1000)}s ago` };
  } catch (e) {
    return { status: 'degraded', detail: (e as Error).message };
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

export async function GET() {
  const [db, redis, worker, dlq] = await Promise.all([
    checkDB(),
    checkRedis(),
    checkWorkerHeartbeat(),
    checkDLQBacklog(),
  ]);

  const services = { db, redis, worker, dlq };

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
