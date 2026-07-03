// ═══════════════════════════════════════════════════════════
// 🏢 Aries AI Platform Sender
// ═══════════════════════════════════════════════════════════
// Sends WhatsApp messages FROM the Aries AI platform number
// (8107722269, phone_number_id=1207672335754940).
//
// Used when a client's own WABA cannot reach their staff —
// either because the 24h window is closed and the client has
// no approved template (common for new/unverified WABAs,
// Meta error 3835016).
//
// Credentials are stored in the tenants table (same encrypted
// storage as all client credentials). Token rotates automatically
// if the Aries AI tenant record is updated in the onboarding tool.
//
// Required env var (just the phone number ID, token from DB):
//   PLATFORM_WA_PHONE_NUMBER_ID=1207672335754940
//
// Templates to register once on the Aries AI WABA
// (Meta Business Manager → WhatsApp → Message Templates):
//
//   Name: aries_staff_alert   Category: UTILITY   Language: en
//   Body: "📋 Aries AI alert for *{{1}}*\n\n{{2}}\n\nOpen your dashboard to take action."
//
//   Name: aries_staff_keepalive   Category: UTILITY   Language: en
//   Body: "📋 Aries AI check-in for *{{1}}*.\n\nTap below to confirm you're receiving booking and handoff alerts."
//   Button: QUICK_REPLY → "✅ Got it"
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';
import { sendTemplateMessage, sendInteractiveButtonsMessage, sendTextMessage } from '@/lib/meta/service';

const PLATFORM_ALERT_TEMPLATE     = 'aries_staff_alert';
const PLATFORM_KEEPALIVE_TEMPLATE = 'aries_staff_keepalive';

export function isPlatformConfigured(): boolean {
  return Boolean(process.env.PLATFORM_WA_PHONE_NUMBER_ID);
}

// Cached per cold-start so we don't query the DB on every send.
let _cachedCreds: { token: string; phoneId: string } | null = null;

async function getPlatformCreds(): Promise<{ token: string; phoneId: string } | null> {
  const phoneNumberId = process.env.PLATFORM_WA_PHONE_NUMBER_ID;
  if (!phoneNumberId) return null;

  if (_cachedCreds) return _cachedCreds;

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('wa_access_token, wa_phone_number_id')
    .eq('wa_phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error || !data?.wa_access_token) {
    console.error('[platform-send] Could not load platform credentials from DB:', error?.message ?? 'no row found');
    return null;
  }

  const token = decryptToken(data.wa_access_token);
  if (!token) {
    console.error('[platform-send] Token decryption failed for platform number');
    return null;
  }

  _cachedCreds = { token, phoneId: phoneNumberId };
  return _cachedCreds;
}

/**
 * Sends a staff alert from the Aries AI platform number.
 * Used when the client's own WABA cannot reach staff (window closed, no approved template).
 * Staff sees a WhatsApp message from "Aries AI" with the business name + alert body.
 */
export async function sendPlatformAlert(
  toPhone: string,
  businessName: string,
  body: string,
): Promise<{ messageId?: string }> {
  const creds = await getPlatformCreds();
  if (!creds) throw new Error('Platform credentials unavailable');

  try {
    return await sendTemplateMessage(
      creds.token, creds.phoneId, toPhone,
      PLATFORM_ALERT_TEMPLATE,
      [businessName, body],
      'en',
    );
  } catch {
    // Template not approved yet — fall back to free-form if platform window is open with this phone
    return await sendTextMessage(
      creds.token, creds.phoneId, toPhone,
      `📋 Aries AI alert for *${businessName}*\n\n${body}`,
    );
  }
}

/**
 * Sends a keepalive ping from the Aries AI platform number to a staff/manager phone.
 * Opens (or renews) the 24h window between Aries AI's number and the phone.
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
