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

import { Queue, Worker, type Job } from 'bullmq';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantById, getTenantConfig } from '@/lib/tenant/manager';
import { sendTextMessage, sendTemplateMessage, isWhatsAppConfigured } from '@/lib/whatsapp/service';
import { generateFollowUpMessage } from '@/lib/ai/engine';
import { getRedisClient } from '@/lib/redis/client';
import type { Tenant } from '@/lib/types';
import * as Sentry from '@sentry/nextjs';

// ── Queue & Worker Names ──
const FOLLOWUP_QUEUE = 'follow-ups';
const CONVERSATION_TIMEOUT_QUEUE = 'conversation-timeouts';

// ── Queue Instances ──
let followUpQueue: Queue | null = null;
let timeoutQueue: Queue | null = null;
let followUpWorker: Worker | null = null;
let timeoutWorker: Worker | null = null;

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
  const redis = getRedisClient();

  if (redis) {
    initBullMQ(redis);
    console.log('⏰ Follow-up engine started (BullMQ + Redis)');
  } else {
    initFallbackScheduler();
    console.log('⏰ Follow-up engine started (database polling fallback)');
  }
}

function initBullMQ(connection: ReturnType<typeof getRedisClient>) {
  if (!connection) return;

  // ── Follow-Up Queue ──
  followUpQueue = new Queue(FOLLOWUP_QUEUE, { connection });

  followUpWorker = new Worker(
    FOLLOWUP_QUEUE,
    async (job: Job<FollowUpJobData>) => {
      await processFollowUpJob(job.data);
    },
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000, // Max 10 follow-ups per second
      },
      lockDuration: 30000,
      stalledInterval: 30000,
      maxStalledCount: 1,
    }
  );

  followUpWorker.on('completed', (job) => {
    console.log(`✅ Follow-up job completed: ${job.id}`);
  });

  followUpWorker.on('failed', async (job, err) => {
    console.error(`❌ Follow-up job failed: ${job?.id}`, err.message);
    Sentry.captureException(err);
    if (job?.data?.tenantId) {
      try {
        await supabaseAdmin.from('analytics_events').insert({
          tenant_id: job.data.tenantId,
          event_type: 'queue_job_failed',
          channel: 'system',
          metadata: { job_id: job?.id, queue: FOLLOWUP_QUEUE, error: err.message },
        });
      } catch (e: unknown) {
        console.error('Failed to log queue error:', e);
      }
    }
  });

  // ── Conversation Timeout Queue ──
  timeoutQueue = new Queue(CONVERSATION_TIMEOUT_QUEUE, { connection });

  timeoutWorker = new Worker(
    CONVERSATION_TIMEOUT_QUEUE,
    async (job: Job<TimeoutJobData>) => {
      await processConversationTimeout(job.data);
    },
    { 
      connection, 
      concurrency: 10,
      lockDuration: 30000,
      stalledInterval: 30000,
      maxStalledCount: 1,
    }
  );

  timeoutWorker.on('failed', (job, err) => {
    console.error(`❌ Timeout job failed: ${job?.id}`, err.message);
    Sentry.captureException(err);
  });
}

function initFallbackScheduler() {
  if (fallbackInterval) return;

  // Poll database every 60 seconds for pending follow-ups
  fallbackInterval = setInterval(async () => {
    try {
      const sent = await processPendingFollowUps();
      if (sent > 0) console.log(`⏰ Fallback: Processed ${sent} follow-ups`);

      // Also check conversation timeouts
      await processStaleConversations();
    } catch (err) {
      console.error('❌ Fallback scheduler error:', err);
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
  if (followUpQueue) {
    // BullMQ: Add delayed job — survives server restart
    await followUpQueue.add(
      `followup:${data.followUpType}:${data.leadId}`,
      {
        followUpId: data.followUpId,
        tenantId: data.tenantId,
        leadId: data.leadId,
        conversationId: data.conversationId,
        followUpType: data.followUpType,
        message: data.message,
        leadPhone: data.leadPhone,
        leadName: data.leadName,
      },
      {
        delay: data.delayMs,
        jobId: data.followUpId, // Prevents duplicate enqueue for the same follow-up
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,
      }
    );
    console.log(`⏰ BullMQ: Scheduled ${data.followUpType} follow-up for ${data.leadName} (delay: ${Math.round(data.delayMs / 60000)}min)`);
  } else {
    // Fallback: Just save to database — the poller will pick it up
    console.log(`⏰ DB: Follow-up ${data.followUpType} for ${data.leadName} saved (polling will handle)`);
  }
}

// ═══════════════════════════════════════
// SCHEDULE: Conversation timeout
// ═══════════════════════════════════════

export async function scheduleConversationTimeout(
  conversationId: string,
  tenantId: string,
  delayMs: number = 24 * 60 * 60 * 1000 // 24 hours default
): Promise<void> {
  if (timeoutQueue) {
    // Remove any existing timeout for this conversation
    const jobId = `timeout:${conversationId}`;
    const existing = await timeoutQueue.getJob(jobId);
    if (existing) await existing.remove();

    await timeoutQueue.add(
      jobId,
      { conversationId, tenantId },
      {
        delay: delayMs,
        jobId, // Ensure only one timeout per conversation
        attempts: 2,
        removeOnComplete: true,
      }
    );
  }
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
  if (!tenant || !tenant.is_active || !isWhatsAppConfigured(tenant)) {
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
    await sendTextMessage(tenant, leadPhone, message);
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
      if (!tenant || !tenant.is_active || !isWhatsAppConfigured(tenant)) {
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
        await sendTextMessage(tenant, lead.phone, message);
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

  // Also remove from BullMQ if available
  if (followUpQueue) {
    try {
      const jobs = await followUpQueue.getDelayed();
      for (const job of jobs) {
        if (job.data.leadId === leadId) {
          await job.remove();
        }
      }
    } catch {
      // Non-critical
    }
  }
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
  if (followUpWorker) await followUpWorker.close();
  if (timeoutWorker) await timeoutWorker.close();
  if (followUpQueue) await followUpQueue.close();
  if (timeoutQueue) await timeoutQueue.close();
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
    await sendTemplateMessage(tenant, phone, 'follow_up_reminder', 'en', [
      { type: 'body', parameters: [{ type: 'text', text: name || 'there' }] },
    ]);
  } catch {
    console.warn(`⚠️ [${tenant.business_name}] Template message failed for ${followUpType}, skipping`);
  }
}
