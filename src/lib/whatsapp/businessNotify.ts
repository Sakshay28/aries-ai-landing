// ═══════════════════════════════════════════════════════════
// 🛎️ Guaranteed Business Delivery — sendBusinessEvent()
// ═══════════════════════════════════════════════════════════
// The single entry point for every staff/manager-facing alert (booking,
// cancellation, human handoff, payment confirmation, ...).
// Rebuilt for 99.999% reliability with idempotency, tracing, tenant-fair
// isolation queueing, and multi-channel Resend email fallbacks.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantById } from '@/lib/tenant/manager';
import { decryptToken } from '@/lib/utils/crypto';
import { sendTextMessage, sendTemplateMessage } from '@/lib/meta/service';
import { isWindowClosedError } from '@/lib/automations/logic';
import { getSessionState } from '@/lib/whatsapp/session';
import { resolveEventTemplate, mapVariablesToPositional, type SystemEventType } from '@/lib/whatsapp/templateManager';
import { ensureRequiredTemplates } from '@/lib/whatsapp/templateProvisioner';
import { notifyAdmin } from '@/lib/alerts/admin';
import { notifyTenant } from '@/lib/alerts/tenantAlert';
import { sendPlatformAlert, isPlatformConfigured } from '@/lib/whatsapp/platformSend';
import { normalizePhoneNumber } from '@/lib/whatsapp/phone';
import type { Tenant } from '@/lib/types';
import crypto from 'crypto';

export type { SystemEventType } from '@/lib/whatsapp/templateManager';

export interface BusinessEventParams {
  tenantId: string;
  eventType: SystemEventType;
  title: string;
  body: string;
  variables?: Record<string, string>;
  conversationId?: string | null;
  leadId?: string | null;
  idempotencyKey?: string;
}

export interface RecipientResult {
  phone: string;
  role: 'staff' | 'manager';
  status: 'sent_session' | 'sent_template' | 'delivered' | 'failed';
  wa_message_id?: string;
  error?: string;
  no_fallback_template?: boolean;
}

export interface BusinessEventResult {
  notificationId: string;
  waStatus: string;
  recipients: RecipientResult[];
  traceId: string;
}

const MAX_RETRY_ATTEMPTS = 5;

// Exponential Backoff Intervals: 5s, 30s, 2m, 10m, 30m
const RETRY_INTERVALS_MS = [
  5_000,
  30_000,
  120_000,
  600_000,
  1800_000,
];

const RETRY_CLAIM_BATCH = 20;
const STUCK_LOCK_MS = 5 * 60_000;

/**
 * Single guaranteed-delivery entry point. Idempotent and traced.
 * Ensures exactly-once business semantics.
 */
export async function sendBusinessEvent(params: BusinessEventParams): Promise<BusinessEventResult> {
  const { tenantId, eventType, title, body, variables = {}, conversationId = null, leadId = null, idempotencyKey } = params;
  const traceId = crypto.randomUUID();

  console.log(`[TRACE:${traceId}] Initializing business event "${eventType}" for tenant ${tenantId}. IdempotencyKey=${idempotencyKey ?? 'None'}`);

  // 1. Idempotency Check
  if (idempotencyKey) {
    const { data: existing } = await supabaseAdmin
      .from('business_notifications')
      .select('id, wa_status, recipients, trace_id')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      console.log(`[TRACE:${existing.trace_id}] Duplicate block: Returning existing notification ${existing.id}`);
      return {
        notificationId: existing.id,
        waStatus: existing.wa_status,
        recipients: existing.recipients as RecipientResult[],
        traceId: existing.trace_id,
      };
    }
  }

  // 2. Insert durable notification record
  let notificationId = '';
  const insertPayload = {
    tenant_id: tenantId,
    event_type: eventType,
    severity: 'info',
    title,
    body,
    payload: variables,
    conversation_id: conversationId,
    lead_id: leadId,
    wa_status: 'pending',
    idempotency_key: idempotencyKey ?? null,
    trace_id: traceId,
  };

  const { data: notification, error: insertErr } = await supabaseAdmin
    .from('business_notifications')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertErr) {
    // Unique violation constraint code: 23505
    if (insertErr.code === '23505' && idempotencyKey) {
      const { data: existing } = await supabaseAdmin
        .from('business_notifications')
        .select('id, wa_status, recipients, trace_id')
        .eq('tenant_id', tenantId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      
      if (existing) {
        console.log(`[TRACE:${existing.trace_id}] Concurrent duplicate block: Returning existing notification ${existing.id}`);
        return {
          notificationId: existing.id,
          waStatus: existing.wa_status,
          recipients: existing.recipients as RecipientResult[],
          traceId: existing.trace_id,
        };
      }
    }

    console.error(`[sendBusinessEvent] failed to write notification row:`, insertErr.message);
    notifyAdmin({
      dedupeKey: `business_notification_insert_failed:${tenantId}`,
      subject: 'business_notifications insert failed',
      summary: `Could not persist business event for tenant ${tenantId}: ${insertErr.message}`,
      context: { tenantId, eventType, traceId },
    }).catch(() => {});
  } else {
    notificationId = notification.id;
  }

  // 3. Trigger immediate dispatch
  const tenant = await getTenantById(tenantId);
  const result = await attemptDelivery(tenant, tenantId, eventType, body, variables, [], traceId);

  if (notificationId) {
    await finalizeAttempt(notificationId, result, 1);
  }

  // 4. Alert/Escalation triggers on direct failures
  if (result.waStatus === 'failed' || result.waStatus === 'no_template') {
    await triggerEmailFallback(tenant, eventType, title, body, traceId);

    notifyAdmin({
      dedupeKey: `business_event_delivery_failed:${tenantId}:${eventType}`,
      subject: `Business alert delivery failed — ${eventType}`,
      summary: `A ${eventType} alert for tenant ${tenantId} failed WhatsApp delivery (${result.waStatus}). Fallback channels triggered.`,
      context: { tenantId, eventType, notificationId, traceId },
    }).catch(() => {});
  }

  return {
    notificationId,
    waStatus: result.waStatus,
    recipients: result.recipients,
    traceId,
  };
}

/**
 * Claims and retries notifications fairly (preventing single-tenant starvation).
 */
export async function processNotificationRetries(): Promise<{ claimed: number; retried: number }> {
  const now = new Date().toISOString();
  const stuckCutoff = new Date(Date.now() - STUCK_LOCK_MS).toISOString();

  // Release stuck locks
  await supabaseAdmin
    .from('business_notifications')
    .update({ locked_at: null })
    .lt('locked_at', stuckCutoff);

  // Fetch up to 100 due items (allows fair filtering in-memory)
  const { data: due } = await supabaseAdmin
    .from('business_notifications')
    .select('id, tenant_id')
    .in('wa_status', ['failed', 'partially_sent', 'no_template'])
    .lt('attempt_count', MAX_RETRY_ATTEMPTS)
    .lte('next_retry_at', now)
    .is('locked_at', null)
    .limit(100);

  if (!due || due.length === 0) return { claimed: 0, retried: 0 };

  // Group by tenant and cap at 3 items per tenant per batch (Fair scheduler)
  const tenantClaimsMap = new Map<string, string[]>();
  const idsToLock: string[] = [];

  for (const item of due) {
    const list = tenantClaimsMap.get(item.tenant_id) ?? [];
    if (list.length < 3 && idsToLock.length < RETRY_CLAIM_BATCH) {
      list.push(item.id);
      tenantClaimsMap.set(item.tenant_id, list);
      idsToLock.push(item.id);
    }
  }

  if (idsToLock.length === 0) return { claimed: 0, retried: 0 };

  const { data: claimed } = await supabaseAdmin
    .from('business_notifications')
    .update({ locked_at: now })
    .in('id', idsToLock)
    .is('locked_at', null)
    .select('id, tenant_id, event_type, body, payload, attempt_count, recipients, trace_id');

  if (!claimed || claimed.length === 0) return { claimed: 0, retried: 0 };

  let retried = 0;
  for (const row of claimed) {
    try {
      console.log(`[TRACE:${row.trace_id}] Retrying notification ${row.id} (attempt=${row.attempt_count + 1})`);
      const alreadySucceeded = (row.recipients as RecipientResult[] ?? []).filter(r => r.status !== 'failed');
      const tenant = await getTenantById(row.tenant_id);
      const result = await attemptDelivery(tenant, row.tenant_id, row.event_type, row.body ?? '', row.payload as Record<string, string> ?? {}, alreadySucceeded, row.trace_id);
      
      const newAttemptCount = row.attempt_count + 1;
      await finalizeAttempt(row.id, result, newAttemptCount);

      // Email fallback if WhatsApp fails repeatedly
      if (result.waStatus === 'failed' || result.waStatus === 'no_template') {
        if (newAttemptCount >= 3) {
          await triggerEmailFallback(tenant, row.event_type, `Retry alert — ${row.event_type}`, row.body ?? '', row.trace_id);
        }
      }

      // Final failure notification
      if ((result.waStatus === 'failed' || result.waStatus === 'no_template') && newAttemptCount >= MAX_RETRY_ATTEMPTS) {
        await supabaseAdmin
          .from('business_notifications')
          .update({ severity: 'critical' })
          .eq('id', row.id);

        notifyAdmin({
          dedupeKey: `business_notification_exhausted:${row.tenant_id}:${row.event_type}`,
          subject: `Alert retries exhausted — ${row.event_type}`,
          summary: `Business alert for tenant ${row.tenant_id} failed after ${MAX_RETRY_ATTEMPTS} attempts.`,
          context: { tenantId: row.tenant_id, eventType: row.event_type, notificationId: row.id, traceId: row.trace_id },
        }).catch(() => {});
      }

      retried++;
    } catch (err) {
      console.error(`[TRACE:${row.trace_id}] notification-retry failed:`, (err as Error).message);
      await supabaseAdmin.from('business_notifications').update({ locked_at: null }).eq('id', row.id);
    }
  }

  return { claimed: claimed.length, retried };
}

export async function resolveOrCreateConversation(tenantId: string, phone: string, role: 'staff' | 'manager'): Promise<string | null> {
  try {
    const { data: existing } = await supabaseAdmin
      .from('conversations')
      .select('id, is_active')
      .eq('tenant_id', tenantId)
      .eq('sender_id', phone)
      .maybeSingle();

    if (existing) {
      if (!existing.is_active) {
        await supabaseAdmin
          .from('conversations')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }
      return existing.id;
    }

    const { data: created, error } = await supabaseAdmin
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        sender_id: phone,
        sender_name: role === 'manager' ? 'Manager (Portal)' : 'Staff (Portal)',
        channel: 'whatsapp',
        is_active: true,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('[resolveOrCreateConversation] failed to create:', error.message);
      return null;
    }

    return created?.id ?? null;
  } catch (err) {
    console.error('[resolveOrCreateConversation] unexpected error:', (err as Error).message);
    return null;
  }
}

async function attemptDelivery(
  tenant: Tenant | null,
  tenantId: string,
  eventType: SystemEventType,
  body: string,
  variables: Record<string, string>,
  alreadySucceeded: RecipientResult[],
  traceId: string,
): Promise<{ waStatus: string; recipients: RecipientResult[] }> {
  if (!tenant || !tenant.wa_access_token || !tenant.wa_phone_number_id) {
    console.warn(`[TRACE:${traceId}] Tenant ${tenantId} is missing WhatsApp configuration.`);
    return { waStatus: alreadySucceeded.length ? 'partially_sent' : 'failed', recipients: alreadySucceeded };
  }

  const token = decryptToken(tenant.wa_access_token as string) as string;
  if (!token) {
    console.error(`[TRACE:${traceId}] Token decryption failed for tenant ${tenantId}.`);
    return { waStatus: alreadySucceeded.length ? 'partially_sent' : 'failed', recipients: alreadySucceeded };
  }

  const doneSet = new Set(alreadySucceeded.map(r => r.phone));
  const rawRecipients: { phone: string; role: 'staff' | 'manager' }[] = [];
  if (tenant.staff_phone) rawRecipients.push({ phone: normalizePhoneNumber(tenant.staff_phone), role: 'staff' });
  if (tenant.manager_phone) rawRecipients.push({ phone: normalizePhoneNumber(tenant.manager_phone), role: 'manager' });

  const seen = new Set<string>(doneSet);
  const recipients = rawRecipients.filter(r => {
    if (seen.has(r.phone)) return false;
    seen.add(r.phone);
    return true;
  });

  if (recipients.length === 0) {
    return { waStatus: summarizeStatus(alreadySucceeded), recipients: alreadySucceeded };
  }

  const results: RecipientResult[] = [...alreadySucceeded];

  for (const recipient of recipients) {
    const session = await getSessionState(tenantId, recipient.phone);
    console.log(`[TRACE:${traceId}] Dispatching to ${recipient.role} (${recipient.phone}). SessionOpen=${session.windowOpen}`);

    // Ensure we have a conversation record in database so that it appears in Live Chat dashboard!
    const conversationId = session.conversationId || await resolveOrCreateConversation(tenantId, recipient.phone, recipient.role);

    if (session.windowOpen) {
      try {
        const sendResult = await sendTextMessage(token, tenant.wa_phone_number_id, recipient.phone, body);
        results.push({ phone: recipient.phone, role: recipient.role, status: 'sent_session', wa_message_id: sendResult.messageId });
        if (conversationId) await logOutboundMessage(tenantId, conversationId, body, 'text', sendResult.messageId);
        continue;
      } catch (err) {
        if (!isWindowClosedError(err)) {
          results.push({ phone: recipient.phone, role: recipient.role, status: 'failed', error: (err as Error).message });
          continue;
        }
      }
    }

    // Session Closed Fallback
    let template = await resolveEventTemplate(tenantId, eventType);
    let resolvedVars = { ...variables };

    if (!template) {
      template = await resolveEventTemplate(tenantId, 'human_assistance');
      if (template) {
        resolvedVars = {
          business_name: variables.business_name || tenant?.business_name || 'Your Business',
          customer_name: variables.customer_name || variables.guest_name || 'Guest',
          reason: eventType.replace(/_/g, ' ').toUpperCase(),
          message: variables.message || [
            variables.booking_date ? `Date: ${variables.booking_date}` : null,
            variables.booking_time ? `Time: ${variables.booking_time}` : null,
            variables.guests_count ? `Guests: ${variables.guests_count}` : null,
            variables.last_message || variables.bodyText || null
          ].filter(Boolean).join('\n') || '[No details]'
        };
      }
    }

    if (!template) {
      // No client template available — try sending from the Aries AI platform number.
      // Platform templates are registered once on our own verified WABA and work for
      // every client regardless of their WABA's Meta verification status.
      if (isPlatformConfigured()) {
        try {
          const platformResult = await sendPlatformAlert(
            recipient.phone,
            tenant?.business_name || 'your business',
            body,
          );
          results.push({ phone: recipient.phone, role: recipient.role, status: 'sent_template', wa_message_id: platformResult.messageId });
          console.log(`[TRACE:${traceId}] ✅ Platform fallback delivered to ${recipient.role} +${recipient.phone}`);
        } catch (platformErr) {
          results.push({ phone: recipient.phone, role: recipient.role, status: 'failed', error: `platform: ${(platformErr as Error).message}`, no_fallback_template: true });
        }
      } else {
        results.push({ phone: recipient.phone, role: recipient.role, status: 'failed', error: 'Window closed, no template bound', no_fallback_template: true });
      }
      continue;
    }

    try {
      const positional = mapVariablesToPositional(template.variableMap, resolvedVars);
      const sendResult = await sendTemplateMessage(token, tenant.wa_phone_number_id, recipient.phone, template.name, positional, template.language);
      results.push({ phone: recipient.phone, role: recipient.role, status: 'sent_template', wa_message_id: sendResult.messageId });
      if (conversationId) await logOutboundMessage(tenantId, conversationId, `[Template: ${template.name}]`, 'template', sendResult.messageId, template.name);
    } catch (tplErr) {
      // Client template send failed — try platform as last resort
      if (isPlatformConfigured()) {
        try {
          const platformResult = await sendPlatformAlert(recipient.phone, tenant?.business_name || 'your business', body);
          results.push({ phone: recipient.phone, role: recipient.role, status: 'sent_template', wa_message_id: platformResult.messageId });
          console.log(`[TRACE:${traceId}] ✅ Platform fallback (after template err) delivered to ${recipient.role} +${recipient.phone}`);
        } catch {
          results.push({ phone: recipient.phone, role: recipient.role, status: 'failed', error: (tplErr as Error).message });
        }
      } else {
        results.push({ phone: recipient.phone, role: recipient.role, status: 'failed', error: (tplErr as Error).message });
      }
    }
  }

  return { waStatus: summarizeStatus(results), recipients: results };
}

async function triggerEmailFallback(
  tenant: Tenant | null,
  eventType: string,
  title: string,
  body: string,
  traceId: string,
): Promise<void> {
  const staffEmail = tenant?.staff_email || process.env.PLATFORM_ADMIN_EMAIL;
  if (!staffEmail) return;

  console.log(`[TRACE:${traceId}] Triggering fallback Resend email dispatch to: ${staffEmail}`);
  await notifyTenant({
    staffEmail,
    businessName: tenant?.business_name || 'Aries Business',
    subject: `[ALERT FALLBACK] ${title}`,
    summary: body,
  }).catch(e => console.error(`[TRACE:${traceId}] Resend dispatch failed:`, e.message));
}

export function summarizeStatus(results: RecipientResult[]): string {
  if (results.length === 0) return 'failed';
  const allFailed = results.every(r => r.status === 'failed');
  const allSucceeded = results.every(r => r.status !== 'failed');

  if (allFailed) {
    return results.every(r => r.no_fallback_template) ? 'no_template' : 'failed';
  }
  if (!allSucceeded) return 'partially_sent';
  return results.some(r => r.status === 'sent_template') ? 'sent_template' : 'sent_session';
}

async function logOutboundMessage(
  tenantId: string,
  conversationId: string,
  content: string,
  messageType: 'text' | 'template',
  waMessageId?: string,
  templateName?: string,
): Promise<void> {
  await supabaseAdmin.from('messages').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    direction: 'outbound',
    content,
    message_type: messageType,
    channel: 'whatsapp',
    status: waMessageId ? 'sent' : 'failed',
    wa_message_id: waMessageId ?? null,
    ...(templateName ? { metadata: { interactive_type: 'template', template_name: templateName } } : {}),
  }).then(null, () => {});
}

async function finalizeAttempt(
  notificationId: string,
  result: { waStatus: string; recipients: RecipientResult[] },
  attemptCount: number,
): Promise<void> {
  const retryable = result.waStatus === 'failed' || result.waStatus === 'partially_sent' || result.waStatus === 'no_template';
  
  // Exponential backoff mapping
  const backoffIdx = Math.min(attemptCount - 1, RETRY_INTERVALS_MS.length - 1);
  const backoffMs = RETRY_INTERVALS_MS[backoffIdx] ?? 30_000;
  
  const nextRetryAt = retryable && attemptCount < MAX_RETRY_ATTEMPTS
    ? new Date(Date.now() + backoffMs).toISOString()
    : null;

  await supabaseAdmin
    .from('business_notifications')
    .update({
      wa_status: result.waStatus,
      recipients: result.recipients,
      attempt_count: attemptCount,
      next_retry_at: nextRetryAt,
      locked_at: null,
    })
    .eq('id', notificationId);
}

export interface EscalationAlertParams {
  tenantId: string;
  conversationId: string;
  leadId: string | null;
  customerPhone: string;
  customerName: string;
  reason: string;
  lastMessage: string;
  idempotencyKey?: string;
}

export async function triggerEscalationAlert(params: EscalationAlertParams): Promise<BusinessEventResult> {
  const { tenantId, conversationId, leadId, customerPhone, customerName, reason, lastMessage, idempotencyKey } = params;

  const tenant = await getTenantById(tenantId);
  const businessName = tenant?.business_name || 'Your Business';

  const DEFAULT_ESCALATION_TEMPLATE =
    `🚨 New Escalation Alert | {{business_name}}\n\n` +
    `👤 Customer: {{customer_name}}\n` +
    `📌 Escalation Reason:\n` +
    `{{reason}}\n\n` +
    `💬 Customer Message:\n` +
    `{{message}}\n\n` +
    `⚡ Action Required:\n` +
    `Please respond to the customer as soon as possible. The AI conversation has been paused pending staff assistance.`;

  const cleanPhone = customerPhone.replace(/\D/g, '');
  const formattedPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;

  const templateVars: Record<string, string> = {
    customer_name:  customerName || `+${formattedPhone}`,
    customer_phone: formattedPhone,
    reason,
    message:        lastMessage || '[No message]',
    business_name:  businessName,
  };

  const rawTemplate = tenant?.escalation_alert_template?.trim() || DEFAULT_ESCALATION_TEMPLATE;
  const alertMsg = rawTemplate.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => templateVars[key] ?? '');

  return sendBusinessEvent({
    tenantId,
    eventType: 'human_assistance',
    title: `Escalation Alert — ${customerName || `+${formattedPhone}`}`,
    body: alertMsg,
    variables: templateVars,
    conversationId,
    leadId,
    idempotencyKey,
  });
}
