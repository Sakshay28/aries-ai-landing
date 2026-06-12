// ─────────────────────────────────────────────────────────────────────────────
// Pure decision helpers for the WhatsApp webhook.
//
// Extracted from src/app/api/webhooks/whatsapp/route.ts so the money-path
// logic is unit-testable (route files can't export non-handler symbols).
// Behavior must stay byte-identical to the inline originals — both scripted-
// reply rules below encode fixes for real production bugs:
//   - substring matches fired "hi" inside "hindi"  (fixed 138436d)
//   - "hi" fired on the Hinglish emphasis particle ("tum hi batao") (e48ddeb)
// Tests: tests/webhook-decisions.test.ts
// ─────────────────────────────────────────────────────────────────────────────

/** Word-boundary keyword match — used for tenant escalation keywords and
 *  AI-agent routing keywords. `[^a-z0-9]` boundaries instead of `\b` so it
 *  behaves sanely next to emoji/Devanagari. */
export function kwWordMatch(text: string, kw: string): boolean {
  const k = kw.trim().toLowerCase();
  if (!k) return false;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

/** Scripted-reply keyword match.
 *  Short keywords (≤4 chars) like "hi"/"hey" are ambiguous in Hinglish —
 *  "hi" is a greeting but also an emphasis particle ("tum hi batao", "yahi").
 *  Rule: ≤4-char keywords only fire at the START of the message (or as the
 *  entire message). Longer keywords use word-boundary match anywhere. */
export function scriptedKeywordMatch(text: string, kw: string): boolean {
  const k = kw.trim().toLowerCase();
  if (!k) return false;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (k.length <= 4) {
    return new RegExp(`^${escaped}([^a-z0-9]|$)`, 'i').test(text.trim());
  }
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

export interface ScriptedReplyRow {
  keywords: string[];
  reply: string;
  media_url?: string | null;
}

/** Pick the scripted reply whose matching keyword is LONGEST (most specific
 *  keyword beats broad single words). Returns undefined when nothing fires. */
export function pickScriptedReply<T extends ScriptedReplyRow>(
  rows: T[],
  messageText: string,
): T | undefined {
  const lower = messageText.toLowerCase();
  let matched: T | undefined;
  let bestLen = 0;
  for (const r of rows) {
    if (!Array.isArray(r.keywords)) continue;
    for (const kw of r.keywords) {
      if (kw && scriptedKeywordMatch(lower, kw) && kw.length > bestLen) {
        bestLen = kw.length;
        matched = r;
      }
    }
  }
  return matched;
}

/** Monotonic message-status ordering for Meta status callbacks.
 *  pending → sent → delivered → read; never downgrade; a failed message may
 *  still be upgraded if Meta later reports delivery. */
export function allowStatusUpdate(currentStatus: string, newStatus: string): boolean {
  if (currentStatus === 'read') return false;
  if (currentStatus === 'delivered') return newStatus === 'read';
  if (currentStatus === 'failed') return newStatus === 'delivered' || newStatus === 'read';
  return true;
}
