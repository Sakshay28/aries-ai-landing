import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRedisClient } from '@/lib/redis/client';

export async function GET() {
  const status: Record<string, 'up' | 'down'> = { db: 'down', redis: 'down' };
  
  try {
    const { data, error } = await supabaseAdmin.from('tenants').select('id').limit(1);
    if (!error) status.db = 'up';
  } catch {
    status.db = 'down';
  }

  try {
    const redis = getRedisClient();
    if (redis) {
      const ping = await redis.ping();
      if (ping === 'PONG') status.redis = 'up';
    }
  } catch {
    status.redis = 'down';
  }

  const isHealthy = status.db === 'up' && status.redis === 'up';
  
  return NextResponse.json(
    { status: isHealthy ? 'healthy' : 'unhealthy', details: status },
    { status: isHealthy ? 200 : 503 }
  );
}
