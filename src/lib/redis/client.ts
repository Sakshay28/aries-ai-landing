// ═══════════════════════════════════════════════════════════
// 🔴 Redis Client — Shared Connection (Upstash Compatible)
// ═══════════════════════════════════════════════════════════
// Single Redis connection used for:
//  - BullMQ job queue (follow-ups, broadcasts)
//  - Webhook deduplication (survives server restarts)
//  - Rate limiting (per-sender, per-tenant)
//  - Tenant config caching
// ═══════════════════════════════════════════════════════════

import IORedis from 'ioredis';

// ── Singleton connection ──
let redisInstance: IORedis | null = null;
let connectionFailed = false;

export function getRedisClient(): IORedis | null {
  if (connectionFailed) return null;
  if (redisInstance) return redisInstance;

  const redisUrl = process.env.UPSTASH_REDIS_URL || process.env.REDIS_URL;

  if (!redisUrl) {
    console.warn('⚠️ Redis not configured — falling back to in-memory. Set REDIS_URL or UPSTASH_REDIS_URL.');
    return null;
  }

  try {
    redisInstance = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      family: 0, // Force IPv4 for Upstash compatibility
      retryStrategy: (times) => {
        if (times > 10) return null; // Stop retrying after 10 attempts
        return Math.min(times * 200, 5000); // Exponential backoff
      },
      lazyConnect: true,
    });

    redisInstance.on('error', (err) => {
      console.error('❌ Redis connection error:', err.message);
    });

    redisInstance.on('connect', () => {
      console.log('✅ Redis connected');
    });

    // Connect eagerly
    redisInstance.connect().catch((err) => {
      console.error('❌ Redis initial connect failed:', err.message);
      connectionFailed = true;
      redisInstance = null;
    });

    return redisInstance;
  } catch (err) {
    console.error('❌ Redis client creation failed:', err);
    return null;
  }
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

const DEDUP_PREFIX = 'dedup:wa:';
const DEDUP_TTL_SECONDS = 86400; // 24 hours

export async function isDuplicateMessage(messageId: string): Promise<boolean> {
  const redis = getRedisClient();

  if (redis) {
    try {
      // SETNX returns 1 if key was set (not duplicate), 0 if already exists (duplicate)
      const result = await redis.set(
        `${DEDUP_PREFIX}${messageId}`,
        '1',
        'EX',
        DEDUP_TTL_SECONDS,
        'NX'
      );
      return result === null; // null means key already existed = duplicate
    } catch (err) {
      console.warn('⚠️ Redis dedup failed, falling back to DB:', err);
    }
  }

  // Database fallback when Redis is unavailable
  try {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const { data } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('wa_message_id', messageId)
      .limit(1);
      
    if (data && data.length > 0) {
      console.warn(`⏩ Duplicate detected via DB fallback: ${messageId}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error('❌ DB dedup fallback failed:', err);
    return false; // Let it process, better than dropping messages
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
  } catch {
    // Ignore cache failures
  }
}

// ═══════════════════════════════════════
// RATE LIMITING — Redis-backed per-key
// ═══════════════════════════════════════

// Lua script: atomic INCR + EXPIRE in a single round-trip.
// If the key is new (INCR returns 1), set its TTL. Otherwise leave TTL alone.
// This prevents the edge case where INCR succeeds but EXPIRE fails, leaving
// a key with no TTL that locks out the rate-limit bucket permanently.
const RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export async function checkRedisRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedisClient();
  if (!redis) {
    // Fallback: always allow when Redis is down
    return { allowed: true, remaining: maxRequests };
  }

  try {
    const fullKey = `ratelimit:${key}`;
    const current = await redis.eval(
      RATE_LIMIT_LUA,
      1,
      fullKey,
      windowSeconds.toString()
    ) as number;

    return {
      allowed: current <= maxRequests,
      remaining: Math.max(0, maxRequests - current),
    };
  } catch {
    return { allowed: true, remaining: maxRequests };
  }
}
