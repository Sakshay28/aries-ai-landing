// ═══════════════════════════════════════════════════════════
// 🏢 Aries AI Platform Sender
// ═══════════════════════════════════════════════════════════
// Sends WhatsApp messages FROM the Aries AI platform number
// (not from each client's own WABA). Used when a client's
// WABA cannot send to staff — either because the 24h window
// is closed and the client has no approved template (common
// for new/unverified WABAs, Meta error 3835016).
//
// Templates are registered ONCE on the platform WABA and work
// for every client with no per-client Meta verification needed.
//
// Required env vars:
//   PLATFORM_WA_TOKEN      — permanent system user token for Aries AI's phone
//   PLATFORM_WA_PHONE_ID   — phone number ID for the Aries AI WhatsApp number
//
// Platform templates to register once in Meta Business Manager:
//
//   Name: aries_staff_alert   Category: UTILITY   Language: en
//   Body: "📋 Aries AI alert for *{{1}}*\n\n{{2}}\n\nReply to this message or open the dashboard to take action."
//
//   Name: aries_staff_keepalive   Category: UTILITY   Language: en
//   Body: "📋 Aries AI check-in for *{{1}}*.\n\nTap below to confirm you're receiving booking and handoff alerts."
//   Button: QUICK_REPLY "✅ Got it"
// ═══════════════════════════════════════════════════════════

import { sendTemplateMessage, sendInteractiveButtonsMessage, sendTextMessage } from '@/lib/meta/service';

const PLATFORM_ALERT_TEMPLATE     = 'aries_staff_alert';
const PLATFORM_KEEPALIVE_TEMPLATE = 'aries_staff_keepalive';

function getPlatformCreds(): { token: string; phoneId: string } | null {
  const token   = process.env.PLATFORM_WA_TOKEN;
  const phoneId = process.env.PLATFORM_WA_PHONE_ID;
  if (!token || !phoneId) return null;
  return { token, phoneId };
}

export function isPlatformConfigured(): boolean {
  return Boolean(process.env.PLATFORM_WA_TOKEN && process.env.PLATFORM_WA_PHONE_ID);
}

/**
 * Sends a staff alert from the Aries AI platform number.
 * Used when the client's own WABA cannot reach staff (window closed, no template).
 * Staff sees a message from "Aries AI" with the business name + alert body in the text.
 */
export async function sendPlatformAlert(
  toPhone: string,
  businessName: string,
  body: string,
): Promise<{ messageId?: string }> {
  const creds = getPlatformCreds();
  if (!creds) throw new Error('Platform WhatsApp credentials not configured (PLATFORM_WA_TOKEN / PLATFORM_WA_PHONE_ID)');

  try {
    return await sendTemplateMessage(
      creds.token, creds.phoneId, toPhone,
      PLATFORM_ALERT_TEMPLATE,
      [businessName, body],
      'en',
    );
  } catch {
    // If template isn't approved yet, fall back to a free-form message.
    // This works if the platform already has an open window with this phone.
    return await sendTextMessage(
      creds.token, creds.phoneId, toPhone,
      `📋 Aries AI alert for *${businessName}*\n\n${body}`,
    );
  }
}

/**
 * Sends the platform keepalive ping to a staff/manager phone.
 * Opens (or renews) the 24h window between Aries AI's platform number and the phone.
 * Uses the aries_staff_keepalive template — always available, no per-client setup needed.
 */
export async function sendPlatformKeepalive(
  toPhone: string,
  businessName: string,
  windowOpen: boolean,
): Promise<'ok' | 'failed'> {
  const creds = getPlatformCreds();
  if (!creds) return 'failed';

  try {
    if (windowOpen) {
      // Platform window is open — send interactive button (tap reopens it)
      await sendInteractiveButtonsMessage(
        creds.token, creds.phoneId, toPhone,
        `📋 Aries AI check-in for *${businessName}*.\n\nTap below to confirm you're receiving booking and handoff alerts on this number.`,
        [{ id: 'platform_keepalive_ack', title: '✅ Got it' }],
      );
    } else {
      // Platform window closed — send template to reopen it
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
