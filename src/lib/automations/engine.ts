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

export async function triggerAutomations(payload: AutomationPayload): Promise<void> {
  const { tenantId, event, conversationId, variables } = payload;

  console.log(`[automations] trigger event=${event} tenant=${tenantId}`);

  const { data: rules } = await supabaseAdmin
    .from('automations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('trigger_event', event)
    .eq('status', 'active');

  if (!rules || rules.length === 0) {
    console.log(`[automations] no active rules for event=${event}`);
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
    console.log(`[automations] no leadId found, skipping`);
    return;
  }

  console.log(`[automations] found ${rules.length} rules, leadId=${leadId}`);

  for (const rule of rules) {
    try {
      // Deduplication: skip if this lead already has a pending/sent item for this automation
      const { count } = await supabaseAdmin
        .from('automation_queue')
        .select('id', { count: 'exact', head: true })
        .eq('automation_id', rule.id)
        .eq('lead_id', leadId)
        .in('status', ['pending', 'sent']);

      if ((count ?? 0) > 0) {
        console.log(`[automations] rule ${rule.id} — already queued/sent for lead ${leadId}, skipping`);
        continue;
      }

      const delayMs = (rule.delay_value || 0) * (DELAY_MS[rule.delay_unit] || DELAY_MS.minutes);

      if (delayMs === 0) {
        console.log(`[automations] rule ${rule.id} — sending immediately`);
        const tenant = await getTenantById(tenantId);
        if (!tenant || !isMetaConfigured(tenant)) {
          console.log(`[automations] tenant not configured, skipping`);
          continue;
        }

        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('name, phone')
          .eq('id', leadId)
          .single();
        if (!lead) continue;

        const result = await sendAutomationMessage(tenant, lead, rule, conversationId || null, variables);
        console.log(`[automations] immediate send done, msgId=${result.messageId}`);

        // Record in queue for deduplication + audit trail
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

        await atomicIncrement(rule.id, 'messages_sent');
      } else {
        const scheduledAt = new Date(Date.now() + delayMs).toISOString();
        console.log(`[automations] rule ${rule.id} — queuing for ${scheduledAt} (delay=${rule.delay_value} ${rule.delay_unit})`);
        await supabaseAdmin.from('automation_queue').insert({
          automation_id: rule.id,
          tenant_id: tenantId,
          lead_id: leadId,
          conversation_id: conversationId || null,
          scheduled_at: scheduledAt,
          status: 'pending',
        });
      }

      await atomicIncrement(rule.id, 'customers_reached');
    } catch (err) {
      console.error(`[automations] rule ${rule.id} failed:`, err);
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
  console.log(`[automations] claimed ${claimedIds.length} queue items`);

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

      console.log(`[automations] sending queue item ${item.id} to ${lead.phone}`);
      const result = await sendAutomationMessage(tenant, lead, automation, item.conversation_id);

      await supabaseAdmin
        .from('automation_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          wa_message_id: result.messageId,
        })
        .eq('id', item.id);

      await atomicIncrement(automation.id, 'messages_sent');
      sent++;
      console.log(`[automations] queue item ${item.id} sent, msgId=${result.messageId}`);
    } catch (err) {
      console.error(`[automations] queue item ${item.id} failed:`, err);
      Sentry.captureException(err);
      await updateQueueStatus(item.id, 'failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }

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

async function atomicIncrement(automationId: string, column: 'customers_reached' | 'messages_sent'): Promise<void> {
  // Atomic increment via raw SQL to avoid read-then-write races
  const { error } = await supabaseAdmin.rpc('exec_sql', {
    query: `UPDATE automations SET ${column} = ${column} + 1 WHERE id = $1`,
    params: [automationId],
  });

  if (error) {
    // Fallback: Supabase may not have exec_sql RPC — use read-then-write
    const { data } = await supabaseAdmin
      .from('automations')
      .select(column)
      .eq('id', automationId)
      .single();
    const current = (data as any)?.[column] || 0;
    await supabaseAdmin
      .from('automations')
      .update({ [column]: current + 1 })
      .eq('id', automationId);
  }
}
