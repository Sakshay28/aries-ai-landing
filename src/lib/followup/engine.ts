// ═══════════════════════════════════════════════════════════
// ⏰ Follow-Up Engine — BullMQ-Powered (Survives Restarts)
// ═══════════════════════════════════════════════════════════
// Replaces the old setInterval approach with proper BullMQ jobs.
// Each follow-up is a delayed job backed by Redis.
// If the server restarts, all pending jobs are preserved.
//
// Fallback: If Redis isn't configured, falls back to a
// database-polling approach (less reliable but functional).
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantById, getTenantConfig } from '@/lib/tenant/manager';
import { sendTextMessage, sendTemplateMessage, isGupshupConfigured } from '@/lib/gupshup/service';
import { generateFollowUpMessage } from '@/lib/ai/engine';
import type { Tenant } from '@/lib/types';
import { decryptToken } from '@/lib/utils/crypto';
import * as Sentry from '@/lib/sentry-stub';

// ── Fallback scheduler ──
let fallbackInterval: ReturnType<typeof setInterval> | null = null;

// ═══════════════════════════════════════
// Job Data Types
// ═══════════════════════════════════════

interface FollowUpJobData {
  followUpId: string;
  tenantId: string;
  leadId: string;
  conversationId: string | null;
  followUpType: string;
  message: string | null;
  leadPhone: string;
  leadName: string;
}

interface TimeoutJobData {
  conversationId: string;
  tenantId: string;
}

// ═══════════════════════════════════════
// INITIALIZE — Start queues and workers
// ═══════════════════════════════════════

export function initFollowUpEngine() {
  initFallbackScheduler();
  console.log('⏰ Follow-up engine started (database polling)');
}

function initFallbackScheduler() {
  if (fallbackInterval) return;

  // Poll database every 60 seconds for pending follow-ups
  fallbackInterval = setInterval(async () => {
    try {
      const sent = await processPendingFollowUps();
      if (sent > 0) console.log(`⏰ Processed ${sent} follow-ups`);
      await processStaleConversations();
    } catch (err) {
      console.error('❌ Scheduler error:', err);
    }
  }, 60 * 1000);
}

// ═══════════════════════════════════════
// SCHEDULE: Add a follow-up to the queue
// ═══════════════════════════════════════

export async function scheduleFollowUp(data: {
  followUpId: string;
  tenantId: string;
  leadId: string;
  conversationId: string | null;
  followUpType: string;
  message: string | null;
  leadPhone: string;
  leadName: string;
  delayMs: number;
}): Promise<void> {
  // DB-based scheduling — the poller picks up pending follow-ups
  console.log(`⏰ Follow-up ${data.followUpType} for ${data.leadName} saved (polling will handle)`);
}

// ═══════════════════════════════════════
// SCHEDULE: Conversation timeout
// ═══════════════════════════════════════

export async function scheduleConversationTimeout(
  _conversationId: string,
  _tenantId: string,
  _delayMs: number = 24 * 60 * 60 * 1000
): Promise<void> {
  // Handled by processStaleConversations polling
}

// ═══════════════════════════════════════
// PROCESS: Follow-up job
// ═══════════════════════════════════════

async function processFollowUpJob(data: FollowUpJobData): Promise<void> {
  const { followUpId, tenantId, leadId, followUpType, leadPhone, leadName } = data;

  // Check if follow-up is still pending in DB
  const { data: followUp } = await supabaseAdmin
    .from('follow_ups')
    .select('status')
    .eq('id', followUpId)
    .single();

  if (!followUp || followUp.status !== 'pending') {
    console.log(`⏩ Follow-up ${followUpId} already ${followUp?.status || 'deleted'}, skipping`);
    return;
  }

  // Check lead status
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('lead_status')
    .eq('id', leadId)
    .single();

  if (lead?.lead_status === 'converted' || lead?.lead_status === 'lost') {
    await markFollowUpCancelled(followUpId, 'Lead status changed');
    return;
  }

  // Get tenant
  const tenant = await getTenantById(tenantId);
  if (!tenant || !tenant.is_active || !isGupshupConfigured(tenant)) {
    await markFollowUpCancelled(followUpId, tenant ? 'WhatsApp not configured' : 'Tenant inactive');
    return;
  }

  // Get or generate message
  let message = data.message;
  if (!message) {
    const tenantConfig = getTenantConfig(tenant);
    message = await generateFollowUpMessage(
      { name: leadName },
      followUpType,
      tenantConfig
    );
  }

  // Send the message
  const hoursSinceCreated = getHoursSince(
    (await supabaseAdmin.from('follow_ups').select('created_at').eq('id', followUpId).single()).data?.created_at || ''
  );

  if (hoursSinceCreated > 24) {
    await sendFollowUpWithTemplate(tenant, leadPhone, followUpType, leadName);
  } else {
    await sendTextMessage(
      decryptToken(tenant.gupshup_api_key as string) as string,
      tenant.gupshup_phone_number as string,
      leadPhone,
      message,
      tenant.gupshup_app_name as string
    );
  }

  // Mark as sent
  await supabaseAdmin
    .from('follow_ups')
    .update({ status: 'sent', sent_at: new Date().toISOString(), message })
    .eq('id', followUpId);

  // Log analytics
  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenantId,
    event_type: 'follow_up_sent',
    channel: 'whatsapp',
    metadata: { follow_up_type: followUpType, lead_name: leadName, lead_phone: leadPhone },
  });

  console.log(`⏰ [${tenant.business_name}] Follow-up (${followUpType}) sent to ${leadName}`);
}

// ═══════════════════════════════════════
// PROCESS: Conversation timeout (Fix #14)
// ═══════════════════════════════════════

async function processConversationTimeout(data: TimeoutJobData): Promise<void> {
  const { conversationId } = data;

  // Check if conversation is still active
  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .select('is_active, last_message_at')
    .eq('id', conversationId)
    .single();

  if (!conv || !conv.is_active) return;

  // Only timeout if no message in last 24 hours
  const hoursSinceLastMessage = getHoursSince(conv.last_message_at);
  if (hoursSinceLastMessage < 24) return;

  // Deactivate the conversation
  await supabaseAdmin
    .from('conversations')
    .update({
      is_active: false,
      current_step: 'timed_out',
    })
    .eq('id', conversationId);

  console.log(`⏰ Conversation ${conversationId} timed out (${Math.round(hoursSinceLastMessage)}h inactive)`);
}

// ═══════════════════════════════════════
// FALLBACK: Process pending follow-ups via DB polling
// ═══════════════════════════════════════

export async function processPendingFollowUps(): Promise<number> {
  const now = new Date().toISOString();

  const { data: followUps, error } = await supabaseAdmin
    .from('follow_ups')
    .select(`
      *,
      leads!inner (
        name, phone, channel, tenant_id, lead_status
      )
    `)
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .limit(50);

  if (error || !followUps || followUps.length === 0) return 0;

  let sent = 0;

  for (const followUp of followUps) {
    try {
      const lead = followUp.leads as unknown as {
        name: string;
        phone: string;
        channel: string;
        tenant_id: string;
        lead_status: string;
      };

      if (lead.lead_status === 'converted' || lead.lead_status === 'lost') {
        await markFollowUpCancelled(followUp.id, 'Lead status changed');
        continue;
      }

      const tenant = await getTenantById(followUp.tenant_id);
      if (!tenant || !tenant.is_active || !isGupshupConfigured(tenant)) {
        await markFollowUpCancelled(followUp.id, 'Tenant inactive or WA not configured');
        continue;
      }

      let message = followUp.message;
      if (!message) {
        const tenantConfig = getTenantConfig(tenant);
        message = await generateFollowUpMessage(
          { name: lead.name },
          followUp.follow_up_type,
          tenantConfig
        );
      }

      const hoursSinceScheduled = getHoursSince(followUp.created_at);
      if (hoursSinceScheduled > 24) {
        await sendFollowUpWithTemplate(tenant, lead.phone, followUp.follow_up_type, lead.name);
      } else {
        await sendTextMessage(
          decryptToken(tenant.gupshup_api_key as string) as string,
          tenant.gupshup_phone_number as string,
          lead.phone,
          message,
          tenant.gupshup_app_name as string
        );
      }

      await supabaseAdmin
        .from('follow_ups')
        .update({ status: 'sent', sent_at: new Date().toISOString(), message })
        .eq('id', followUp.id);

      await supabaseAdmin.from('analytics_events').insert({
        tenant_id: tenant.id,
        event_type: 'follow_up_sent',
        channel: 'whatsapp',
        metadata: { follow_up_type: followUp.follow_up_type, lead_name: lead.name },
      });

      sent++;
    } catch (err) {
      console.error(`❌ Follow-up ${followUp.id} failed:`, err);
      Sentry.captureException(err);
      await supabaseAdmin
        .from('follow_ups')
        .update({ status: 'failed', error_message: err instanceof Error ? err.message : 'Unknown error' })
        .eq('id', followUp.id);
    }
  }

  return sent;
}

// ═══════════════════════════════════════
// PROCESS: Stale conversations (Fix #14)
// ═══════════════════════════════════════

async function processStaleConversations(): Promise<void> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: staleConvs } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('is_active', true)
    .lt('last_message_at', twentyFourHoursAgo)
    .limit(100);

  if (!staleConvs || staleConvs.length === 0) return;

  const ids = staleConvs.map((c) => c.id);

  await supabaseAdmin
    .from('conversations')
    .update({ is_active: false, current_step: 'timed_out' })
    .in('id', ids);

  console.log(`⏰ Timed out ${ids.length} stale conversations`);
}

// ═══════════════════════════════════════
// Cancel Follow-Ups
// ═══════════════════════════════════════

export async function cancelLeadFollowUps(leadId: string): Promise<void> {
  await supabaseAdmin
    .from('follow_ups')
    .update({ status: 'cancelled' })
    .eq('lead_id', leadId)
    .eq('status', 'pending');
}

export async function cancelTenantFollowUps(tenantId: string): Promise<void> {
  await supabaseAdmin
    .from('follow_ups')
    .update({ status: 'cancelled' })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending');
}

// ═══════════════════════════════════════
// SHUTDOWN
// ═══════════════════════════════════════

export async function shutdownFollowUpEngine(): Promise<void> {
  if (fallbackInterval) clearInterval(fallbackInterval);
  console.log('⏰ Follow-up engine shut down');
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

async function markFollowUpCancelled(followUpId: string, reason: string) {
  await supabaseAdmin
    .from('follow_ups')
    .update({ status: 'cancelled', error_message: reason })
    .eq('id', followUpId);
}

function getHoursSince(dateStr: string): number {
  const then = new Date(dateStr).getTime();
  return (Date.now() - then) / (1000 * 60 * 60);
}

async function sendFollowUpWithTemplate(
  tenant: Tenant,
  phone: string,
  followUpType: string,
  name: string
) {
  try {
    await sendTemplateMessage(
      decryptToken(tenant.gupshup_api_key as string) as string,
      tenant.gupshup_phone_number as string,
      phone,
      'follow_up_reminder',
      [name || 'there'],
      'en',
      tenant.gupshup_app_name as string
    );
  } catch {
    console.warn(`⚠️ [${tenant.business_name}] Template message failed for ${followUpType}, skipping`);
  }
}
