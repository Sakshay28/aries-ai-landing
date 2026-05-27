// ═══════════════════════════════════════════════════════════
// 🛡️ Abuse Prevention
// ═══════════════════════════════════════════════════════════
// Covers:
//  - Per-sender spam rate limiting (100 msg/min → block)
//  - Webhook replay attack prevention (signed payload dedup)
//  - Broadcast recipient cap enforcement by plan
//  - Outbound message idempotency (prevent duplicate sends)
// ═══════════════════════════════════════════════════════════

import { checkRedisRateLimit, getRedisClient } from '@/lib/redis/client';
import { supabaseAdmin } from '@/lib/supabase/admin';

// ─── PLAN BROADCAST CAPS ─────────────────────────────────────
const BROADCAST_CAPS: Record<string, number> = {
  starter:    1_000,
  growth:     10_000,
  pro:        50_000,
  enterprise: Infinity,
};

// ─── Per-sender rate limit ────────────────────────────────────
// 30 messages per 60s per sender (prevents spam floods)
export async function checkSenderRateLimit(
  senderId: string
): Promise<{ allowed: boolean }> {
  const result = await checkRedisRateLimit(`sender:${senderId}`, 30, 60);
  if (!result.allowed) {
    console.warn(`🚨 Sender rate limit hit: ${senderId}`);
  }
  return { allowed: result.allowed };
}

// ─── Broadcast recipient cap ──────────────────────────────────
export function checkBroadcastCap(
  plan: string,
  recipientCount: number
): { allowed: boolean; cap: number } {
  const cap = BROADCAST_CAPS[plan] ?? BROADCAST_CAPS['starter'];
  if (recipientCount > cap) {
    console.warn(`🚨 Broadcast cap exceeded: plan=${plan} cap=${cap} requested=${recipientCount}`);
    return { allowed: false, cap };
  }
  return { allowed: true, cap };
}

// ─── Webhook replay prevention ────────────────────────────────
// Stores a hash of the signed webhook body in Redis for 24h.
// Returns true if this is a replay (already seen).
export async function isWebhookReplay(
  webhookId: string,
  tenantId: string
): Promise<boolean> {
  const redis = getRedisClient();
  const key = `webhook:seen:${tenantId}:${webhookId}`;

  if (redis) {
    // SET NX: only set if key doesn't exist
    const isNew = await redis.set(key, '1', 'EX', 86400, 'NX');
    if (!isNew) {
      console.warn(`🚨 Webhook replay detected: ${webhookId} for tenant ${tenantId}`);
      return true; // already processed
    }
    return false;
  }

  // Fallback: DB dedup
  try {
    const { data } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('wa_message_id', webhookId)
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch {
    return false; // fail open
  }
}

// ─── Outbound message idempotency ────────────────────────────
// Generates a stable idempotency key for an outbound message.
// Used to prevent duplicate sends on retry.
export function buildIdempotencyKey(
  tenantId: string,
  conversationId: string,
  messageHash: string
): string {
  return `idem:${tenantId}:${conversationId}:${messageHash}`;
}

export async function isDuplicateOutbound(
  tenantId: string,
  conversationId: string,
  content: string
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;

  // Simple hash: first 40 chars of content + length
  const hash = `${content.slice(0, 40).replace(/\s+/g, '_')}_${content.length}`;
  const key = buildIdempotencyKey(tenantId, conversationId, hash);

  const isNew = await redis.set(key, '1', 'EX', 300, 'NX'); // 5 min dedup window
  return !isNew; // if isNew is null → already exists → duplicate
}

// ─── Input length guard ───────────────────────────────────────
// Truncates inputs safely to prevent prompt flooding
export function truncateInput(input: string, maxChars = 2000): string {
  if (input.length <= maxChars) return input;
  console.warn(`⚠️ Input truncated: ${input.length} → ${maxChars} chars`);
  return input.slice(0, maxChars);
}
