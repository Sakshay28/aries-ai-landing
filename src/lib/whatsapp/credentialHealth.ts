// ═══════════════════════════════════════════════════════════
// 🩺 WhatsApp Credential Health — outage detection
// ═══════════════════════════════════════════════════════════
// WHY THIS EXISTS
//
// On 2026-08-29 Globesome India's outbound WhatsApp stopped working and
// nobody noticed for 25 days. Their number (+91 86792 02292) lives in the
// shared "Aries AI" WABA, but the tenant row held a system-user token minted
// from a DIFFERENT Meta app whose system user had zero WhatsApp assets
// assigned. Every send came back:
//
//   POST /1307923625733053/messages -> 400
//   { code: 100, error_subcode: 33, type: "GraphMethodException",
//     message: "Object with ID '...' does not exist, cannot be loaded due to
//               missing permissions, or does not support this operation" }
//
// Inbound kept working the whole time (webhooks don't use the access token),
// so the inbox looked alive: customers messaged in, the AI drafted replies,
// the replies were saved — and every one of them died at the Meta call with a
// small red "!" that nothing in the product ever escalated.
//
// The lesson is not "handle code 100/33". It is that a CREDENTIAL fault and a
// PER-MESSAGE fault had been collapsed into the same thing. A bad template or
// a closed 24h window affects one send; a token that cannot see its own phone
// number means the tenant is *entirely offline* and will stay that way until a
// human changes something in Meta. This module names that distinction, then
// makes it loud: it is fed both by live send failures (instant detection) and
// by a daily cron sweep (catches tenants with no traffic at all).
// ═══════════════════════════════════════════════════════════

const META_BASE = 'https://graph.facebook.com/v21.0';

// Structurally typed instead of `instanceof MetaApiError` on purpose: importing
// @/lib/meta/service would pull node:crypto and the token decryptor into every
// bundle that wants to *render* a failure reason. The classifier stays pure and
// client-safe so the inbox can explain a failure with the same logic the server
// used to detect it.
interface MetaErrorShape {
  code?: number;
  subcode?: number;
  message?: string;
}

function asMetaError(err: unknown): MetaErrorShape | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as MetaErrorShape;
  if (typeof e.code === 'number' || typeof e.subcode === 'number') return e;
  return null;
}

/** The distinct ways a tenant's WhatsApp credentials can be broken. */
export type CredentialFaultKind =
  | 'token_invalid'          // token expired, revoked, or malformed
  | 'no_asset_access'        // token is valid but cannot see this phone number / WABA
  | 'number_not_registered'  // phone number isn't registered on the Cloud API
  | 'billing'                // WABA payment method / business eligibility problem
  | 'account_restricted';    // Meta has restricted or locked the account

export interface CredentialFault {
  kind: CredentialFaultKind;
  /** Meta's numeric error code, when we had one. */
  code?: number;
  /** Meta's error_subcode — 100/33 vs plain 100 are different faults. */
  subcode?: number;
  /** Short operator-facing headline, safe to render in the dashboard. */
  title: string;
  /** What a human has to actually go and do about it. */
  action: string;
}

// ── Code tables ──────────────────────────────────────────────
// Deliberately narrow. Anything not listed here is treated as a per-message
// failure, because wrongly declaring a tenant "offline" would show a scary
// banner and suppress nothing useful. False negatives cost us a day (the cron
// sweep catches them); false positives cost the operator their trust in the
// alert.
const TOKEN_INVALID = new Set([190, 102, 463, 467]);
const NO_ACCESS = new Set([200, 10, 299, 3]);
const NUMBER_NOT_REGISTERED = new Set([133005, 133006, 133010]);
const BILLING = new Set([131042]);
const RESTRICTED = new Set([131031, 368]);

// Codes that look alarming but are strictly about ONE message. Listed
// explicitly so a future edit can't quietly promote them to an outage:
//   131047 = re-engagement required (24h window closed)
//   131026 = recipient cannot receive messages
//   131051 = unsupported message type
//   132xxx = template problems
// They simply fall through to `null` below.

/**
 * Decides whether a failed send means "this tenant is offline" or just "this
 * one message didn't go".
 *
 * Accepts a MetaApiError, any Error, or a raw string, because the failure
 * reaches us in all three shapes: the send path throws MetaApiError, the
 * webhook persists `(err as Error).message`, and older rows hold only the
 * stored string. When structured fields are absent it parses Meta's envelope
 * out of the message text — the envelope is embedded verbatim by
 * metaErrorFromResponse, so this stays reliable rather than fuzzy.
 *
 * Pure: no I/O, no clock, no DB. Unit-tested in tests/wa-credential-health.test.ts.
 */
export function classifyCredentialFault(err: unknown): CredentialFault | null {
  let code: number | undefined;
  let subcode: number | undefined;
  let text = '';

  const metaErr = asMetaError(err);
  if (metaErr) {
    code = metaErr.code;
    subcode = metaErr.subcode;
    text = metaErr.message ?? '';
  } else {
    text = typeof err === 'string' ? err : ((err as Error)?.message ?? '');
    // Recover the codes from the embedded JSON envelope when we only have text.
    const codeMatch = text.match(/"code"\s*:\s*(\d+)/);
    const subMatch = text.match(/"error_subcode"\s*:\s*(\d+)/);
    if (codeMatch) code = Number(codeMatch[1]);
    if (subMatch) subcode = Number(subMatch[1]);
  }

  // The tenant has no usable credential at all — this is our own precondition
  // failure, not Meta's, and it is every bit as fatal.
  if (/missing\/undecryptable wa_access_token/i.test(text)) {
    return {
      kind: 'token_invalid',
      title: 'WhatsApp access token is missing or cannot be decrypted',
      action:
        'Re-enter the access token in Settings → WhatsApp. If it was encrypted with a retired key version, it must be re-saved.',
    };
  }
  if (/missing wa_phone_number_id/i.test(text)) {
    return {
      kind: 'no_asset_access',
      title: 'No WhatsApp phone number ID is configured',
      action: 'Add the Phone Number ID from Meta Business Manager in Settings → WhatsApp.',
    };
  }

  if (code == null) return null;

  if (TOKEN_INVALID.has(code)) {
    return {
      kind: 'token_invalid',
      code,
      subcode,
      title: 'WhatsApp access token has expired or been revoked',
      action:
        'Generate a new permanent system-user token in Meta Business Settings and save it in Settings → WhatsApp.',
    };
  }

  // THE GLOBESOME CASE. Meta returns a generic code 100 for a lot of things,
  // so only the 100/33 pair — "object does not exist / missing permissions" —
  // counts, plus the unambiguous permission codes.
  if ((code === 100 && subcode === 33) || NO_ACCESS.has(code)) {
    return {
      kind: 'no_asset_access',
      code,
      subcode,
      title: 'This access token cannot reach the configured WhatsApp number',
      action:
        'The token is valid but its system user has no permission on this phone number. In Meta Business Settings → Users → System Users, assign the WhatsApp Account (WABA) that owns this number to the system user with full control — or store a token that already has it.',
    };
  }

  if (NUMBER_NOT_REGISTERED.has(code)) {
    return {
      kind: 'number_not_registered',
      code,
      subcode,
      title: 'WhatsApp number is not registered on the Cloud API',
      action: 'Finish phone-number registration for this number in Meta Business Manager.',
    };
  }

  if (BILLING.has(code)) {
    return {
      kind: 'billing',
      code,
      subcode,
      title: 'Meta has blocked sending for billing / business eligibility',
      action:
        'Add or fix the payment method on the WhatsApp Business Account in Meta Business Settings → Billing.',
    };
  }

  if (RESTRICTED.has(code)) {
    return {
      kind: 'account_restricted',
      code,
      subcode,
      title: 'Meta has restricted this WhatsApp Business Account',
      action: 'Open Meta Business Manager → Account Quality and resolve the restriction.',
    };
  }

  return null;
}

export interface CredentialProbeResult {
  ok: boolean;
  fault: CredentialFault | null;
  /** Populated on success — lets the caller confirm it is the expected number. */
  displayPhoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  /** Raw detail for logs / admin email. Never contains the token. */
  detail?: string;
}

/**
 * Asks Meta whether this (token, phoneNumberId) pair can still see the number
 * it is supposed to send from.
 *
 * `GET /{phone_number_id}` is used rather than a send because it exercises the
 * exact same asset-permission check that `POST /{phone_number_id}/messages`
 * does, while being free, idempotent, and incapable of messaging a real
 * customer. This is what would have caught the Globesome outage on day one.
 */
export async function probeWhatsAppCredentials(
  accessToken: string | null,
  phoneNumberId: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<CredentialProbeResult> {
  if (!accessToken) {
    return { ok: false, fault: classifyCredentialFault('missing/undecryptable wa_access_token') };
  }
  if (!phoneNumberId) {
    return { ok: false, fault: classifyCredentialFault('missing wa_phone_number_id') };
  }

  let res: Response;
  try {
    res = await fetchImpl(
      `${META_BASE}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (netErr) {
    // A network blip is NOT a credential fault — saying so would flap the
    // banner every time Meta or Vercel hiccups.
    return { ok: false, fault: null, detail: `network error: ${(netErr as Error).message}` };
  }

  const body = (await res.json().catch(() => null)) as {
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    error?: { code?: number; error_subcode?: number; message?: string };
  } | null;

  if (res.ok && body?.id) {
    return {
      ok: true,
      fault: null,
      displayPhoneNumber: body.display_phone_number,
      verifiedName: body.verified_name,
      qualityRating: body.quality_rating,
    };
  }

  const err = body?.error;
  const fault = classifyCredentialFault({
    code: err?.code,
    subcode: err?.error_subcode,
    message: err?.message ?? `HTTP ${res.status}`,
  });
  return { ok: false, fault, detail: err?.message?.slice(0, 300) };
}

/**
 * Turns whatever is stored in `messages.error_message` into one sentence an
 * operator can act on.
 *
 * Client-safe, and deliberately lives next to the classifier so the inbox
 * explains a failure with the same logic the server used to detect it. Rows
 * written before this work hold Meta's raw JSON envelope, so the envelope is
 * unwrapped rather than shown — a red "!" next to `{"error":{"message":
 * "Unsupported post request. Object with ID '1307923625733053'..."}}` is not
 * something anyone can act on, and a bare red "!" with nothing at all is worse.
 */
export function describeSendFailure(errorMessage: string | null | undefined): string {
  if (!errorMessage) return 'WhatsApp didn’t accept this message.';

  if (errorMessage === 'SESSION_EXPIRED') {
    return 'The 24-hour reply window has closed — send a template to reopen it.';
  }

  const fault = classifyCredentialFault(errorMessage);
  if (fault) return `${fault.title} — no messages can be sent until this is fixed.`;

  // Prefer Meta's own human-readable sentence over the envelope around it.
  const inner = errorMessage.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (inner) {
    const text = inner[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
    // Drop Meta's boilerplate doc-link tail; it adds nothing in a chat bubble.
    return text.replace(/\s*Please read the Graph API documentation.*$/i, '').slice(0, 220);
  }

  return errorMessage.slice(0, 220);
}
