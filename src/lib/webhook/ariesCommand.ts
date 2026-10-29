// ═══════════════════════════════════════════════════════════
// 🔀 Aries Command hand-off (Instagram content approvals)
// ═══════════════════════════════════════════════════════════
// Aries Command (aries-command.vercel.app) sends restaurant owners their
// Instagram posts for approval FROM the Aries AI platform number. Meta delivers
// the owners' replies here, so we forward the ones that might be approvals and
// let Command say which it takes. Claimed messages skip the bot entirely;
// everything else (reports, questions, staff replies) is handled as before.
//
// Forwarded: on the platform number only,
//   - button replies whose id starts with ap: / ch: / aa: (Command's buttons),
//   - plain texts that are not daily-report requests.
// Command claims a text only while that owner has a review open.
//
// Env (both or nothing; unset = feature off, nothing forwarded):
//   ARIES_COMMAND_FORWARD_URL    = https://aries-command.vercel.app/api/webhooks/whatsapp/forwarded
//   ARIES_COMMAND_FORWARD_SECRET = shared HMAC secret (same value on Command as ARIES_FORWARD_SECRET)
// ═══════════════════════════════════════════════════════════

import { createHmac } from 'crypto';
import type { ParsedMetaMessage } from '@/lib/meta/service';
import { isDailyReportRequest } from '@/lib/reports/dailyReport';

const DEFAULT_PLATFORM_PHONE_NUMBER_ID = '1207672335754940';
export const COMMAND_BUTTON = /^(ap|ch|aa):/;
const TIMEOUT_MS = 4000;

const platformPhoneNumberId = () => process.env.PLATFORM_WA_PHONE_NUMBER_ID || DEFAULT_PLATFORM_PHONE_NUMBER_ID;

/** Messages that might belong to Aries Command. */
export function commandCandidates(list: ParsedMetaMessage[]): ParsedMetaMessage[] {
  return list.filter((m) => {
    if (m.isStatusUpdate || m.isReaction || m.appPhoneId !== platformPhoneNumberId()) return false;
    if (m.buttonId) return COMMAND_BUTTON.test(m.buttonId);
    return m.type === 'text' && !!m.text?.trim() && !isDailyReportRequest(m.text);
  });
}

/** Signs a forward the way Command checks it: HMAC-SHA256 of "<unix seconds>.<body>". */
export function signForward(body: string, secret: string, nowMs = Date.now()) {
  const ts = String(Math.floor(nowMs / 1000));
  return { ts, signature: 'sha256=' + createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex') };
}

/**
 * Returns the message ids the bot must skip. Command's own buttons are never
 * the bot's, even when Command can't be reached (the owner can tap again, or
 * approve inside Command); a text Command doesn't claim goes to the bot.
 */
export async function claimForAriesCommand(list: ParsedMetaMessage[]): Promise<Set<string>> {
  const candidates = commandCandidates(list);
  const skip = new Set(candidates.filter((m) => m.buttonId && COMMAND_BUTTON.test(m.buttonId)).map((m) => m.messageId));
  const url = process.env.ARIES_COMMAND_FORWARD_URL;
  const secret = process.env.ARIES_COMMAND_FORWARD_SECRET;
  if (!candidates.length || !url || !secret) return skip;

  // Rebuild a Meta-shaped payload holding only the candidates, raw as Meta sent them.
  const body = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'aries-ai-forward',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: platformPhoneNumberId() },
          messages: candidates.map((m) => m.rawWebhook).filter(Boolean),
        },
      }],
    }],
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
    const ids = new Set(candidates.map((m) => m.messageId));
    for (const id of Array.isArray(json.claimed) ? json.claimed : []) {
      if (typeof id === 'string' && ids.has(id)) skip.add(id);
    }
  } catch (err) {
    console.error('[aries-command] forward failed; texts go to the bot:', err instanceof Error ? err.message : err);
  }
  return skip;
}
