// ═══════════════════════════════════════════════════════════
// 🤝 Human Handoff Manager
// ═══════════════════════════════════════════════════════════
// Handles:
//  - Agent assignment to conversations
//  - Agent collision prevention (ownership lock)
//  - SLA timeout with automatic fallback message
//  - Handoff state tracking
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getRedisClient } from '@/lib/redis/client';

// SLA: if no agent responds within this many seconds, send fallback
const HANDOFF_SLA_SECONDS = 5 * 60; // 5 minutes
const AGENT_LOCK_TTL_SECONDS = 30;   // lock expires if agent tab crashes

// ─── Assign Agent to Conversation ────────────────────────────
// Uses Redis SET NX as a distributed lock to prevent agent collision.
// Returns { assigned: true, agentId } if acquired, { assigned: false } if collision.
export async function assignAgentToConversation(
  conversationId: string,
  agentUserId: string
): Promise<{ assigned: boolean; ownerId?: string }> {
  const redis = getRedisClient();
  const lockKey = `handoff:lock:${conversationId}`;

  if (redis) {
    // Atomic: only set if key doesn't exist
    const acquired = await redis.set(lockKey, agentUserId, 'EX', AGENT_LOCK_TTL_SECONDS, 'NX');
    if (!acquired) {
      // Someone else already owns this conversation
      const currentOwner = await redis.get(lockKey);
      console.warn(`⚠️ Agent collision on conversation ${conversationId} — owned by ${currentOwner}`);
      return { assigned: false, ownerId: currentOwner ?? undefined };
    }
  }

  // Persist in DB
  try {
    await supabaseAdmin
      .from('conversations')
      .update({
        handoff_owner_id: agentUserId,
        handoff_assigned_at: new Date().toISOString(),
        bot_paused: true,
      })
      .eq('id', conversationId);
  } catch (err) {
    console.error('❌ assignAgentToConversation DB update failed:', err);
    // Release Redis lock since DB failed
    if (redis) await redis.del(lockKey);
    return { assigned: false };
  }

  return { assigned: true, ownerId: agentUserId };
}

// ─── Release Agent Lock ───────────────────────────────────────
export async function releaseAgentLock(conversationId: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    await redis.del(`handoff:lock:${conversationId}`);
  }
  try {
    await supabaseAdmin
      .from('conversations')
      .update({
        handoff_owner_id: null,
        bot_paused: false,
        escalated: false,
        escalation_reason: null,
      })
      .eq('id', conversationId);
  } catch (err) {
    console.error('❌ releaseAgentLock DB update failed:', err);
  }
}

// ─── Renew Agent Lock (heartbeat) ────────────────────────────
// Call every ~20s from the agent chat UI to keep ownership alive
export async function renewAgentLock(
  conversationId: string,
  agentUserId: string
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true;
  const lockKey = `handoff:lock:${conversationId}`;
  const currentOwner = await redis.get(lockKey);
  if (currentOwner !== agentUserId) return false; // another agent took over
  await redis.set(lockKey, agentUserId, 'EX', AGENT_LOCK_TTL_SECONDS);
  return true;
}

// ─── Schedule SLA Timeout ─────────────────────────────────────
// Call immediately after handoff node fires in the flow engine.
// Stores a Redis key with expiry; the SLA check job reads it.
export async function scheduleHandoffSLA(
  conversationId: string,
  tenantId: string,
  fallbackMessage = "Our team will contact you shortly. Thank you for your patience! 🙏"
): Promise<void> {
  const redis = getRedisClient();
  const slaKey = `handoff:sla:${conversationId}`;
  const payload = JSON.stringify({ tenantId, fallbackMessage, conversedAt: Date.now() });
  if (redis) {
    await redis.set(slaKey, payload, 'EX', HANDOFF_SLA_SECONDS + 60);
  }
  // Also persist SLA deadline in DB so the BullMQ worker can poll it
  try {
    await supabaseAdmin
      .from('conversations')
      .update({
        handoff_sla_deadline: new Date(Date.now() + HANDOFF_SLA_SECONDS * 1000).toISOString(),
        handoff_fallback_message: fallbackMessage,
      })
      .eq('id', conversationId);
  } catch (err) {
    console.warn('⚠️ scheduleHandoffSLA DB update failed:', err);
  }
}

// ─── Check & Fire SLA Fallback ────────────────────────────────
// Called by BullMQ worker on a periodic poll (every 60s).
// Sends fallback message to any handoff conversation that has missed SLA.
export async function checkAndFireHandoffSLAs(
  sendFallbackFn: (tenantId: string, conversationId: string, message: string) => Promise<void>
): Promise<number> {
  let fired = 0;
  try {
    const now = new Date().toISOString();
    const { data: overdue } = await supabaseAdmin
      .from('conversations')
      .select('id, tenant_id, handoff_fallback_message, handoff_owner_id')
      .eq('bot_paused', true)
      .is('handoff_owner_id', null)        // no agent picked up yet
      .not('handoff_sla_deadline', 'is', null)
      .lt('handoff_sla_deadline', now)
      .eq('handoff_sla_fired', false);

    if (!overdue?.length) return 0;

    for (const conv of overdue) {
      try {
        await sendFallbackFn(
          conv.tenant_id,
          conv.id,
          conv.handoff_fallback_message || "Our team will contact you shortly. Thank you for your patience! 🙏"
        );
        await supabaseAdmin
          .from('conversations')
          .update({ handoff_sla_fired: true })
          .eq('id', conv.id);
        fired++;
      } catch (e) {
        console.error(`❌ SLA fallback failed for conv ${conv.id}:`, e);
      }
    }
  } catch (err) {
    console.error('❌ checkAndFireHandoffSLAs failed:', err);
  }
  return fired;
}
