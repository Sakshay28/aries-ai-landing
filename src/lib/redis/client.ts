// ═══════════════════════════════════════════════════════════
// 🔴 Redis Client — Shared Connection (Upstash Compatible)
// ═══════════════════════════════════════════════════════════
// Single Redis connection used for:
//  - BullMQ job queue (follow-ups, broadcasts)
//  - Webhook deduplication (survives server restarts)
//  - Rate limiting (per-sender, per-tenant)
//  - Tenant config caching
// ═══════════════════════════════════════════════════════════

// ── Redis disabled for Vercel deployment ──
// The worker service (separate repo/container) handles BullMQ + Redis.
// This stub always returns null, triggering built-in fallback paths.

export function getRedisClient(): null {
  return null;
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
// RATE LIMITING — always allow (Redis disabled)
// ═══════════════════════════════════════

export async function checkRedisRateLimit(
  _key: string,
  maxRequests: number,
  _windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  return { allowed: true, remaining: maxRequests };
}
