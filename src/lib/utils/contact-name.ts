// ═══════════════════════════════════════════════════════════════════════════
// 📇 CONTACT NAME — the single source of truth for contact display names
// ═══════════════════════════════════════════════════════════════════════════
// There must be EXACTLY ONE place in the app that decides what name to show for
// a contact and what greeting to use when a name is missing. Every screen and
// every API goes through this module. No component may write its own fallback
// like `name || 'there'` or `name || 'Unknown'` (an ESLint rule enforces this).
//
// Two distinct concerns, two functions:
//   • contactDisplayName(name, phone) — IDENTITY shown in any list/table/card.
//       Never a placeholder: real name → formatted phone → neutral label.
//   • greetingName(name) / greetingFirstName(name) — OUTBOUND MESSAGE COPY.
//       Returns a sanitized name or the neutral greeting word "there"
//       ("Hi there"). This is the ONLY place the literal "there" lives.
//
// Background: WhatsApp profile names are unreliable (emoji/wrong), so they are
// never stored as the CRM name (see name-handling fix). Leads therefore often
// have a NULL name — which is correct, and renders as the phone number here.
// ═══════════════════════════════════════════════════════════════════════════
import { sanitizeName, firstName } from '@/lib/utils/name';
import { formatPhoneDisplay } from '@/lib/utils/phone';
import { logger } from '@/lib/utils/logger';

// Re-exported so callers have a single import surface for name display.
export { formatPhoneDisplay };

/** The neutral greeting word used in outbound copy when no name is known. */
export const NEUTRAL_GREETING = 'there';

/** The neutral identity label used when a contact has neither name nor phone. */
export const NEUTRAL_IDENTITY = 'WhatsApp contact';

// Placeholder words that must NEVER be treated as a real name if they slipped in
// from older imports/webhooks. Compared letters-only (sanitizeName may strip
// punctuation, e.g. "n/a" -> "n a"), so entries here are letters-only.
const PLACEHOLDER_NAMES = new Set([
  'there',
  'unknown',
  'anonymous',
  'null',
  'undefined',
  'na',
  'none',
  'nil',
  'customer',
  'guest',
  'user',
  'contact',
  'test',
]);

/**
 * True if a raw value is a placeholder / non-name and should be stored as NULL
 * and never displayed. Covers empty/whitespace, the placeholder words above,
 * pure-symbol/emoji values, and phone-like values.
 */
export function isPlaceholderName(raw: string | null | undefined): boolean {
  if (raw == null) return true;
  const trimmed = String(raw).trim();
  if (trimmed === '') return true;
  // sanitizeName returns null for emoji-only / phone-like / <2-letter values.
  const cleaned = sanitizeName(trimmed);
  if (!cleaned) return true;
  const compact = cleaned.toLowerCase().replace(/[^a-z]/g, '');
  return PLACEHOLDER_NAMES.has(compact);
}

/**
 * Returns a clean, human name for a raw stored value, or `null` when the value
 * is not a usable name (empty, placeholder, emoji-only, phone-like, too short).
 * This is the value that should be WRITTEN to the database.
 */
export function cleanContactName(raw: string | null | undefined): string | null {
  if (isPlaceholderName(raw)) return null;
  return sanitizeName(raw);
}

/** True when the contact has a real, human name (for known/unknown stats). */
export function hasRealName(raw: string | null | undefined): boolean {
  return !isPlaceholderName(raw);
}

/**
 * The name to SHOW for a contact anywhere in the UI. Guaranteed non-empty and
 * never a placeholder: real name → formatted phone → neutral identity label.
 */
export function contactDisplayName(
  rawName: string | null | undefined,
  phone: string | null | undefined
): string {
  const name = cleanContactName(rawName);
  if (name) return name;
  const formatted = formatPhoneDisplay(phone);
  if (formatted) return formatted;
  return NEUTRAL_IDENTITY;
}

/** Back-compat alias used by the broadcast recipient surfaces. */
export const recipientDisplayName = contactDisplayName;

/**
 * Up-to-two-letter initials for an avatar, or `null` when there is no real name
 * (callers should render a generic person glyph instead of a stray letter from
 * a phone number).
 */
export function contactInitials(rawName: string | null | undefined): string | null {
  const name = cleanContactName(rawName);
  if (!name) return null;
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Name to use in OUTBOUND MESSAGE COPY ("Hi {{name}}"). Returns a sanitized
 * full name or the neutral greeting word. The one and only home of "there".
 */
export function greetingName(rawName: string | null | undefined): string {
  return cleanContactName(rawName) ?? NEUTRAL_GREETING;
}

/** First-name variant for short, friendly greetings ("Hey Rahul!"). */
export function greetingFirstName(rawName: string | null | undefined): string {
  if (isPlaceholderName(rawName)) return NEUTRAL_GREETING;
  return firstName(rawName) ?? NEUTRAL_GREETING;
}

// ── Monitoring ──────────────────────────────────────────────────────────────

export type ContactNameSource = 'csv' | 'excel' | 'whatsapp' | 'crm' | 'api' | 'broadcast' | 'unknown';

export interface InvalidNameContext {
  tenantId?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  source?: ContactNameSource;
  rawName?: string | null;
}

/**
 * Emit a structured WARNING whenever a placeholder / invalid name is detected in
 * source data. This is how future import regressions get spotted immediately —
 * the log carries tenant, contact, source, and campaign for triage.
 * Safe to call in hot paths: it never throws.
 */
export function logInvalidContactName(ctx: InvalidNameContext): void {
  try {
    logger.warn('Invalid contact name detected — displaying phone number instead', {
      event: 'invalid_contact_name',
      tenant_id: ctx.tenantId ?? null,
      contact_id: ctx.contactId ?? null,
      campaign_id: ctx.campaignId ?? null,
      source: ctx.source ?? 'unknown',
      // Truncated so we never dump large/garbage strings into logs.
      raw_name: ctx.rawName == null ? null : String(ctx.rawName).slice(0, 60),
    });
  } catch {
    /* logging must never break a request */
  }
}

/**
 * Runtime guard for a list of recipients right before it is returned/rendered.
 * Anything whose raw name is a placeholder is reported via logInvalidContactName
 * (the value itself is already coerced to null by cleanContactName upstream, so
 * the UI still falls back to the phone — this only surfaces the anomaly).
 * Returns the count of invalid names found.
 */
export function auditRecipientNames(
  records: Array<{ name?: string | null; contact_id?: string | null; source_type?: string | null }>,
  ctx: { tenantId?: string | null; campaignId?: string | null } = {}
): number {
  let invalid = 0;
  for (const r of records) {
    // Only flag rows that CLAIM a name but it's a placeholder; a legitimately
    // null name (no name known) is expected and not an anomaly.
    if (r.name != null && String(r.name).trim() !== '' && isPlaceholderName(r.name)) {
      invalid++;
      logInvalidContactName({
        tenantId: ctx.tenantId,
        campaignId: ctx.campaignId,
        contactId: r.contact_id,
        source: (r.source_type as ContactNameSource) ?? 'unknown',
        rawName: r.name,
      });
    }
  }
  return invalid;
}
