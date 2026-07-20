// ═══════════════════════════════════════════════════════════
// 🏢 Aries AI Platform Sender
// ═══════════════════════════════════════════════════════════
// Sends WhatsApp messages FROM the Aries AI platform number
// (8107722269, phone_number_id=1207672335754940).
//
// Used when a client's own WABA cannot reach their staff —
// window closed + no approved client template (Meta error 3835016).
// Templates are registered ONCE on the Aries AI WABA and work
// for every client with no per-client Meta setup needed.
//
// Required env var:
//   PLATFORM_WA_PHONE_NUMBER_ID=1207672335754940
//
// ── Templates to register in Meta Business Manager ──────────
// WhatsApp → Message Templates → Create Template
// All are UTILITY category, English, no header unless noted.
//
// NOTE: Meta does not allow a variable at the very start or end of a body.
// All bodies below begin with static text before the first {{variable}}.
//
// 1. aries_booking_alert
//    Header (TEXT): New Booking 🎉
//    Body:
//      New booking for *{{1}}*
//
//      👤 Customer: {{2}}
//      📞 Phone: {{3}}
//      📅 Date: {{4}}
//      ⏰ Time: {{5}}
//      👥 Count: {{6}}
//      📝 Notes: {{7}}
//
//      Call them directly for any changes.
//
// 2. aries_assistance_alert
//    Header (TEXT): ⚡ Assistance Needed
//    Body:
//      Alert from *{{1}}*
//
//      👤 Customer: {{2}}
//      📌 Reason: {{3}}
//      💬 Last message: {{4}}
//
//      The AI has paused. Please take over in your dashboard.
//
// 3. aries_payment_alert
//    Header (TEXT): Payment Received 💰
//    Body:
//      Payment received for *{{1}}*
//
//      👤 Customer: {{2}}
//      💰 Amount: ₹{{3}}
//      📋 Reference: {{4}}
//
//      Payment recorded successfully.
//
// 4. aries_cancellation_alert
//    Header (TEXT): Booking Cancelled
//    Body:
//      Cancellation for *{{1}}*
//
//      👤 Customer: {{2}}
//      📅 Date: {{3}}
//      ⏰ Time: {{4}}
//      👥 Count: {{5}}
//
//      This booking has been cancelled.
//
// 5. aries_staff_keepalive   (for window maintenance)
//    Body:
//      📋 Aries AI check-in for *{{1}}*.
//
//      Tap below to confirm you're receiving alerts.
//    Button: QUICK_REPLY → "✅ Got it"
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';
import { sendTemplateMessage, sendInteractiveButtonsMessage } from '@/lib/meta/service';
import type { SystemEventType } from '@/lib/whatsapp/templateManager';

const PLATFORM_KEEPALIVE_TEMPLATE = 'staff_keepalive';

// Aries AI's own WABA phone_number_id (see header comment). Used whenever
// PLATFORM_WA_PHONE_NUMBER_ID isn't set in the environment, so a missing/
// misconfigured env var can't silently break platform-wide alert delivery.
// The tenant row holding these credentials is NOT named "Aries AI" in the
// DB (a prior lookup assumed business_name === 'Aries AI', which never
// matched and made this fallback permanently dead) — key off the phone
// number id instead, which is what actually identifies the platform WABA.
const DEFAULT_PLATFORM_PHONE_NUMBER_ID = '1207672335754940';

// Maps each system event to its platform template name + variable builder
const EVENT_TEMPLATES: Record<string, {
  name: string;
  buildVars: (businessName: string, vars: Record<string, string>) => string[];
}> = {
  booking_confirmation: {
    name: 'aries_booking_alert',
    buildVars: (biz, v) => [
      biz,
      v.customer_name || v.guest_name || 'Guest',
      v.customer_phone || v.phone     || '—',
      v.booking_date  || v.date       || '—',
      v.booking_time  || v.time       || '—',
      v.guests_count  || v.guests     || '—',
      v.notes         || v.message    || '—',
    ],
  },
  reservation_update: {
    name: 'aries_booking_alert',
    buildVars: (biz, v) => [
      biz,
      v.customer_name || v.guest_name || 'Guest',
      v.customer_phone || v.phone     || '—',
      v.booking_date  || v.date       || '—',
      v.booking_time  || v.time       || '—',
      v.guests_count  || v.guests     || '—',
      v.notes         || v.message    || '—',
    ],
  },
  human_assistance: {
    name: 'aries_assistance_alert',
    buildVars: (biz, v) => [
      biz,
      v.customer_name  || 'Customer',
      v.reason         || 'Assistance required',
      v.last_message   || v.message || v.bodyText || '—',
    ],
  },
  support_response: {
    name: 'aries_assistance_alert',
    buildVars: (biz, v) => [
      biz,
      v.customer_name || 'Customer',
      v.reason        || 'Support needed',
      v.last_message  || v.message || '—',
    ],
  },
  payment_confirmation: {
    name: 'aries_payment_alert',
    buildVars: (biz, v) => [
      biz,
      v.customer_name || 'Customer',
      v.amount        || v.total  || '—',
      v.reference     || v.order_id || v.payment_id || '—',
    ],
  },
  order_update: {
    name: 'aries_payment_alert',
    buildVars: (biz, v) => [
      biz,
      v.customer_name || 'Customer',
      v.amount        || '—',
      v.reference     || v.order_id || '—',
    ],
  },
  callback_request: {
    name: 'aries_assistance_alert',
    buildVars: (biz, v) => [
      biz,
      v.customer_name || 'Customer',
      'Callback requested',
      v.message || v.last_message || '—',
    ],
  },
};

// Generic fallback for event types without a specific template
const GENERIC_TEMPLATE = {
  name: 'aries_booking_alert',
  buildVars: (biz: string, v: Record<string, string>) => [
    biz,
    v.customer_name  || 'Customer',
    v.customer_phone || v.phone || '—',
    v.booking_date   || '—',
    v.booking_time   || '—',
    v.guests_count   || '—',
    v.notes || v.message || '—',
  ],
};

// Always returns true — the platform sender discovers its creds from the DB
// (Aries AI tenant row). No env var required for the gate check.
export function isPlatformConfigured(): boolean {
  return true;
}

// Cached per cold-start — avoids a DB hit on every send
let _cachedCreds: { token: string; phoneId: string; tenantId: string } | null = null;

async function getPlatformCreds(): Promise<{ token: string; phoneId: string; tenantId: string } | null> {
  if (_cachedCreds) return _cachedCreds;

  const phoneNumberId = process.env.PLATFORM_WA_PHONE_NUMBER_ID || DEFAULT_PLATFORM_PHONE_NUMBER_ID;

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, wa_access_token, wa_phone_number_id')
    .eq('wa_phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error || !data?.wa_access_token || !data?.wa_phone_number_id) {
    console.error('[platform-send] Could not load platform credentials:', error?.message ?? `no tenant found for phone_number_id ${phoneNumberId}`);
    return null;
  }

  const token = decryptToken(data.wa_access_token);
  if (!token) { console.error('[platform-send] Token decryption failed'); return null; }

  _cachedCreds = { token, phoneId: data.wa_phone_number_id, tenantId: data.id };
  return _cachedCreds;
}

// Logs a platform send to the messages table under the Aries AI tenant so the
// existing webhook status pipeline marks it sent→delivered→read→failed and it
// shows in the dashboard. This is what makes staff-alert delivery *visible and
// verifiable* per phone instead of a blind "accepted by Meta".
async function logPlatformSend(
  tenantId: string,
  staffPhone: string,
  waMessageId: string | undefined,
  label: string,
  displayText: string,
): Promise<void> {
  try {
    // One conversation per staff phone under the platform tenant. Use limit(1)
    // (not maybeSingle) — legacy duplicate rows for a phone must not error out.
    const { data: existingRows } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('sender_id', staffPhone)
      .order('created_at', { ascending: true })
      .limit(1);

    let conversationId = existingRows?.[0]?.id ?? null;
    if (!conversationId) {
      const { data: created } = await supabaseAdmin
        .from('conversations')
        .insert({
          tenant_id: tenantId,
          sender_id: staffPhone,
          sender_name: 'Staff Alert',
          channel: 'whatsapp',
          is_active: true,
          // Never let the platform-tenant AI engage staff who reply to an alert.
          bot_paused: true,
          created_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      conversationId = created?.id ?? null;
    } else {
      // Ensure the bot stays paused on this conversation even if it pre-existed.
      await supabaseAdmin
        .from('conversations')
        .update({ bot_paused: true, last_message_at: new Date().toISOString() })
        .eq('id', conversationId);
    }
    if (!conversationId) return;

    await supabaseAdmin.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: 'outbound',
      content: displayText,
      message_type: 'template',
      channel: 'whatsapp',
      status: waMessageId ? 'sent' : 'failed',
      wa_message_id: waMessageId ?? null,
      metadata: { interactive_type: 'template', template_name: label, platform_alert: true },
    });
  } catch (err) {
    console.error('[platform-send] logPlatformSend failed:', (err as Error).message);
  }
}

// Renders the actual WhatsApp body text for a template + its positional vars,
// so the dashboard shows what staff really received instead of a placeholder
// like "[Platform alert: aries_booking_alert]".
function renderTemplateText(templateName: string, vars: string[]): string {
  switch (templateName) {
    case 'aries_booking_alert':
      return `New booking for *${vars[0]}*\n\n👤 Customer: ${vars[1]}\n📞 Phone: ${vars[2]}\n📅 Date: ${vars[3]}\n⏰ Time: ${vars[4]}\n👥 Count: ${vars[5]}\n📝 Notes: ${vars[6]}\n\nCall them directly for any changes.`;
    case 'aries_assistance_alert':
      return `Alert from *${vars[0]}*\n\n👤 Customer: ${vars[1]}\n📌 Reason: ${vars[2]}\n💬 Last message: ${vars[3]}\n\nThe AI has paused. Please take over in your dashboard.`;
    case 'aries_payment_alert':
      return `Payment received for *${vars[0]}*\n\n👤 Customer: ${vars[1]}\n💰 Amount: ₹${vars[2]}\n📋 Reference: ${vars[3]}\n\nPayment recorded successfully.`;
    case 'aries_cancellation_alert':
      return `Cancellation for *${vars[0]}*\n\n👤 Customer: ${vars[1]}\n📅 Date: ${vars[2]}\n⏰ Time: ${vars[3]}\n👥 Count: ${vars[4]}\n\nThis booking has been cancelled.`;
    case 'staff_keepalive':
      return `📋 Aries AI check-in for *${vars[0]}*.\n\nTap below to confirm you're receiving alerts.`;
    default:
      return `[Template: ${templateName}] ${vars.join(', ')}`;
  }
}

// Universal approved fallback. aries_assistance_alert is a 4-var
// (business, customer, reason, last_message) UTILITY template that suits any
// event, so if a more specific template is unavailable/unapproved we still
// deliver rather than dropping the alert.
const UNIVERSAL_FALLBACK = {
  name: 'aries_assistance_alert',
  buildVars: (biz: string, eventType: string, v: Record<string, string>) => [
    biz,
    v.customer_name || v.guest_name || 'Customer',
    v.reason || eventType.replace(/_/g, ' '),
    v.last_message || v.message || v.notes || [
      v.amount ? `Amount: ₹${v.amount}` : null,
      v.booking_date ? `Date: ${v.booking_date}` : null,
      v.booking_time ? `Time: ${v.booking_time}` : null,
    ].filter(Boolean).join(', ') || '—',
  ],
};

/**
 * Sends the right structured template for each event type from the Aries AI
 * platform number. Picks booking / assistance / payment / cancellation template
 * automatically. If that specific template send fails (e.g. it is still pending
 * Meta approval), it retries once with the universally-approved assistance
 * template so the alert is never silently dropped.
 */
export async function sendPlatformEventAlert(
  toPhone: string,
  businessName: string,
  eventType: SystemEventType | string,
  variables: Record<string, string>,
): Promise<{ messageId?: string }> {
  const creds = await getPlatformCreds();
  if (!creds) throw new Error('Platform credentials unavailable');

  const tpl = EVENT_TEMPLATES[eventType] ?? GENERIC_TEMPLATE;
  const positional = tpl.buildVars(businessName, variables);

  try {
    const res = await sendTemplateMessage(creds.token, creds.phoneId, toPhone, tpl.name, positional, 'en');
    await logPlatformSend(creds.tenantId, toPhone, res.messageId, tpl.name, renderTemplateText(tpl.name, positional));
    return res;
  } catch (primaryErr) {
    // Don't double-send if the primary WAS already the fallback template.
    if (tpl.name === UNIVERSAL_FALLBACK.name) throw primaryErr;

    console.warn(`[platform-send] "${tpl.name}" failed (${(primaryErr as Error).message}) — retrying with ${UNIVERSAL_FALLBACK.name}`);
    const fallbackVars = UNIVERSAL_FALLBACK.buildVars(businessName, String(eventType), variables);
    const res = await sendTemplateMessage(creds.token, creds.phoneId, toPhone, UNIVERSAL_FALLBACK.name, fallbackVars, 'en');
    await logPlatformSend(creds.tenantId, toPhone, res.messageId, UNIVERSAL_FALLBACK.name, renderTemplateText(UNIVERSAL_FALLBACK.name, fallbackVars));
    return res;
  }
}

/**
 * Sends a keepalive ping from the Aries AI platform number.
 * Opens or renews the 24h window between Aries AI and the staff phone.
 */
export async function sendPlatformKeepalive(
  toPhone: string,
  businessName: string,
  platformWindowOpen: boolean,
): Promise<'ok' | 'failed'> {
  const creds = await getPlatformCreds();
  if (!creds) return 'failed';

  try {
    let messageId: string | undefined;
    let displayText: string;
    if (platformWindowOpen) {
      displayText = `📋 Aries AI check-in for *${businessName}*.\n\nTap below to confirm you're receiving booking and handoff alerts on this number.`;
      const res = await sendInteractiveButtonsMessage(
        creds.token, creds.phoneId, toPhone,
        displayText,
        [{ id: 'platform_keepalive_ack', title: '✅ Got it' }],
      );
      messageId = res?.messageId;
    } else {
      const res = await sendTemplateMessage(
        creds.token, creds.phoneId, toPhone,
        PLATFORM_KEEPALIVE_TEMPLATE,
        [businessName],
        'en',
      );
      messageId = res?.messageId;
      displayText = renderTemplateText(PLATFORM_KEEPALIVE_TEMPLATE, [businessName]);
    }
    await logPlatformSend(creds.tenantId, toPhone, messageId, PLATFORM_KEEPALIVE_TEMPLATE, displayText);
    return 'ok';
  } catch (err) {
    console.error(`[platform-send] keepalive failed for +${toPhone} (${businessName}):`, (err as Error).message);
    return 'failed';
  }
}
