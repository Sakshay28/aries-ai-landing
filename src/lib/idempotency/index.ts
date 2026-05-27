// ═══════════════════════════════════════════════════════════
// 🔑 Global Idempotency Layer
// ═══════════════════════════════════════════════════════════
// Prevents duplicate execution of:
//   - Outbound WhatsApp sends
//   - Follow-up BullMQ jobs
//   - Meta webhook processing
//   - Razorpay payment events
//
// Uses Redis SET NX (atomic: only executes if key doesn't exist).
// Falls back to in-memory set if Redis unavailable (single-instance only).
// ═══════════════════════════════════════════════════════════

import { getRedisClient } from '@/lib/redis/client';

// ─── In-memory fallback (used only when Redis is down) ───────
const memoryStore = new Map<string, number>(); // key → expiresAt ms

function memoryCheck(key: string, ttlSeconds: number): boolean {
  const now = Date.now();
  // Purge expired entries
  for (const [k, exp] of memoryStore.entries()) {
    if (exp < now) memoryStore.delete(k);
  }
  if (memoryStore.has(key)) return false; // already exists → duplicate
  memoryStore.set(key, now + ttlSeconds * 1000);
  return true; // new → proceed
}

// ─── Core idempotency check ───────────────────────────────────
// Returns true if the operation should proceed (first time seen).
// Returns false if it's a duplicate (already processed).
export async function checkIdempotency(key: string, ttlSeconds: number): Promise<boolean> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result !== null; // null means key existed → duplicate
    } catch (err) {
      console.warn('⚠️ Idempotency Redis error — using memory fallback:', (err as Error).message);
    }
  }
  return memoryCheck(key, ttlSeconds);
}

// ─── withIdempotency — wraps any async function ──────────────
// If key already exists → returns undefined (skips execution).
// If key is new → executes fn and returns its result.
export async function withIdempotency<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T | undefined> {
  const shouldProceed = await checkIdempotency(key, ttlSeconds);
  if (!shouldProceed) {
    console.log(`[idempotency] Skipping duplicate: ${key}`);
    return undefined;
  }
  return fn();
}

// ════════════════════════════════════════════════════════════
// TYPED KEY BUILDERS — one for each critical operation
// ════════════════════════════════════════════════════════════

// 2A. Outbound WhatsApp message dedup (24h)
export function outboundMessageKey(tenantId: string, conversationId: string, contentHash: string): string {
  return `idem:msg:${tenantId}:${conversationId}:${contentHash}`;
}
export const OUTBOUND_MSG_TTL = 86_400; // 24h

// 2B. Follow-up / BullMQ job dedup (7 days)
export function followupJobKey(tenantId: string, conversationId: string, campaignId: string): string {
  return `idem:followup:${tenantId}:${conversationId}:${campaignId}`;
}
export const FOLLOWUP_TTL = 604_800; // 7d

// 2C. Meta webhook dedup (7 days)
export function metaWebhookKey(wamid: string): string {
  return `idem:meta:webhook:${wamid}`;
}
export const META_WEBHOOK_TTL = 604_800; // 7d

// 2D. Razorpay payment event dedup (24h)
export function razorpayEventKey(eventId: string): string {
  return `idem:payment:webhook:${eventId}`;
}
export const RAZORPAY_EVENT_TTL = 86_400; // 24h

// ─── Hash helper for content-based keys ──────────────────────
export function hashContent(content: string): string {
  return `${content.slice(0, 40).replace(/\s+/g, '_')}_${content.length}`;
}
