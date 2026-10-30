// ═══════════════════════════════════════════════════════════
// 🎟️ Aries Cover hand-off (cover passes sent from the platform number)
// ═══════════════════════════════════════════════════════════
// Aries Cover (aries-cover.vercel.app) sends guests their cover pass FROM the
// Aries AI platform number. Meta reports those messages' delivery here, and
// guests sometimes reply ("what's my balance?"). We forward:
//   - every delivery status on the platform number (Cover ignores ids it
//     didn't send), so its door screen can show Delivered / Read;
//   - texts and button taps on the platform number that Aries Command didn't
//     already claim. Cover claims only messages from its own guests (a pass
//     sent in the last 24 hours) and answers them with their pass link.
// Claimed messages skip the bot; everything else is handled as before.
//
// Env (both or nothing; unset = feature off, nothing forwarded):
//   ARIES_COVER_FORWARD_URL    = https://aries-cover.vercel.app/api/whatsapp/webhook
//   ARIES_COVER_FORWARD_SECRET = shared HMAC secret (ARIES_FORWARD_SECRET on Cover)
// ═══════════════════════════════════════════════════════════

import type { ParsedMetaMessage } from '@/lib/meta/service';
import { signForward } from '@/lib/webhook/ariesCommand';

const DEFAULT_PLATFORM_PHONE_NUMBER_ID = '1207672335754940';
const TIMEOUT_MS = 4000;
const platformPhoneNumberId = () => process.env.PLATFORM_WA_PHONE_NUMBER_ID || DEFAULT_PLATFORM_PHONE_NUMBER_ID;

/** What Cover might care about: platform-number statuses, and guest texts or taps Command didn't take. */
export function coverCandidates(list: ParsedMetaMessage[], claimedElsewhere: Set<string> = new Set()) {
  const onPlatform = list.filter((m) => m.appPhoneId === platformPhoneNumberId());
  return {
    statuses: onPlatform.filter((m) => m.isStatusUpdate && m.messageId && m.status),
    messages: onPlatform.filter(
      (m) =>
        !m.isStatusUpdate &&
        !m.isReaction &&
        !claimedElsewhere.has(m.messageId) &&
        ['text', 'interactive', 'button'].includes(m.type) &&
        !!m.rawWebhook,
    ),
  };
}

/**
 * Forwards to Aries Cover and returns the message ids Cover claimed (the bot
 * must skip them). Never throws: if Cover can't be reached, guest texts go to
 * the bot as before and statuses are simply not mirrored.
 */
export async function forwardToAriesCover(list: ParsedMetaMessage[], claimedElsewhere: Set<string> = new Set()): Promise<Set<string>> {
  const url = process.env.ARIES_COVER_FORWARD_URL;
  const secret = process.env.ARIES_COVER_FORWARD_SECRET;
  const claimed = new Set<string>();
  if (!url || !secret) return claimed;
  const { statuses, messages } = coverCandidates(list, claimedElsewhere);
  if (!statuses.length && !messages.length) return claimed;

  // Rebuild a Meta-shaped payload: statuses from their parsed fields, messages raw.
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'aries-ai-forward',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: platformPhoneNumberId() },
              statuses: statuses.map((s) => ({
                id: s.messageId,
                status: s.status,
                timestamp: String(Math.floor((s.timestamp || Date.now()) / 1000)),
                recipient_id: s.fromPhone,
                ...(s.errorCode ? { errors: [{ code: s.errorCode }] } : {}),
              })),
              messages: messages.map((m) => m.rawWebhook),
            },
          },
        ],
      },
    ],
  });
  const { ts, signature } = signForward(body, secret);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aries-Timestamp': ts, 'X-Aries-Signature': signature },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { claimed?: unknown };
    const ids = new Set(messages.map((m) => m.messageId));
    for (const id of Array.isArray(json.claimed) ? json.claimed : []) {
      if (typeof id === 'string' && ids.has(id)) claimed.add(id);
    }
  } catch (err) {
    console.error('[aries-cover] forward failed; guest texts go to the bot:', err instanceof Error ? err.message : err);
  }
  return claimed;
}
