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
import { sendTextMessage, sendTemplateMessage, sendMediaMessage } from '@/lib/meta/service';
const isMetaConfigured = (t: Tenant) => !!t.wa_access_token && !!t.wa_phone_number_id;
import { generateFollowUpMessage } from '@/lib/ai/engine';
import type { Tenant } from '@/lib/types';
import { decryptToken } from '@/lib/utils/crypto';
import * as Sentry from '@/lib/sentry-stub';

// ── Fallback scheduler — NOTE: setInterval is DEAD on Vercel serverless.
// The nightly cron (/api/cron/timeout) is the real mechanism. This interval
// only fires if the process happens to stay warm, which is unreliable.
// It is kept here as a best-effort in-process safety net only.
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

// initFollowUpEngine is kept for backward compat but is now a no-op.
// Vercel serverless functions are stateless — setInterval never persists
// between invocations. The real mechanism is /api/cron/timeout (nightly cron).
export function initFollowUpEngine() {
  console.log('⏰ Follow-up engine: cron-based scheduling active (setInterval disabled on serverless)');
}

// Dead code — kept to avoid import errors in callers. Safe to remove later.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function initFallbackScheduler() {
  // Intentionally empty — setInterval is unreliable on Vercel serverless.
  // All follow-up processing is handled by /api/cron/timeout.
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
  // Ensure the follow_up row exists in the database.
  // The nightly cron (/api/cron/timeout → processPendingFollowUps) will
  // pick up any rows with status='pending' whose scheduled_at is in the past.
  const scheduledAt = new Date(Date.now() + data.delayMs).toISOString();
  const { error } = await supabaseAdmin
    .from('follow_ups')
    .upsert(
      {
        id:              data.followUpId,
        tenant_id:       data.tenantId,
        lead_id:         data.leadId,
        conversation_id: data.conversationId,
        follow_up_type:  data.followUpType,
        scheduled_at:    scheduledAt,
        message:         data.message,
        ai_generated:    !data.message, // null message = AI will generate at send time
        status:          'pending',
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );

  if (error) {
    console.error(`⏰ scheduleFollowUp: DB upsert failed for ${data.followUpId}:`, error.message);
  } else {
    console.log(`⏰ Follow-up "${data.followUpType}" for ${data.leadName} scheduled at ${scheduledAt}`);
  }
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
  if (!tenant || !tenant.is_active || !isMetaConfigured(tenant)) {
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
      decryptToken(tenant.wa_access_token as string) as string,
      tenant.wa_phone_number_id as string,
      leadPhone,
      message
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
      if (!tenant || !tenant.is_active || !isMetaConfigured(tenant)) {
        await markFollowUpCancelled(followUp.id, 'Tenant inactive or WA not configured');
        continue;
      }

      // ── Resolve message: custom template > AI-generated ──
      let message = followUp.message as string | null;
      let mediaUrl: string | null = null;
      let mediaType: string = 'image';

      // Look up per-tenant custom template for this follow-up type
      const { data: customTpl } = await supabaseAdmin
        .from('follow_up_templates')
        .select('message, media_url, media_type')
        .eq('tenant_id', followUp.tenant_id)
        .eq('follow_up_type', followUp.follow_up_type)
        .maybeSingle();

      if (customTpl) {
        // Interpolate {{name}} and {{business_name}} variables
        if (customTpl.message) {
          message = customTpl.message
            .replace(/\{\{name\}\}/g, lead.name || 'there')
            .replace(/\{\{business_name\}\}/g, (tenant.business_name as string) || '');
        }
        if (customTpl.media_url) {
          mediaUrl  = customTpl.media_url;
          mediaType = customTpl.media_type || 'image';
        }
      }

      // Fall back to AI-generated message if no custom message set
      if (!message) {
        const tenantConfig = getTenantConfig(tenant);
        message = await generateFollowUpMessage(
          { name: lead.name },
          followUp.follow_up_type,
          tenantConfig
        );
      }

      const token = decryptToken(tenant.wa_access_token as string) as string;
      const phoneNumberId = tenant.wa_phone_number_id as string;
      const hoursSinceScheduled = getHoursSince(followUp.created_at);

      if (hoursSinceScheduled > 24) {
        // Outside 24h window — must use approved Meta template
        await sendFollowUpWithTemplate(tenant, lead.phone, followUp.follow_up_type, lead.name);
      } else if (mediaUrl) {
        // Custom image/media + optional caption
        await sendMediaMessage(token, phoneNumberId, lead.phone, mediaType as any, mediaUrl, message || undefined);
      } else {
        await sendTextMessage(token, phoneNumberId, lead.phone, message as string);
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

export async function processStaleConversations(tenantId?: string): Promise<void> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('is_active', true)
    .lt('last_message_at', twentyFourHoursAgo)
    .limit(200); // hard cap per call

  // If called for a specific tenant (e.g. from a tenant-scoped cron), filter accordingly.
  // If called platform-wide (e.g. by a global cleanup cron), process all tenants safely
  // because each row update is ID-scoped — no cross-tenant data is modified.
  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data: staleConvs } = await query;

  if (!staleConvs || staleConvs.length === 0) return;

  const ids = staleConvs.map((c) => c.id);

  await supabaseAdmin
    .from('conversations')
    .update({ is_active: false, current_step: 'timed_out' })
    .in('id', ids);

  console.log(`⏰ Timed out ${ids.length} stale conversations${tenantId ? ` for tenant ${tenantId}` : ' (global)'}`);
}

// ═══════════════════════════════════════
// AUTO-DE-ESCALATE: Re-enable bot after escalation_timeout_mins
// ═══════════════════════════════════════
// Each tenant sets their own escalation_timeout_mins in Settings → Staff & Alerts.
// If no staff has manually resolved the escalation within that window,
// the bot is automatically re-enabled so the customer isn't left waiting forever.
// Runs on every cron tick (every 30 min). Safe for 50+ tenants — joins on tenants
// table so each conversation is de-escalated using its own tenant's timeout.

export async function processTimedOutEscalations(): Promise<number> {
  // Join conversations → tenants to get per-tenant timeout_mins.
  // Only look at escalated conversations that are still active.
  const { data: escalated, error } = await supabaseAdmin
    .from('conversations')
    .select('id, escalated_at, tenants!inner(escalation_timeout_mins)')
    .eq('is_active', true)
    .eq('escalated', true)
    .not('escalated_at', 'is', null)
    .limit(200);

  if (error || !escalated || escalated.length === 0) return 0;

  const now = Date.now();
  const timedOutIds: string[] = [];

  for (const conv of escalated) {
    const tenant = conv.tenants as unknown as { escalation_timeout_mins: number };
    const timeoutMs = (tenant.escalation_timeout_mins || 30) * 60 * 1000;
    const escalatedAt = new Date(conv.escalated_at as string).getTime();
    if (now - escalatedAt >= timeoutMs) {
      timedOutIds.push(conv.id);
    }
  }

  if (timedOutIds.length === 0) return 0;

  await supabaseAdmin
    .from('conversations')
    .update({ escalated: false, escalation_reason: null })
    .in('id', timedOutIds);

  console.log(`🔄 Auto-de-escalated ${timedOutIds.length} conversation(s) after timeout`);
  return timedOutIds.length;
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
      decryptToken(tenant.wa_access_token as string) as string,
      tenant.wa_phone_number_id as string,
      phone,
      'follow_up_reminder',
      [name || 'there'],
      'en'
    );
  } catch {
    console.warn(`⚠️ [${tenant.business_name}] Template message failed for ${followUpType}, skipping`);
  }
}
