import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTextMessage, sendMediaMessage } from '@/lib/meta/service';
import { getTenantById } from '@/lib/tenant/manager';
import { decryptToken } from '@/lib/utils/crypto';
import { toSignedMediaUrl } from '@/lib/utils/storage';
import * as Sentry from '@/lib/sentry-stub';
import type { Tenant } from '@/lib/types';

const isMetaConfigured = (t: Tenant) => !!t.wa_access_token && !!t.wa_phone_number_id;

const DELAY_MS: Record<string, number> = {
  minutes: 60_000,
  hours:   3_600_000,
  days:    86_400_000,
};

export type TriggerEvent =
  | 'booking_confirmed'
  | 'new_lead'
  | 'escalation_triggered'
  | 'escalation_resolved'
  | 'payment_received';

export interface AutomationPayload {
  tenantId: string;
  event: TriggerEvent;
  leadId?: string;
  conversationId?: string;
  phone?: string;
  variables?: Record<string, string>;
}

// ═══════════════════════════════════════
// TRIGGER: Called inline in webhook when an event fires.
// delay=0 → sends immediately. delay>0 → queues for cron/piggyback.
// ═══════════════════════════════════════

// Window (ms) within which an identical (automation, lead) trigger is treated as a
// duplicate (webhook retry, double-fire). Outside this window, a genuine re-trigger
// (e.g. the same lead escalates again next week) is allowed through.
const DEDUP_WINDOW_MS = 2 * 60_000;

export async function triggerAutomations(payload: AutomationPayload): Promise<void> {
  const { tenantId, event, conversationId, variables } = payload;

  console.log(`[AUTOMATION_TRIGGER_RECEIVED] event=${event} tenant=${tenantId} lead=${payload.leadId || '?'} phone=${payload.phone || '?'}`);

  const { data: rules } = await supabaseAdmin
    .from('automations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('trigger_event', event)
    .eq('status', 'active');

  if (!rules || rules.length === 0) {
    console.log(`[AUTOMATION_NO_MATCH] event=${event} tenant=${tenantId} — no active rules`);
    return;
  }

  let leadId = payload.leadId;
  if (!leadId && payload.phone) {
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', payload.phone)
      .maybeSingle();
    leadId = lead?.id;
  }
  if (!leadId) {
    console.log(`[AUTOMATION_SKIP] event=${event} tenant=${tenantId} — no leadId resolved`);
    return;
  }

  console.log(`[AUTOMATION_MATCH_FOUND] event=${event} tenant=${tenantId} rules=${rules.length} lead=${leadId}`);

  for (const rule of rules) {
    try {
      // Deduplication (windowed): skip if a pending item exists, OR a 'sent' item was
      // created within DEDUP_WINDOW_MS (catches webhook retries / rapid double-fires
      // without permanently blocking legitimate future re-triggers for the same lead).
      const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
      const { data: dupes } = await supabaseAdmin
        .from('automation_queue')
        .select('id, status, created_at')
        .eq('automation_id', rule.id)
        .eq('lead_id', leadId)
        .in('status', ['pending', 'processing', 'sent'])
        .gte('created_at', windowStart)
        .limit(1);

      if (dupes && dupes.length > 0) {
        console.log(`[AUTOMATION_DEDUP] rule=${rule.id} lead=${leadId} — duplicate within ${DEDUP_WINDOW_MS}ms (existing status=${dupes[0].status}), skipping`);
        continue;
      }

      const delayMs = (rule.delay_value || 0) * (DELAY_MS[rule.delay_unit] || DELAY_MS.minutes);

      if (delayMs === 0) {
        console.log(`[AUTOMATION_IMMEDIATE] rule=${rule.id} lead=${leadId} — delay=0, sending now`);
        const tenant = await getTenantById(tenantId);
        if (!tenant || !isMetaConfigured(tenant)) {
          console.log(`[AUTOMATION_SKIP] rule=${rule.id} — tenant not WA-configured`);
          continue;
        }

        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('name, phone')
          .eq('id', leadId)
          .single();
        if (!lead) continue;

        const result = await sendAutomationMessage(tenant, lead, rule, conversationId || null, variables);
        console.log(`[AUTOMATION_MESSAGE_SENT] rule=${rule.id} lead=${leadId} msgId=${result.messageId} (immediate)`);

        // Record in queue for dedup + execution history
        await supabaseAdmin.from('automation_queue').insert({
          automation_id: rule.id,
          tenant_id: tenantId,
          lead_id: leadId,
          conversation_id: conversationId || null,
          scheduled_at: new Date().toISOString(),
          status: 'sent',
          sent_at: new Date().toISOString(),
          wa_message_id: result.messageId,
        }).then(null, () => {});

        await bumpCounter(rule.id, 0, 1);
      } else {
        const scheduledAt = new Date(Date.now() + delayMs).toISOString();
        console.log(`[AUTOMATION_JOB_SCHEDULED] rule=${rule.id} lead=${leadId} scheduledAt=${scheduledAt} delay=${rule.delay_value}${rule.delay_unit}`);
        await supabaseAdmin.from('automation_queue').insert({
          automation_id: rule.id,
          tenant_id: tenantId,
          lead_id: leadId,
          conversation_id: conversationId || null,
          scheduled_at: scheduledAt,
          status: 'pending',
        });
      }

      await bumpCounter(rule.id, 1, 0);
    } catch (err) {
      console.error(`[AUTOMATION_TRIGGER_FAILED] rule=${rule.id}:`, err);
      Sentry.captureException(err);
    }
  }
}

// ═══════════════════════════════════════
// PROCESS: Cron-driven + piggyback from webhook.
// Picks up due items from automation_queue.
// ═══════════════════════════════════════

export async function processPendingAutomations(): Promise<number> {
  const now = new Date().toISOString();

  // Claim items atomically: set status='processing' so concurrent callers don't double-send
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from('automation_queue')
    .update({ status: 'processing' as string })
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .limit(50)
    .select('id');

  if (claimErr || !claimed || claimed.length === 0) return 0;

  const claimedIds = claimed.map(c => c.id);
  console.log(`[AUTOMATION_JOB_STARTED] claimed ${claimedIds.length} due queue items`);

  const { data: queueItems, error } = await supabaseAdmin
    .from('automation_queue')
    .select(`
      *,
      automations!inner ( id, tenant_id, message_text, media_url, media_type, cancel_on_reply ),
      leads!inner ( name, phone, lead_status )
    `)
    .in('id', claimedIds);

  if (error) {
    console.error(`[automations] queue query error:`, error.message);
    // Release claimed items back to pending
    await supabaseAdmin.from('automation_queue').update({ status: 'pending' }).in('id', claimedIds);
    return 0;
  }
  if (!queueItems || queueItems.length === 0) return 0;

  let sent = 0;

  for (const item of queueItems) {
    try {
      const automation = item.automations as unknown as {
        id: string; tenant_id: string; message_text: string;
        media_url: string | null; media_type: string | null;
        cancel_on_reply: boolean;
      };
      const lead = item.leads as unknown as {
        name: string; phone: string; lead_status: string;
      };

      if (lead.lead_status === 'converted' || lead.lead_status === 'lost') {
        await updateQueueStatus(item.id, 'cancelled', 'Lead status changed');
        continue;
      }

      const tenant = await getTenantById(item.tenant_id);
      if (!tenant || !tenant.is_active || !isMetaConfigured(tenant)) {
        await updateQueueStatus(item.id, 'cancelled', 'Tenant inactive or WA not configured');
        continue;
      }

      console.log(`[AUTOMATION_JOB_PROCESSING] item=${item.id} lead=${lead.phone} automation=${automation.id}`);
      const result = await sendAutomationMessage(tenant, lead, automation, item.conversation_id);

      await supabaseAdmin
        .from('automation_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          wa_message_id: result.messageId,
        })
        .eq('id', item.id);

      await bumpCounter(automation.id, 0, 1);
      sent++;
      console.log(`[AUTOMATION_MESSAGE_SENT] item=${item.id} lead=${lead.phone} msgId=${result.messageId}`);
    } catch (err) {
      console.error(`[AUTOMATION_MESSAGE_FAILED] item=${item.id}:`, err);
      Sentry.captureException(err);
      await updateQueueStatus(item.id, 'failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  console.log(`[AUTOMATION_JOB_DONE] processed=${claimedIds.length} sent=${sent}`);
  return sent;
}

// ═══════════════════════════════════════
// CANCEL: Called when customer replies.
// Only cancels items where the automation has cancel_on_reply=true.
// ═══════════════════════════════════════

export async function cancelLeadAutomations(leadId: string): Promise<void> {
  const { data: pendingItems } = await supabaseAdmin
    .from('automation_queue')
    .select('id, automation_id')
    .eq('lead_id', leadId)
    .eq('status', 'pending');

  if (!pendingItems || pendingItems.length === 0) return;

  const automationIds = [...new Set(pendingItems.map(i => i.automation_id))];
  const { data: automations } = await supabaseAdmin
    .from('automations')
    .select('id, cancel_on_reply')
    .in('id', automationIds);

  const cancelableIds = new Set(
    (automations || []).filter(a => a.cancel_on_reply).map(a => a.id)
  );

  const itemsToCancel = pendingItems.filter(i => cancelableIds.has(i.automation_id));
  if (itemsToCancel.length === 0) return;

  await supabaseAdmin
    .from('automation_queue')
    .update({ status: 'cancelled' })
    .in('id', itemsToCancel.map(i => i.id));

  console.log(`[automations] cancelled ${itemsToCancel.length} pending items for lead ${leadId}`);
}

// ═══════════════════════════════════════
// INTERNAL: Send a single automation message
// ═══════════════════════════════════════

async function sendAutomationMessage(
  tenant: Tenant,
  lead: { name: string; phone: string },
  automation: { message_text: string; media_url: string | null; media_type: string | null },
  conversationId: string | null,
  variables?: Record<string, string>,
): Promise<{ messageId: string | null }> {
  const token = decryptToken(tenant.wa_access_token as string) as string;
  const phoneNumberId = tenant.wa_phone_number_id as string;

  const message = interpolateVariables(automation.message_text, {
    customer_name: lead.name || 'there',
    business_name: tenant.business_name || '',
    ...variables,
  });

  console.log(`[automations] sending to ${lead.phone}: "${message.slice(0, 80)}..."`);

  let metaMsgId: string | null = null;
  let sentMediaUrl: string | null = null;
  let sentMimeType: string | null = null;
  let sentMessageType = 'text';

  if (automation.media_url) {
    const signedUrl = await toSignedMediaUrl(automation.media_url);
    const mediaType = (automation.media_type || 'image') as 'image' | 'video' | 'document';
    const result = await sendMediaMessage(token, phoneNumberId, lead.phone, mediaType, signedUrl, message);
    metaMsgId = result?.messageId ?? null;
    sentMediaUrl = signedUrl;
    sentMimeType = mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'application/octet-stream';
    sentMessageType = mediaType;
  } else {
    const result = await sendTextMessage(token, phoneNumberId, lead.phone, message);
    metaMsgId = result?.messageId ?? null;
  }

  console.log(`[automations] WhatsApp API result: msgId=${metaMsgId}`);

  // Record outbound message in conversation if we have context
  if (conversationId) {
    await supabaseAdmin.from('messages').insert({
      tenant_id: tenant.id,
      conversation_id: conversationId,
      direction: 'outbound',
      content: message,
      message_type: sentMessageType,
      channel: 'whatsapp',
      sender_id: null,
      status: metaMsgId ? 'sent' : 'failed',
      ai_generated: true,
      wa_message_id: metaMsgId,
      ...(sentMediaUrl && {
        media_url: sentMediaUrl,
        mime_type: sentMimeType,
        media_caption: message || null,
      }),
    });
  }

  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenant.id,
    event_type: 'automation_sent',
    channel: 'whatsapp',
    metadata: { lead_name: lead.name, automation_message: message.slice(0, 100) },
  }).then(null, () => {});

  return { messageId: metaMsgId };
}

function interpolateVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

async function updateQueueStatus(id: string, status: string, errorMessage?: string): Promise<void> {
  await supabaseAdmin
    .from('automation_queue')
    .update({ status, error_message: errorMessage || null })
    .eq('id', id);
}

// Atomically bump both counters in a single statement (no read-then-write race).
// Backed by the increment_automation_counter() RPC (migration 20260622_automations_v2).
// Falls back to read-then-write if the RPC isn't deployed yet.
async function bumpCounter(automationId: string, reachedDelta: number, sentDelta: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc('increment_automation_counter', {
    p_id: automationId,
    p_reached: reachedDelta,
    p_sent: sentDelta,
  });

  if (error) {
    console.warn(`[automations] counter RPC unavailable, using fallback: ${error.message}`);
    const { data } = await supabaseAdmin
      .from('automations')
      .select('customers_reached, messages_sent')
      .eq('id', automationId)
      .single();
    if (data) {
      await supabaseAdmin
        .from('automations')
        .update({
          customers_reached: ((data as any).customers_reached || 0) + reachedDelta,
          messages_sent: ((data as any).messages_sent || 0) + sentDelta,
        })
        .eq('id', automationId);
    }
  }
}
