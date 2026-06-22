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
  const redis = getRedisClient();
  if (redis) {
    try {
      const result = await redis.set(`dedup:msg:${messageId}`, '1', 'EX', 86400, 'NX');
      if (!result) return true; // Key already existed = duplicate
      return false;
    } catch {
      // Fall through to DB check
    }
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const { data } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('wa_message_id', messageId)
      .limit(1);
    return !!(data && data.length > 0);
  } catch (err) {
    console.error('❌ DB dedup failed:', err);
    return false;
  }
}

// ═══════════════════════════════════════
// OFF-HOURS LOCK — atomic per-conversation, 6h TTL
// ═══════════════════════════════════════
// Returns 'first_notice'  → lock acquired, send the off-hours message
//         'already_sent'  → lock exists,   fall through to AI
//         'use_db_fallback' → Redis unavailable, caller must query DB
export async function acquireOffHoursLock(
  conversationId: string
): Promise<'first_notice' | 'already_sent' | 'use_db_fallback'> {
  const redis = getRedisClient();
  if (!redis) return 'use_db_fallback';
  try {
    const key = `offhours:${conversationId}`;
    const result = await redis.set(key, '1', 'EX', 21600, 'NX'); // 6 hours
    // SET NX returns 'OK' when the key was newly created (we acquired the lock)
    // Returns null when the key already existed (someone else already sent the notice)
    return result ? 'first_notice' : 'already_sent';
  } catch {
    return 'use_db_fallback';
  }
}

// Generic "send this notice at most once per window" gate (SET NX + TTL).
// Same contract as acquireOffHoursLock but with a caller-supplied key, so other
// one-shot notices (e.g. the unreadable-message fallback) don't have to re-implement
// the Redis dance. Returns 'use_db_fallback' when Redis is unavailable so the caller
// can degrade gracefully.
export async function acquireOnceNotice(
  key: string,
  ttlSeconds = 21600 // 6 hours
): Promise<'first_notice' | 'already_sent' | 'use_db_fallback'> {
  const redis = getRedisClient();
  if (!redis) return 'use_db_fallback';
  try {
    const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result ? 'first_notice' : 'already_sent';
  } catch {
    return 'use_db_fallback';
  }
}

// ═══════════════════════════════════════
// GENERIC CACHE — Redis-backed with fallback
// ═══════════════════════════════════════

export async function cacheGet(key: string): Promise<string | null> {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.set(key, value, 'EX', ttlSeconds);
  } catch {}
}

// ═══════════════════════════════════════
// RATE LIMITING — Redis sliding window (INCR + EXPIRE)
// Falls back to in-memory counters when Redis unavailable.
// NOTE: In-memory fallback is per-instance on Vercel serverless — not globally
// enforced across all instances, but still catches burst attacks on warm instances.
// Key convention: tenant:{tenantId}:rl:{action}  or  rl:{action}:{identifier}
// ═══════════════════════════════════════

// In-memory fallback — per-instance only, populated when Redis is unavailable
const _memRl = new Map<string, { count: number; resetAt: number }>();

function _memRateLimit(key: string, maxRequests: number, windowSeconds: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = _memRl.get(key);
  if (!entry || now > entry.resetAt) {
    _memRl.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  entry.count += 1;
  const remaining = Math.max(0, maxRequests - entry.count);
  return { allowed: entry.count <= maxRequests, remaining };
}

export async function checkRedisRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedisClient();
  if (!redis) {
    // Redis unavailable — apply in-memory limit as a per-instance safeguard
    return _memRateLimit(key, maxRequests, windowSeconds);
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
    // Redis error — fall back to in-memory limit
    console.warn('⚠️ Rate limit Redis error (using in-memory fallback):', (err as Error).message);
    return _memRateLimit(key, maxRequests, windowSeconds);
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
