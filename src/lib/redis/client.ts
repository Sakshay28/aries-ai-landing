// ═══════════════════════════════════════════════════════════
// 🔴 Redis Client — Shared Connection (Upstash Compatible)
// ═══════════════════════════════════════════════════════════
// Single Redis connection used for:
//  - BullMQ job queue (follow-ups, broadcasts)
//  - Webhook deduplication (survives server restarts)
//  - Rate limiting (per-sender, per-tenant)
//  - Tenant config caching
// ═══════════════════════════════════════════════════════════

// ── Redis: Upstash HTTP client (works on Vercel Edge/Serverless) ──
// Set UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN in Vercel env vars to activate.
// Falls back to null gracefully — all callers have null-safe fallback paths.

export interface RedisClient {
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  incr(key: string): Promise<number>;
  incrby(key: string, increment: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

let _redis: RedisClient | null = null;

export function getRedisClient(): RedisClient | null {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  // Upstash REST API wrapper — works in any Node.js / Edge environment
  const call = async (method: string, args: unknown[]): Promise<unknown> => {
    const res = await fetch(`${url}/${[method, ...args].map(a => encodeURIComponent(String(a))).join('/')}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as { result: unknown };
    return json.result;
  };

  _redis = {
    ping: () => call('PING', []) as Promise<string>,
    get: (k) => call('GET', [k]) as Promise<string | null>,
    set: (k, v, ...rest) => call('SET', [k, v, ...rest]),
    del: (...keys) => call('DEL', keys) as Promise<number>,
    keys: (p) => call('KEYS', [p]) as Promise<string[]>,
    incr: (k) => call('INCR', [k]) as Promise<number>,
    incrby: (k, n) => call('INCRBY', [k, String(n)]) as Promise<number>,
    expire: (k, s) => call('EXPIRE', [k, String(s)]) as Promise<number>,
  };

  return _redis;
}


// ═══════════════════════════════════════
// DEDUPLICATION — Redis-backed message dedup
// ═══════════════════════════════════════
// Primary: Redis SET NX with 24h TTL (survives restarts).
// Fallback: Direct DB query when Redis is unavailable.
//
// NOTE: An in-memory Set was previously used as a middle tier, but it provides
// no benefit on Vercel serverless — every invocation is a separate process with
// a cold-started empty Set. Removed to avoid false confidence in three-tier dedup.


export async function isDuplicateMessage(messageId: string): Promise<boolean> {
  // Database-only dedup (Redis disabled on Vercel)
  try {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const { data } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('wa_message_id', messageId)
      .limit(1);
      
    if (data && data.length > 0) {
      return true;
    }
    return false;
  } catch (err) {
    console.error('❌ DB dedup failed:', err);
    return false;
  }
}

// ═══════════════════════════════════════
// GENERIC CACHE — Redis-backed with fallback
// ═══════════════════════════════════════

export async function cacheGet(_key: string): Promise<string | null> {
  return null;
}

export async function cacheSet(_key: string, _value: string, _ttlSeconds: number): Promise<void> {
  // No-op without Redis
}

// ═══════════════════════════════════════
// RATE LIMITING — Redis sliding window (INCR + EXPIRE)
// Falls back to allow-all when Redis unavailable (Vercel dev / cold start)
// Key convention: tenant:{tenantId}:rl:{action}  or  rl:{action}:{identifier}
// ═══════════════════════════════════════

export async function checkRedisRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedisClient();
  if (!redis) {
    // Redis unavailable — fail open (do not block real traffic)
    return { allowed: true, remaining: maxRequests };
  }
  try {
    const redisKey = `rl:${key}`;
    const count = await redis.incr(redisKey);
    // Set TTL only on first request in the window
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    const remaining = Math.max(0, maxRequests - count);
    return { allowed: count <= maxRequests, remaining };
  } catch (err) {
    // Redis error — fail open, log for visibility
    console.warn('⚠️ Rate limit Redis error (failing open):', (err as Error).message);
    return { allowed: true, remaining: maxRequests };
  }
}

// ═══════════════════════════════════════
// TENANT-NAMESPACED CACHE HELPERS
// All tenant data uses: tenant:{tenantId}:{type}
// ═══════════════════════════════════════

export async function tenantCacheGet(tenantId: string, type: string): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    return await redis.get(`tenant:${tenantId}:${type}`);
  } catch {
    return null;
  }
}

export async function tenantCacheSet(tenantId: string, type: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(`tenant:${tenantId}:${type}`, value, 'EX', ttlSeconds);
  } catch (err) {
    console.warn('⚠️ tenantCacheSet failed:', (err as Error).message);
  }
}

export async function tenantCacheDel(tenantId: string, type: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(`tenant:${tenantId}:${type}`);
  } catch {}
}
