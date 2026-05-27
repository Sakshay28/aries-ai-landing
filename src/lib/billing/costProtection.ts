// ═══════════════════════════════════════════════════════════
// 💰 AI Cost Protection
// ═══════════════════════════════════════════════════════════
// Tracks AI token usage per tenant (daily + monthly).
// Blocks AI execution when limits are exceeded.
// Emits warnings at 80% and 95% thresholds.
// ═══════════════════════════════════════════════════════════

import { getRedisClient } from '@/lib/redis/client';
import { supabaseAdmin } from '@/lib/supabase/admin';

// ─── Plan limits (INR cost equivalent via token mapping) ─────
// Approx: ₹1 ≈ 100k Gemini 2.0 Flash tokens (very rough)
const MONTHLY_TOKEN_LIMITS: Record<string, number> = {
  starter:    50_000_000,  // ≈ ₹500/mo
  growth:     500_000_000, // ≈ ₹5,000/mo
  pro:        Infinity,
  enterprise: Infinity,
};

export const AI_FALLBACK_MESSAGE =
  "AI assistant is temporarily unavailable. Our team will assist you shortly! 🙏";

export type CostStatus = 'ok' | 'warning_80' | 'warning_95' | 'exceeded';

export interface CostCheckResult {
  allowed: boolean;
  status: CostStatus;
  usedTokens: number;
  limitTokens: number;
  percentUsed: number;
}

// ─── Check if AI is allowed for this tenant ──────────────────
export async function checkAICostLimit(tenantId: string, plan: string): Promise<CostCheckResult> {
  const limit = MONTHLY_TOKEN_LIMITS[plan] ?? MONTHLY_TOKEN_LIMITS['starter'];

  if (limit === Infinity) {
    return { allowed: true, status: 'ok', usedTokens: 0, limitTokens: Infinity, percentUsed: 0 };
  }

  const usedTokens = await getMonthlyTokenUsage(tenantId);
  const percentUsed = (usedTokens / limit) * 100;

  let status: CostStatus = 'ok';
  if (percentUsed >= 100) status = 'exceeded';
  else if (percentUsed >= 95) status = 'warning_95';
  else if (percentUsed >= 80) status = 'warning_80';

  if (status === 'exceeded') {
    console.warn(`🚨 AI cost limit exceeded: tenant=${tenantId} used=${usedTokens} limit=${limit}`);
  }

  return {
    allowed: status !== 'exceeded',
    status,
    usedTokens,
    limitTokens: limit,
    percentUsed: Math.round(percentUsed),
  };
}

// ─── Get monthly token usage ──────────────────────────────────
// Reads from Redis first (fast), falls back to DB sum
async function getMonthlyTokenUsage(tenantId: string): Promise<number> {
  const redis = getRedisClient();
  const month = new Date().toISOString().slice(0, 7); // "2026-05"
  const redisKey = `ai:tokens:${tenantId}:${month}`;

  if (redis) {
    try {
      const cached = await redis.get(redisKey);
      if (cached !== null) return parseInt(cached, 10);
    } catch {}
  }

  // Fallback: sum from DB
  try {
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('ai_tokens_this_month')
      .eq('id', tenantId)
      .single();
    return (data as any)?.ai_tokens_this_month ?? 0;
  } catch {
    return 0; // fail open — don't block on DB error
  }
}

// ─── Record token usage after a model call ───────────────────
export async function recordAITokenUsage(tenantId: string, tokens: number): Promise<void> {
  const redis = getRedisClient();
  const month = new Date().toISOString().slice(0, 7);
  const redisKey = `ai:tokens:${tenantId}:${month}`;

  if (redis) {
    try {
      const count = await redis.incrby(redisKey, tokens);
      if (count === tokens) {
        // First entry this month — set TTL to expire after 35 days
        await redis.expire(redisKey, 35 * 86400);
      }
    } catch {}
  }

  // Also persist to DB (fire-and-forget)
  void Promise.resolve(
    supabaseAdmin.rpc('increment_ai_tokens', { t_id: tenantId, token_count: tokens })
  ).catch(() => {});
}

// ─── Daily usage guard ────────────────────────────────────────
const DAILY_TOKEN_LIMITS: Record<string, number> = {
  starter:    2_000_000,
  growth:     20_000_000,
  pro:        Infinity,
  enterprise: Infinity,
};

export async function checkDailyAICostLimit(tenantId: string, plan: string): Promise<boolean> {
  const limit = DAILY_TOKEN_LIMITS[plan] ?? DAILY_TOKEN_LIMITS['starter'];
  if (limit === Infinity) return true;

  const redis = getRedisClient();
  const today = new Date().toISOString().slice(0, 10);
  const redisKey = `ai:daily:${tenantId}:${today}`;

  if (redis) {
    try {
      const raw = await redis.get(redisKey);
      const used = raw ? parseInt(raw, 10) : 0;
      return used < limit;
    } catch {}
  }
  return true; // fail open
}

export async function recordDailyTokenUsage(tenantId: string, tokens: number): Promise<void> {
  const redis = getRedisClient();
  const today = new Date().toISOString().slice(0, 10);
  const redisKey = `ai:daily:${tenantId}:${today}`;
  if (redis) {
    try {
      const count = await redis.incrby(redisKey, tokens);
      if (count === tokens) await redis.expire(redisKey, 86400 * 2); // 2 days
    } catch {}
  }
}
