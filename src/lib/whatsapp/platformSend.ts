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
// 1. aries_booking_alert
//    Header (TEXT): New Booking 🎉
//    Body:
//      Restaurant: *{{1}}*
//
//      👤 Guest: {{2}}
//      📅 Date: {{3}}
//      ⏰ Time: {{4}}
//      👥 Guests: {{5}}
//      📝 Notes: {{6}}
//
//      Open your dashboard to confirm or manage this booking.
//
// 2. aries_assistance_alert
//    Header (TEXT): ⚡ Assistance Needed
//    Body:
//      Restaurant: *{{1}}*
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
//      Restaurant: *{{1}}*
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
//      Restaurant: *{{1}}*
//
//      👤 Guest: {{2}}
//      📅 Date: {{3}}
//      ⏰ Time: {{4}}
//      👥 Guests: {{5}}
//
//      This booking has been cancelled.
//
// 5. aries_staff_keepalive   (for window maintenance)
//    Body:
//      📋 Aries AI check-in for *{{1}}*.
//
//      Tap below to confirm you're receiving booking and handoff alerts.
//    Button: QUICK_REPLY → "✅ Got it"
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';
import { sendTemplateMessage, sendInteractiveButtonsMessage } from '@/lib/meta/service';
import type { SystemEventType } from '@/lib/whatsapp/templateManager';

const PLATFORM_KEEPALIVE_TEMPLATE = 'aries_staff_keepalive';

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
      v.booking_date  || v.date        || '—',
      v.booking_time  || v.time        || '—',
      v.guests_count  || v.guests      || '—',
      v.notes         || v.message     || '—',
    ],
  },
  reservation_update: {
    name: 'aries_booking_alert',
    buildVars: (biz, v) => [
      biz,
      v.customer_name || v.guest_name || 'Guest',
      v.booking_date  || v.date        || '—',
      v.booking_time  || v.time        || '—',
      v.guests_count  || v.guests      || '—',
      v.notes         || v.message     || '—',
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
    v.customer_name || 'Customer',
    v.booking_date  || '—',
    v.booking_time  || '—',
    v.guests_count  || '—',
    v.notes || v.message || '—',
  ],
};

export function isPlatformConfigured(): boolean {
  return Boolean(process.env.PLATFORM_WA_PHONE_NUMBER_ID);
}

// Cached per cold-start — avoids a DB hit on every send
let _cachedCreds: { token: string; phoneId: string } | null = null;

async function getPlatformCreds(): Promise<{ token: string; phoneId: string } | null> {
  const phoneNumberId = process.env.PLATFORM_WA_PHONE_NUMBER_ID;
  if (!phoneNumberId) return null;
  if (_cachedCreds) return _cachedCreds;

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('wa_access_token')
    .eq('wa_phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error || !data?.wa_access_token) {
    console.error('[platform-send] Could not load platform credentials:', error?.message ?? 'no row found');
    return null;
  }

  const token = decryptToken(data.wa_access_token);
  if (!token) { console.error('[platform-send] Token decryption failed'); return null; }

  _cachedCreds = { token, phoneId: phoneNumberId };
  return _cachedCreds;
}

/**
 * Sends the right structured template for each event type from the Aries AI
 * platform number. Picks booking / assistance / payment / cancellation template
 * automatically. Falls back to the generic alert template if no specific match.
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

  return sendTemplateMessage(creds.token, creds.phoneId, toPhone, tpl.name, positional, 'en');
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
    if (platformWindowOpen) {
      await sendInteractiveButtonsMessage(
        creds.token, creds.phoneId, toPhone,
        `📋 Aries AI check-in for *${businessName}*.\n\nTap below to confirm you're receiving booking and handoff alerts on this number.`,
        [{ id: 'platform_keepalive_ack', title: '✅ Got it' }],
      );
    } else {
      await sendTemplateMessage(
        creds.token, creds.phoneId, toPhone,
        PLATFORM_KEEPALIVE_TEMPLATE,
        [businessName],
        'en',
      );
    }
    return 'ok';
  } catch (err) {
    console.error(`[platform-send] keepalive failed for +${toPhone} (${businessName}):`, (err as Error).message);
    return 'failed';
  }
}
