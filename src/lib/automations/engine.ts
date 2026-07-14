import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendTextMessage, sendMediaMessage, sendTemplateMessage } from '@/lib/meta/service';
import { getTenantById } from '@/lib/tenant/manager';
import { decryptToken } from '@/lib/utils/crypto';
import { toSignedMediaUrl } from '@/lib/utils/storage';
import { firstName as toFirstName } from '@/lib/utils/name';
import { greetingName, NEUTRAL_GREETING } from '@/lib/utils/contact-name';
import { KNOWN_VARIABLE_NAMES } from '@/lib/automations/variables';
import { evaluateConditions, pickVariant, isWindowClosedError, type ConditionGroup } from '@/lib/automations/logic';
import { getRedisClient } from '@/lib/redis/client';
import { notifyAdmin } from '@/lib/alerts/admin';
import { createHash } from 'crypto';
import * as Sentry from '@/lib/sentry-stub';
import type { Tenant } from '@/lib/types';

function generateIdempotencyKey(automationId: string, leadId: string, scheduledAt: string): string {
  return createHash('sha256')
    .update(`${automationId}:${leadId}:${scheduledAt}`)
    .digest('hex')
    .slice(0, 32);
}

const isMetaConfigured = (t: Tenant) => !!t.wa_access_token && !!t.wa_phone_number_id;

const DELAY_MS: Record<string, number> = {
  minutes: 60_000,
  hours:   3_600_000,
  days:    86_400_000,
  weeks:   604_800_000,
};

export type TriggerEvent =
  | 'booking_confirmed'
  | 'booking_reminder'
  | 'new_lead'
  | 'escalation_triggered'
  | 'escalation_resolved'
  | 'payment_received'
  | 'session_window_expiring';

export interface AutomationPayload {
  tenantId: string;
  event: TriggerEvent;
  leadId?: string;
  conversationId?: string;
  phone?: string;
  variables?: Record<string, string>;
  // For 'booking_reminder': the UTC instant of the booking itself. The reminder
  // is scheduled `delay` BEFORE this, instead of `delay` AFTER the trigger.
  eventAt?: string;
}

// The subset of an automation row the send path needs. Comes either from the
// full row (immediate trigger) or the joined select (cron processing).
interface SendableAutomation {
  id?: string;
  message_text: string;
  message_text_b?: string | null;
  ab_split_percent?: number | null;
  media_url: string | null;
  media_type: string | null;
  cancel_on_reply?: boolean;
  conditions?: ConditionGroup | null;
  fallback_template_name?: string | null;
}

// Thrown when an automation's send conditions (L6) are not satisfied. Treated as
// an expected cancellation (status='cancelled'), NOT a failure — never retried.
class ConditionSkip extends Error {
  constructor(reason: string) {
    super(`Condition not met: ${reason}`);
    this.name = 'ConditionSkip';
  }
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

  // Only live (active, not soft-deleted) rules fire.
  const { data: rules } = await supabaseAdmin
    .from('automations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('trigger_event', event)
    .eq('status', 'active')
    .is('deleted_at', null);

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

      // ── L9: per-lead frequency cap ──
      // Skip if this automation has already reached its daily send cap for this
      // lead (counts sent/pending/processing in the last 24h). NULL = unlimited.
      if (rule.max_per_lead_per_day != null) {
        const within = await withinFrequencyCap(rule.id, leadId, rule.max_per_lead_per_day);
        if (!within) {
          console.log(`[AUTOMATION_FREQ_CAP] rule=${rule.id} lead=${leadId} — daily cap ${rule.max_per_lead_per_day} reached, skipping`);
          continue;
        }
      }

      const delayMs = (rule.delay_value || 0) * (DELAY_MS[rule.delay_unit] || DELAY_MS.minutes);
      const isReminder = event === 'booking_reminder';

      // ── Reminder scheduling: fire `delay` BEFORE the booking, not after ──
      if (isReminder) {
        if (!payload.eventAt) {
          console.log(`[AUTOMATION_SKIP] rule=${rule.id} — booking_reminder with no eventAt`);
          continue;
        }
        const eventMs = new Date(payload.eventAt).getTime();
        if (isNaN(eventMs) || eventMs <= Date.now()) {
          console.log(`[AUTOMATION_SKIP] rule=${rule.id} — booking already in the past, no reminder`);
          continue;
        }
        // Reminder time = booking time − lead time. If the booking is sooner than
        // the lead time (e.g. booked 2h out, reminder set 1 day before), we can't
        // honour the full lead time — send on the next tick rather than drop it.
        let scheduledMs = eventMs - delayMs;
        if (scheduledMs < Date.now()) scheduledMs = Date.now() + 5_000;

        const scheduledAt = new Date(scheduledMs).toISOString();
        const idemKey = generateIdempotencyKey(rule.id, leadId, scheduledAt);
        console.log(`[AUTOMATION_JOB_SCHEDULED] rule=${rule.id} lead=${leadId} (reminder) scheduledAt=${scheduledAt} bookingAt=${payload.eventAt} ${rule.delay_value}${rule.delay_unit} before idemKey=${idemKey}`);
        const { error: insertErr } = await supabaseAdmin.from('automation_queue').insert({
          automation_id: rule.id,
          tenant_id: tenantId,
          lead_id: leadId,
          conversation_id: conversationId || null,
          scheduled_at: scheduledAt,
          status: 'pending',
          variables: variables ?? null,
          idempotency_key: idemKey,
        });
        if (insertErr && /idempotency|duplicate|unique/i.test(insertErr.message || '')) {
          console.log(`[AUTOMATION_IDEMPOTENCY] rule=${rule.id} lead=${leadId} — duplicate blocked by idempotency key`);
          continue;
        }
        await bumpCounter(rule.id, 1, 0);
        continue;
      }

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

        const sentAt = new Date().toISOString();
        try {
          const result = await sendAutomationMessage(tenant, lead, rule, conversationId || null, variables);
          console.log(`[AUTOMATION_MESSAGE_SENT] rule=${rule.id} lead=${leadId} msgId=${result.messageId} variant=${result.variant ?? '-'} (immediate)`);

          // Record in queue for dedup + execution history
          await supabaseAdmin.from('automation_queue').insert({
            automation_id: rule.id,
            tenant_id: tenantId,
            lead_id: leadId,
            conversation_id: conversationId || null,
            scheduled_at: sentAt,
            status: 'sent',
            sent_at: sentAt,
            wa_message_id: result.messageId,
            variant: result.variant,
            variables: variables ?? null,
            idempotency_key: generateIdempotencyKey(rule.id, leadId, sentAt),
          }).then(null, () => {});

          await bumpCounter(rule.id, 0, 1);
        } catch (sendErr) {
          if (sendErr instanceof ConditionSkip) {
            console.log(`[AUTOMATION_CONDITION_SKIP] rule=${rule.id} lead=${leadId} — ${sendErr.message}`);
            await supabaseAdmin.from('automation_queue').insert({
              automation_id: rule.id,
              tenant_id: tenantId,
              lead_id: leadId,
              conversation_id: conversationId || null,
              scheduled_at: sentAt,
              status: 'cancelled',
              error_message: sendErr.message,
              variables: variables ?? null,
              idempotency_key: generateIdempotencyKey(rule.id, leadId, sentAt),
            }).then(null, () => {});
            await bumpCounter(rule.id, 1, 0);
            continue;
          }
          throw sendErr;
        }
      } else {
        const scheduledAt = new Date(Date.now() + delayMs).toISOString();
        const idemKey = generateIdempotencyKey(rule.id, leadId, scheduledAt);
        console.log(`[AUTOMATION_JOB_SCHEDULED] rule=${rule.id} lead=${leadId} scheduledAt=${scheduledAt} delay=${rule.delay_value}${rule.delay_unit} idemKey=${idemKey}`);
        const { error: insertErr } = await supabaseAdmin.from('automation_queue').insert({
          automation_id: rule.id,
          tenant_id: tenantId,
          lead_id: leadId,
          conversation_id: conversationId || null,
          scheduled_at: scheduledAt,
          status: 'pending',
          variables: variables ?? null,
          idempotency_key: idemKey,
        });
        if (insertErr && /idempotency|duplicate|unique/i.test(insertErr.message || '')) {
          console.log(`[AUTOMATION_IDEMPOTENCY] rule=${rule.id} lead=${leadId} — duplicate blocked by idempotency key`);
          continue;
        }
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

// Max items to claim per run. Kept in line with what one 30s serverless
// invocation can actually send (~2-3s per WhatsApp call). Claiming more than
// we can drain would leave the remainder stuck in 'processing' until the
// 5-min requeue. Overflow stays 'pending' and drains on the next minute's tick.
const CLAIM_BATCH = 15;

// Per-tenant send budget per minute (fairness + Meta pair-rate safety). One
// tenant with a flood of due items can't monopolise a drain or hammer their
// number past Meta's limits — overflow defers to the next minute. Fails OPEN
// when Redis is unavailable so sends are never silently blocked.
const TENANT_RATE_PER_MIN = Number(process.env.AUTOMATION_TENANT_RATE_PER_MIN || 30);

export async function processPendingAutomations(): Promise<number> {
  let claimedCount = 0;
  let sent = 0;

  try {
    const now = new Date().toISOString();

    // Recovery: release items stuck in 'processing' for >5 minutes since they
    // were CLAIMED (serverless timeout/crash mid-send). Keys off claimed_at —
    // created_at/scheduled_at would mis-fire and double-send a healthy in-flight
    // item. Legacy rows with null claimed_at are swept by the SQL safety-net cron.
    const stuckCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: stuck } = await supabaseAdmin
      .from('automation_queue')
      .update({ status: 'pending', claimed_at: null })
      .eq('status', 'processing')
      .lt('claimed_at', stuckCutoff)
      .select('id');
    if (stuck && stuck.length > 0) {
      console.log(`[AUTOMATION_RECOVERY] released ${stuck.length} stuck items back to pending`);
    }

    // Claim items atomically: set status='processing' + stamp claimed_at so
    // concurrent callers don't double-send and recovery can age them correctly.
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from('automation_queue')
      .update({ status: 'processing' as string, claimed_at: now })
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .limit(CLAIM_BATCH)
      .select('id');

    if (claimErr || !claimed || claimed.length === 0) return 0;
    claimedCount = claimed.length;

    const claimedIds = claimed.map(c => c.id);
    console.log(`[AUTOMATION_JOB_STARTED] claimed ${claimedIds.length} due queue items`);

    const { data: queueItems, error } = await supabaseAdmin
      .from('automation_queue')
      .select(`
        id, automation_id, tenant_id, lead_id, conversation_id, variables, error_message, created_at,
        automations!inner ( id, tenant_id, message_text, message_text_b, ab_split_percent, media_url, media_type, cancel_on_reply, conditions, fallback_template_name, status, deleted_at ),
        leads!inner ( name, phone, lead_status )
      `)
      .in('id', claimedIds);

    if (error) {
      console.error(`[automations] queue query error:`, error.message);
      // Release claimed items back to pending
      await supabaseAdmin.from('automation_queue').update({ status: 'pending', claimed_at: null }).in('id', claimedIds);
      return 0;
    }
    if (!queueItems || queueItems.length === 0) return 0;

    for (const item of queueItems) {
      try {
        const automation = item.automations as unknown as SendableAutomation & {
          id: string; tenant_id: string; status: string; deleted_at: string | null;
        };
        const lead = item.leads as unknown as {
          name: string; phone: string; lead_status: string;
        };

        // Automation paused or soft-deleted after this item was queued → don't send.
        if (automation.status !== 'active' || automation.deleted_at) {
          await updateQueueStatus(item.id, 'cancelled', 'Automation paused or deleted');
          continue;
        }

        if (lead.lead_status === 'converted' || lead.lead_status === 'lost') {
          await updateQueueStatus(item.id, 'cancelled', 'Lead status changed');
          continue;
        }

        // M6: close the cancel-on-reply race. The reply-time canceller only
        // catches 'pending' items; an item already 'processing' could slip
        // through. Re-check for an inbound reply since this item was created.
        if (automation.cancel_on_reply && item.conversation_id) {
          const { data: reply } = await supabaseAdmin
            .from('messages')
            .select('id')
            .eq('conversation_id', item.conversation_id)
            .eq('direction', 'inbound')
            .gt('created_at', item.created_at)
            .limit(1)
            .maybeSingle();
          if (reply) {
            await updateQueueStatus(item.id, 'cancelled', 'Customer replied before send');
            continue;
          }
        }

        const tenant = await getTenantById(item.tenant_id);
        if (!tenant || !tenant.is_active || !isMetaConfigured(tenant)) {
          await updateQueueStatus(item.id, 'cancelled', 'Tenant inactive or WA not configured');
          continue;
        }

        // H6: per-tenant per-minute send budget. Over budget → leave the item
        // for the next tick (not a failure), so one tenant can't starve others.
        if (!(await withinTenantRateBudget(item.tenant_id))) {
          await supabaseAdmin
            .from('automation_queue')
            .update({ status: 'pending', claimed_at: null, scheduled_at: new Date(Date.now() + 60_000).toISOString() })
            .eq('id', item.id);
          console.log(`[AUTOMATION_RATE_DEFER] item=${item.id} tenant=${item.tenant_id} — over ${TENANT_RATE_PER_MIN}/min, deferred`);
          continue;
        }

        console.log(`[AUTOMATION_JOB_PROCESSING] item=${item.id} lead=${lead.phone} automation=${automation.id} vars=${JSON.stringify(item.variables)}`);
        const result = await sendAutomationMessage(tenant, lead, automation, item.conversation_id, item.variables ?? undefined);

        await supabaseAdmin
          .from('automation_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            wa_message_id: result.messageId,
            variant: result.variant,
          })
          .eq('id', item.id);

        await bumpCounter(automation.id, 0, 1);
        sent++;
        console.log(`[AUTOMATION_MESSAGE_SENT] item=${item.id} lead=${lead.phone} msgId=${result.messageId} variant=${result.variant ?? '-'}`);
      } catch (err) {
        // Condition not met → expected cancellation, never retry.
        if (err instanceof ConditionSkip) {
          console.log(`[AUTOMATION_CONDITION_SKIP] item=${item.id} — ${err.message}`);
          await updateQueueStatus(item.id, 'cancelled', err.message);
          continue;
        }

        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        // Non-retryable failures: bad variables, broken render, or 24h window
        // closed (only an approved template can reach the customer — retrying
        // the free-form send will never succeed).
        const isPermanent =
          errMsg.startsWith('Unresolved variables') ||
          errMsg.startsWith('Rendered message contains') ||
          errMsg.startsWith('Outside 24h window');
        console.error(`[AUTOMATION_MESSAGE_FAILED] item=${item.id} permanent=${isPermanent}:`, errMsg);
        Sentry.captureException(err);

        if (isPermanent) {
          await updateQueueStatus(item.id, 'failed', errMsg);
        } else {
          // Transient error (Meta API, network) — requeue for retry up to 3 times
          const prevRetry = (item.error_message || '').match(/Retry (\d+)\/3/);
          const retryCount = (prevRetry ? parseInt(prevRetry[1]) : 0) + 1;
          if (retryCount <= 3) {
            const backoffMs = retryCount * 30_000;
            await supabaseAdmin.from('automation_queue').update({
              status: 'pending',
              claimed_at: null,
              scheduled_at: new Date(Date.now() + backoffMs).toISOString(),
              error_message: `Retry ${retryCount}/3: ${errMsg}`,
            }).eq('id', item.id);
            console.log(`[AUTOMATION_RETRY] item=${item.id} retry=${retryCount}/3 backoff=${backoffMs}ms`);
          } else {
            await updateQueueStatus(item.id, 'failed', `Exhausted 3 retries: ${errMsg}`);
          }
        }
      }
    }

    console.log(`[AUTOMATION_JOB_DONE] processed=${claimedCount} sent=${sent}`);
    return sent;
  } finally {
    // M4: heartbeat every run (even 0 claimed) so diagnostics can prove the
    // minute-cron is alive rather than inferring it from queue age.
    await recordDrainHeartbeat({ claimed: claimedCount, sent });
  }
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
    .update({ status: 'cancelled', error_message: 'Customer replied' })
    .in('id', itemsToCancel.map(i => i.id));

  console.log(`[automations] cancelled ${itemsToCancel.length} pending items for lead ${leadId}`);
}

// ═══════════════════════════════════════
// INTERNAL: Send a single automation message
// ═══════════════════════════════════════

async function sendAutomationMessage(
  tenant: Tenant,
  lead: { name: string; phone: string },
  automation: SendableAutomation,
  conversationId: string | null,
  variables?: Record<string, string>,
): Promise<{ messageId: string | null; variant: 'A' | 'B' | null }> {
  const token = decryptToken(tenant.wa_access_token as string) as string;
  const phoneNumberId = tenant.wa_phone_number_id as string;

  const allVars: Record<string, string> = {
    customer_name: greetingName(lead.name),
    business_name: tenant.business_name || '',
    ...variables,
  };

  // ── L6: condition gating ──
  // Evaluated against resolved variables. Failing conditions cancel the send
  // (expected), they don't fail it.
  const cond = evaluateConditions(automation.conditions ?? null, allVars);
  if (!cond.passed) {
    throw new ConditionSkip(cond.reason || 'conditions not satisfied');
  }

  // ── L7: pick A/B variant deterministically by lead phone ──
  const picked = pickVariant(
    {
      message_text: automation.message_text,
      message_text_b: automation.message_text_b,
      ab_split_percent: automation.ab_split_percent,
    },
    lead.phone || lead.name || 'anon',
  );

  // ── Pre-send validation: detect unresolved placeholders BEFORE sending ──
  const { rendered, unresolved, unknownKeys } = renderTemplate(picked.text, allVars);

  if (unknownKeys.length > 0) {
    console.warn(`[AUTOMATION_UNKNOWN_VARS] lead=${lead.phone} unknownKeys=${unknownKeys.join(',')}`);
  }

  if (unresolved.length > 0) {
    const errMsg = `Unresolved variables: ${unresolved.join(', ')}`;
    console.error(`[AUTOMATION_VALIDATION_FAILED] lead=${lead.phone} vars=${JSON.stringify(allVars)} unresolved=${unresolved.join(',')}`);
    throw new Error(errMsg);
  }

  // Sanity check: if the rendered message has obviously broken lines like
  // "📅 at" or "👥 guests" with no actual data, block it.
  if (/📅\s+at\b/.test(rendered) || /👥\s+guests?\b/.test(rendered) || /🆔\s*Ref:\s*$/.test(rendered)) {
    const errMsg = 'Rendered message contains empty data lines — variables resolved to blank';
    console.error(`[AUTOMATION_VALIDATION_FAILED] lead=${lead.phone} message="${rendered.slice(0, 120)}"`);
    throw new Error(errMsg);
  }

  console.log(`[AUTOMATION_SENDING] lead=${lead.phone} variant=${picked.variant ?? '-'} vars=${JSON.stringify(allVars)} message="${rendered.slice(0, 100)}..."`);

  let metaMsgId: string | null = null;
  let sentMediaUrl: string | null = null;
  let sentMimeType: string | null = null;
  let sentMessageType = 'text';

  try {
    if (automation.media_url) {
      const signedUrl = await toSignedMediaUrl(automation.media_url);
      const mediaType = (automation.media_type || 'image') as 'image' | 'video' | 'document';
      const result = await sendMediaMessage(token, phoneNumberId, lead.phone, mediaType, signedUrl, rendered);
      metaMsgId = result?.messageId ?? null;
      sentMediaUrl = signedUrl;
      sentMimeType = mediaType === 'image' ? 'image/jpeg' : mediaType === 'video' ? 'video/mp4' : 'application/octet-stream';
      sentMessageType = mediaType;
    } else {
      const result = await sendTextMessage(token, phoneNumberId, lead.phone, rendered);
      metaMsgId = result?.messageId ?? null;
    }
  } catch (sendErr) {
    // ── L10: 24h window closed ──
    if (isWindowClosedError(sendErr)) {
      const fallback = await tryWindowFallback(tenant, token, phoneNumberId, lead, automation, allVars);
      if (fallback.sent) {
        metaMsgId = fallback.messageId;
        sentMessageType = 'template';
        sentMediaUrl = null;
      } else {
        throw new Error(
          `Outside 24h window — customer hasn't messaged in 24h, free-form blocked` +
          (automation.fallback_template_name ? ` and fallback template "${automation.fallback_template_name}" failed` : `. Set a fallback template to reach them`)
        );
      }
    } else {
      throw sendErr; // transient/other → classified by caller for retry
    }
  }

  console.log(`[AUTOMATION_API_RESULT] lead=${lead.phone} msgId=${metaMsgId} type=${sentMessageType}`);

  if (conversationId) {
    await supabaseAdmin.from('messages').insert({
      tenant_id: tenant.id,
      conversation_id: conversationId,
      direction: 'outbound',
      content: rendered,
      message_type: sentMessageType,
      channel: 'whatsapp',
      sender_id: null,
      status: metaMsgId ? 'sent' : 'failed',
      ai_generated: true,
      wa_message_id: metaMsgId,
      ...(sentMediaUrl && {
        media_url: sentMediaUrl,
        mime_type: sentMimeType,
        media_caption: rendered || null,
      }),
    });
  }

  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenant.id,
    event_type: 'automation_sent',
    channel: 'whatsapp',
    metadata: { lead_name: lead.name, automation_message: rendered.slice(0, 100), variant: picked.variant },
  }).then(null, () => {});

  return { messageId: metaMsgId, variant: picked.variant };
}

// ── L10 helper: attempt the approved-template fallback when the 24h window is
// closed. Best-effort: passes the customer's first name as the single body
// variable (the conventional shape for a simple utility/reminder template).
// Any failure (no template set, param mismatch, Meta error) returns sent=false
// so the caller marks the item failed and alerts the operator. ──
async function tryWindowFallback(
  tenant: Tenant,
  token: string,
  phoneNumberId: string,
  lead: { name: string; phone: string },
  automation: SendableAutomation,
  allVars: Record<string, string>,
): Promise<{ sent: boolean; messageId: string | null }> {
  if (!automation.fallback_template_name) {
    await alertWindowClosed(tenant, lead, automation, false);
    return { sent: false, messageId: null };
  }
  try {
    const firstName = allVars.first_name || toFirstName(lead.name) || allVars.customer_name || NEUTRAL_GREETING;
    const result = await sendTemplateMessage(token, phoneNumberId, lead.phone, automation.fallback_template_name, [firstName], 'en');
    console.log(`[AUTOMATION_WINDOW_FALLBACK_OK] lead=${lead.phone} template=${automation.fallback_template_name} msgId=${result.messageId}`);
    return { sent: true, messageId: result.messageId ?? null };
  } catch (tplErr) {
    console.error(`[AUTOMATION_WINDOW_FALLBACK_FAILED] lead=${lead.phone} template=${automation.fallback_template_name}:`, (tplErr as Error).message);
    await alertWindowClosed(tenant, lead, automation, true);
    return { sent: false, messageId: null };
  }
}

async function alertWindowClosed(
  tenant: Tenant,
  lead: { name: string; phone: string },
  automation: SendableAutomation,
  fallbackAttempted: boolean,
): Promise<void> {
  await notifyAdmin({
    dedupeKey: `automation_window_closed:${tenant.id}`,
    subject: `Automation blocked by WhatsApp 24h window`,
    summary: `An automation for ${tenant.business_name || tenant.id} couldn't reach a customer because the 24h messaging window is closed. ${fallbackAttempted ? 'The fallback template also failed.' : 'No fallback template is configured.'} Configure an approved WhatsApp template to reach customers outside the window.`,
    context: {
      tenant_id: tenant.id,
      lead_phone: lead.phone,
      automation_id: automation.id,
      fallback_template: automation.fallback_template_name || null,
      fallback_attempted: fallbackAttempted,
    },
  }).catch(() => {});
}

function renderTemplate(
  text: string,
  vars: Record<string, string>,
): { rendered: string; unresolved: string[]; unknownKeys: string[] } {
  const unresolved: string[] = [];
  const unknownKeys: string[] = [];
  const rendered = text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!KNOWN_VARIABLE_NAMES.has(key)) unknownKeys.push(key);
    const val = vars[key];
    if (val === undefined || val === null) {
      unresolved.push(key);
      return match;
    }
    return val;
  });
  return { rendered, unresolved, unknownKeys };
}

async function updateQueueStatus(id: string, status: string, errorMessage?: string): Promise<void> {
  await supabaseAdmin
    .from('automation_queue')
    .update({ status, error_message: errorMessage || null })
    .eq('id', id);
}

// ── L9: per-lead daily frequency cap check ──
async function withinFrequencyCap(automationId: string, leadId: string, cap: number): Promise<boolean> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabaseAdmin
    .from('automation_queue')
    .select('id', { count: 'exact', head: true })
    .eq('automation_id', automationId)
    .eq('lead_id', leadId)
    .in('status', ['sent', 'pending', 'processing'])
    .gte('created_at', since);
  return (count ?? 0) < cap;
}

// ── H6: per-tenant per-minute send budget (Redis sliding minute bucket) ──
// Fails OPEN (returns true) when Redis is unavailable — automations must never
// be silently blocked by a missing cache.
async function withinTenantRateBudget(tenantId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true;
  try {
    const bucket = Math.floor(Date.now() / 60_000);
    const key = `auto_rate:${tenantId}:${bucket}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 120);
    return n <= TENANT_RATE_PER_MIN;
  } catch {
    return true; // fail open
  }
}

// ── M4: record the drain heartbeat (best-effort) ──
async function recordDrainHeartbeat(detail: Record<string, unknown>): Promise<void> {
  try {
    await supabaseAdmin
      .from('system_heartbeats')
      .upsert({ key: 'automation_drain', last_run_at: new Date().toISOString(), detail }, { onConflict: 'key' });
  } catch {
    // Heartbeat is advisory; never let it break a drain.
  }
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
