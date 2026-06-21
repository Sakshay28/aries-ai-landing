import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTextMessage, sendMediaMessage, sendTemplateMessage } from '@/lib/meta/service';
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
// Finds matching active automations, queues or sends immediately.
// ═══════════════════════════════════════

export async function triggerAutomations(payload: AutomationPayload): Promise<void> {
  const { tenantId, event, conversationId, variables } = payload;

  const { data: rules } = await supabaseAdmin
    .from('automations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('trigger_event', event)
    .eq('status', 'active');

  if (!rules || rules.length === 0) return;

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
  if (!leadId) return;

  for (const rule of rules) {
    try {
      const delayMs = (rule.delay_value || 0) * (DELAY_MS[rule.delay_unit] || DELAY_MS.minutes);

      if (delayMs === 0) {
        const tenant = await getTenantById(tenantId);
        if (!tenant || !isMetaConfigured(tenant)) continue;

        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('name, phone')
          .eq('id', leadId)
          .single();
        if (!lead) continue;

        await sendAutomationMessage(tenant, lead, rule, conversationId || null, variables);
      } else {
        const scheduledAt = new Date(Date.now() + delayMs).toISOString();
        await supabaseAdmin.from('automation_queue').insert({
          automation_id: rule.id,
          tenant_id: tenantId,
          lead_id: leadId,
          conversation_id: conversationId || null,
          scheduled_at: scheduledAt,
          status: 'pending',
        });
      }

      await supabaseAdmin.rpc('increment_counter', {
        table_name: 'automations',
        column_name: 'customers_reached',
        row_id: rule.id,
      }).then(null, () => {
        // Fallback: plain update if RPC not available
        supabaseAdmin
          .from('automations')
          .update({ customers_reached: (rule.customers_reached || 0) + 1 })
          .eq('id', rule.id)
          .then(null, () => {});
      });
    } catch (err) {
      console.error(`❌ triggerAutomations: rule ${rule.id} failed:`, err);
      Sentry.captureException(err);
    }
  }
}

// ═══════════════════════════════════════
// PROCESS: Cron-driven. Picks up due items from automation_queue.
// ═══════════════════════════════════════

export async function processPendingAutomations(): Promise<number> {
  const now = new Date().toISOString();

  const { data: queueItems, error } = await supabaseAdmin
    .from('automation_queue')
    .select(`
      *,
      automations!inner ( id, tenant_id, message_text, media_url, media_type, cancel_on_reply ),
      leads!inner ( name, phone, lead_status )
    `)
    .eq('status', 'pending')
    .lte('scheduled_at', now)
    .limit(50);

  if (error || !queueItems || queueItems.length === 0) return 0;

  let sent = 0;

  for (const item of queueItems) {
    try {
      const automation = item.automations as unknown as {
        id: string; tenant_id: string; message_text: string;
        media_url: string | null; media_type: string | null; cancel_on_reply: boolean;
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

      const result = await sendAutomationMessage(tenant, lead, automation, item.conversation_id);

      await supabaseAdmin
        .from('automation_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          wa_message_id: result.messageId,
        })
        .eq('id', item.id);

      await supabaseAdmin
        .from('automations')
        .update({ messages_sent: (automation as any).messages_sent ? (automation as any).messages_sent + 1 : 1 })
        .eq('id', automation.id);

      sent++;
    } catch (err) {
      console.error(`❌ processPendingAutomations: item ${item.id} failed:`, err);
      Sentry.captureException(err);
      await updateQueueStatus(item.id, 'failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return sent;
}

// ═══════════════════════════════════════
// CANCEL: Called when customer replies (if cancel_on_reply is true)
// ═══════════════════════════════════════

export async function cancelLeadAutomations(leadId: string): Promise<void> {
  await supabaseAdmin
    .from('automation_queue')
    .update({ status: 'cancelled' })
    .eq('lead_id', leadId)
    .eq('status', 'pending');
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

  let message = interpolateVariables(automation.message_text, {
    customer_name: lead.name || 'there',
    business_name: tenant.business_name || '',
    ...variables,
  });

  // Check 24h window
  const { data: lastMsg } = await supabaseAdmin
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId || '')
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const hoursSinceInbound = lastMsg
    ? (Date.now() - new Date(lastMsg.created_at).getTime()) / 3_600_000
    : 999;

  let metaMsgId: string | null = null;
  let sentMediaUrl: string | null = null;
  let sentMimeType: string | null = null;
  let sentMessageType = 'text';

  if (hoursSinceInbound > 24) {
    try {
      const result = await sendTemplateMessage(
        token, phoneNumberId, lead.phone,
        'follow_up_reminder',
        [lead.name || 'there'],
        'en'
      );
      metaMsgId = result?.messageId || null;
    } catch {
      console.warn(`⚠️ [${tenant.business_name}] Automation template send failed, skipping`);
    }
    sentMessageType = 'template';
  } else if (automation.media_url) {
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
    metadata: { lead_name: lead.name },
  });

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
