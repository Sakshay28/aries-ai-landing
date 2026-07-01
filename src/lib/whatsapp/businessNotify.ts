// ═══════════════════════════════════════════════════════════
// 🛎️ Guaranteed Business Delivery — sendBusinessEvent()
// ═══════════════════════════════════════════════════════════
// The single entry point for every staff/manager-facing alert (booking,
// cancellation, human handoff, payment confirmation, ...). Replaces direct
// sendStaffAlert() calls at all 8 sites.
//
// Guarantee: a durable `business_notifications` row is written BEFORE any
// WhatsApp call is attempted, so the business has a record even if Meta is
// down, the tenant isn't WA-configured, or every recipient's window is
// closed with no fallback template bound. WhatsApp delivery (session
// message, or an approved template when the window is closed) is a
// best-effort bonus on top of that durable record, with retries handled by
// /api/cron/notification-retry.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantById } from '@/lib/tenant/manager';
import { decryptToken } from '@/lib/utils/crypto';
import { sendTextMessage, sendTemplateMessage } from '@/lib/meta/service';
import { isWindowClosedError } from '@/lib/automations/logic';
import { getSessionState } from '@/lib/whatsapp/session';
import { resolveEventTemplate, mapVariablesToPositional, type SystemEventType } from '@/lib/whatsapp/templateManager';
import { notifyAdmin } from '@/lib/alerts/admin';
import type { Tenant } from '@/lib/types';

export type { SystemEventType } from '@/lib/whatsapp/templateManager';

export interface BusinessEventParams {
  tenantId: string;
  eventType: SystemEventType;
  title: string;
  body: string;
  variables?: Record<string, string>;
  conversationId?: string | null;
  leadId?: string | null;
}

export interface RecipientResult {
  phone: string;
  role: 'staff' | 'manager';
  status: 'sent_session' | 'sent_template' | 'failed';
  wa_message_id?: string;
  error?: string;
  no_fallback_template?: boolean;
}

export interface BusinessEventResult {
  notificationId: string;
  waStatus: string;
  recipients: RecipientResult[];
}

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 60_000; // 1 min, multiplied by attempt number

function normalizeStaffPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  return digits;
}

/**
 * The single guaranteed-delivery entry point. Always writes a durable
 * business_notifications row first, then best-effort attempts WhatsApp
 * delivery to the tenant's staff/manager phones.
 */
export async function sendBusinessEvent(params: BusinessEventParams): Promise<BusinessEventResult> {
  const { tenantId, eventType, title, body, variables = {}, conversationId = null, leadId = null } = params;

  // Step 1 — durable record FIRST, before any WhatsApp call.
  const { data: notification, error: insertErr } = await supabaseAdmin
    .from('business_notifications')
    .insert({
      tenant_id: tenantId,
      event_type: eventType,
      severity: 'info',
      title,
      body,
      payload: variables,
      conversation_id: conversationId,
      lead_id: leadId,
      wa_status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr || !notification) {
    console.error(`[sendBusinessEvent] failed to write notification row (tenant=${tenantId}, event=${eventType}):`, insertErr?.message);
    // The durable guarantee failed at the DB layer — this is the one case we
    // can't recover from locally. Alert the operator; still attempt delivery.
    notifyAdmin({
      dedupeKey: `business_notification_insert_failed:${tenantId}`,
      subject: 'business_notifications insert failed',
      summary: `Could not persist a business event for tenant ${tenantId} (event=${eventType}). Check DB connectivity/migration status.`,
      context: { tenantId, eventType },
    }).catch(() => {});
  }

  const notificationId = notification?.id ?? '';
  const tenant = await getTenantById(tenantId);
  const result = await attemptDelivery(tenant, tenantId, eventType, body, variables, []);

  if (notificationId) {
    await finalizeAttempt(notificationId, result, 1);
  }

  // Immediate operator alert on total failure — the dashboard notification
  // guarantees the business sees it, but a same-day human failure (no
  // template bound, tenant not WA-configured) is worth flagging right away
  // rather than waiting for the retry cron to exhaust 5 attempts.
  if (result.waStatus === 'failed' || result.waStatus === 'no_template') {
    notifyAdmin({
      dedupeKey: `business_event_delivery_failed:${tenantId}:${eventType}`,
      subject: `Business alert not delivered — ${eventType}`,
      summary: `A ${eventType} alert for tenant ${tenantId} could not reach staff/manager on WhatsApp (${result.waStatus}). It's recorded on their dashboard and will retry automatically.`,
      context: { tenantId, eventType, notificationId, recipients: result.recipients },
    }).catch(() => {});
  }

  return { notificationId, waStatus: result.waStatus, recipients: result.recipients };
}

/**
 * Re-attempts delivery for an existing notification row (used by
 * /api/cron/notification-retry). Never re-inserts — the durable record
 * already exists.
 */
export async function retryBusinessNotification(row: {
  id: string;
  tenant_id: string;
  event_type: SystemEventType;
  body: string | null;
  payload: Record<string, string> | null;
  attempt_count: number;
  recipients: RecipientResult[] | null;
}): Promise<void> {
  // Only retry recipients that previously failed — a recipient who already
  // got the message (partially_sent) must never receive a duplicate send.
  const alreadySucceeded = (row.recipients ?? []).filter(r => r.status !== 'failed');
  const tenant = await getTenantById(row.tenant_id);
  const result = await attemptDelivery(tenant, row.tenant_id, row.event_type, row.body ?? '', row.payload ?? {}, alreadySucceeded);
  await finalizeAttempt(row.id, result, row.attempt_count + 1);

  if ((result.waStatus === 'failed' || result.waStatus === 'no_template') && row.attempt_count + 1 >= MAX_RETRY_ATTEMPTS) {
    await supabaseAdmin
      .from('business_notifications')
      .update({ severity: 'critical' })
      .eq('id', row.id);
    notifyAdmin({
      dedupeKey: `business_notification_exhausted:${row.tenant_id}:${row.event_type}`,
      subject: `Business alert delivery exhausted retries — ${row.event_type}`,
      summary: `A ${row.event_type} alert for tenant ${row.tenant_id} failed to reach staff/manager after ${MAX_RETRY_ATTEMPTS} attempts. It remains visible (unread) on their dashboard.`,
      context: { tenantId: row.tenant_id, eventType: row.event_type, notificationId: row.id },
    }).catch(() => {});
  }
}

const RETRY_CLAIM_BATCH = 20;
const STUCK_LOCK_MS = 5 * 60_000;

/**
 * Claims and retries due business_notifications (called by
 * /api/cron/notification-retry every 5 min). Same claim-with-lock shape as
 * automation_queue/broadcast_queue: stamp locked_at atomically so concurrent
 * cron invocations can't double-send, release stuck locks after 5 minutes.
 */
export async function processNotificationRetries(): Promise<{ claimed: number; retried: number }> {
  const now = new Date().toISOString();
  const stuckCutoff = new Date(Date.now() - STUCK_LOCK_MS).toISOString();

  // Release any locks stuck from a crashed/timed-out invocation.
  await supabaseAdmin
    .from('business_notifications')
    .update({ locked_at: null })
    .lt('locked_at', stuckCutoff);

  const { data: due } = await supabaseAdmin
    .from('business_notifications')
    .select('id')
    .in('wa_status', ['failed', 'partially_sent', 'no_template'])
    .lt('attempt_count', MAX_RETRY_ATTEMPTS)
    .lte('next_retry_at', now)
    .is('locked_at', null)
    .limit(RETRY_CLAIM_BATCH);

  if (!due || due.length === 0) return { claimed: 0, retried: 0 };

  const ids = due.map(d => d.id);
  const { data: claimed } = await supabaseAdmin
    .from('business_notifications')
    .update({ locked_at: now })
    .in('id', ids)
    .is('locked_at', null)
    .select('id, tenant_id, event_type, body, payload, attempt_count, recipients');

  if (!claimed || claimed.length === 0) return { claimed: 0, retried: 0 };

  let retried = 0;
  for (const row of claimed) {
    try {
      await retryBusinessNotification(row as Parameters<typeof retryBusinessNotification>[0]);
      retried++;
    } catch (err) {
      console.error(`[notification-retry] failed for ${row.id}:`, (err as Error).message);
      await supabaseAdmin.from('business_notifications').update({ locked_at: null }).eq('id', row.id);
    }
  }

  return { claimed: claimed.length, retried };
}

// ── Internal: resolve recipients + attempt session-or-template send ────────
// `alreadySucceeded` (non-empty only on a retry) is carried through unchanged
// and those phones are skipped entirely — a recipient who already received
// the alert must never be sent a duplicate on a later retry pass.
async function attemptDelivery(
  tenant: Tenant | null,
  tenantId: string,
  eventType: SystemEventType,
  body: string,
  variables: Record<string, string>,
  alreadySucceeded: RecipientResult[],
): Promise<{ waStatus: string; recipients: RecipientResult[] }> {
  if (!tenant || !tenant.wa_access_token || !tenant.wa_phone_number_id) {
    return { waStatus: alreadySucceeded.length ? 'partially_sent' : 'failed', recipients: alreadySucceeded };
  }

  const token = decryptToken(tenant.wa_access_token as string) as string;
  if (!token) return { waStatus: alreadySucceeded.length ? 'partially_sent' : 'failed', recipients: alreadySucceeded };

  const doneSet = new Set(alreadySucceeded.map(r => r.phone));
  const rawRecipients: { phone: string; role: 'staff' | 'manager' }[] = [];
  if (tenant.staff_phone) rawRecipients.push({ phone: normalizeStaffPhone(tenant.staff_phone), role: 'staff' });
  if (tenant.manager_phone) rawRecipients.push({ phone: normalizeStaffPhone(tenant.manager_phone), role: 'manager' });

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

    if (session.windowOpen) {
      try {
        const sendResult = await sendTextMessage(token, tenant.wa_phone_number_id, recipient.phone, body);
        results.push({ phone: recipient.phone, role: recipient.role, status: 'sent_session', wa_message_id: sendResult.messageId });
        if (session.conversationId) await logOutboundMessage(tenantId, session.conversationId, body, 'text', sendResult.messageId);
        continue;
      } catch (err) {
        if (!isWindowClosedError(err)) {
          results.push({ phone: recipient.phone, role: recipient.role, status: 'failed', error: (err as Error).message });
          continue;
        }
        // fall through to template fallback below
      }
    }

    // Window closed (or just closed on send) — fall back to the bound template.
    const template = await resolveEventTemplate(tenantId, eventType);
    if (!template) {
      results.push({ phone: recipient.phone, role: recipient.role, status: 'failed', error: 'Window closed, no fallback template bound', no_fallback_template: true });
      continue;
    }

    try {
      const positional = mapVariablesToPositional(template.variableMap, variables);
      const sendResult = await sendTemplateMessage(token, tenant.wa_phone_number_id, recipient.phone, template.name, positional, template.language);
      results.push({ phone: recipient.phone, role: recipient.role, status: 'sent_template', wa_message_id: sendResult.messageId });
      if (session.conversationId) await logOutboundMessage(tenantId, session.conversationId, `[Template: ${template.name}]`, 'template', sendResult.messageId, template.name);
    } catch (tplErr) {
      results.push({ phone: recipient.phone, role: recipient.role, status: 'failed', error: (tplErr as Error).message });
    }
  }

  return { waStatus: summarizeStatus(results), recipients: results };
}

// Pure — exported so the branching (all-sent / partial / all-failed /
// no-template) is unit-testable without a DB.
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
  const nextRetryAt = retryable && attemptCount < MAX_RETRY_ATTEMPTS
    ? new Date(Date.now() + RETRY_BACKOFF_MS * attemptCount).toISOString()
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
