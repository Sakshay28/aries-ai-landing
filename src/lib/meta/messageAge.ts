// How late an inbound WhatsApp message reached us.
//
// The webhook used to drop anything older than 5 minutes as replay protection.
// But Meta re-delivers messages that failed (e.g. while our database was down)
// for up to 7 days, so after the 2026-10-29/30 outage every customer message
// sent during it was thrown away instead of reaching the inbox. Replays are
// already stopped by the UNIQUE(wa_message_id) insert gate, so:
//   fresh   (≤ 15 min) → normal processing, AI may reply
//   delayed (≤ 7 days) → saved to the inbox for staff, no AI auto-reply
//   expired (> 7 days) → rejected (outside Meta's retry window)
export type MessageAge = 'fresh' | 'delayed' | 'expired';

export const FRESH_MESSAGE_MS = 15 * 60 * 1000;
export const MAX_REDELIVERY_MS = 7 * 24 * 60 * 60 * 1000;

export function classifyMessageAge(timestampMs: number, now = Date.now()): MessageAge {
  const ageMs = Math.abs(now - timestampMs);
  if (ageMs <= FRESH_MESSAGE_MS) return 'fresh';
  if (ageMs <= MAX_REDELIVERY_MS) return 'delayed';
  return 'expired';
}
