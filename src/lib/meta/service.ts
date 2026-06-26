// ═══════════════════════════════════════════════════════════
// 📲 Meta WhatsApp Business Cloud API Service — Multi-Tenant
// ═══════════════════════════════════════════════════════════
// All functions take tenant credentials as parameters so the
// code is always per-tenant.
// API version: v21.0
// Auth: Bearer {ACCESS_TOKEN}
import crypto from 'crypto';
import { decryptToken } from '@/lib/utils/crypto';

const META_BASE = 'https://graph.facebook.com/v21.0';

// ── Typed Meta API error ──
// Carries the HTTP status, Meta's numeric error code, and any Retry-After hint so
// the retry layer and the broadcast engine can make correct decisions instead of
// regex-matching a string. The previous code treated EVERY 4xx (including 429
// rate-limits) as non-retryable, so a throttled send was wrongly marked failed.
export class MetaApiError extends Error {
  status: number;
  code?: number;
  retryAfterMs?: number;
  // True for transient throttling that WILL succeed if retried later.
  isRateLimited: boolean;
  // True for Meta messaging-tier / pair-rate limits — the engine should pace down,
  // not just blindly retry (sending harder makes the quality rating worse).
  isTierLimited: boolean;

  constructor(message: string, status: number, opts: { code?: number; retryAfterMs?: number } = {}) {
    super(message);
    this.name = 'MetaApiError';
    this.status = status;
    this.code = opts.code;
    this.retryAfterMs = opts.retryAfterMs;
    // Meta throttle/rate-limit error codes (transient):
    //   4      = application request limit reached
    //   80007  = rate limit issues
    //   130429 = cloud API rate limit hit
    //   131048 = spam rate limit hit
    //   131056 = (re-)engagement / pair rate limit
    //   133016 = too many requests for this number
    const rateCodes = new Set([4, 80007, 130429, 131048, 131056, 133016]);
    const tierCodes = new Set([131048, 131056, 130472]);
    this.isRateLimited = status === 429 || (opts.code != null && rateCodes.has(opts.code));
    this.isTierLimited = opts.code != null && tierCodes.has(opts.code);
  }
}

// Build a MetaApiError from a non-OK Response, parsing Meta's error code and
// the Retry-After header (seconds) when present.
async function metaErrorFromResponse(res: Response, kind: string): Promise<MetaApiError> {
  const bodyText = await res.text().catch(() => res.statusText);
  let code: number | undefined;
  try {
    const parsed = JSON.parse(bodyText);
    code = parsed?.error?.code ?? parsed?.error?.error_subcode;
  } catch { /* non-JSON body */ }

  let retryAfterMs: number | undefined;
  const ra = res.headers.get('retry-after');
  if (ra) {
    const secs = Number(ra);
    if (!Number.isNaN(secs)) retryAfterMs = secs * 1000;
  }

  return new MetaApiError(
    `Meta Cloud API ${kind} error ${res.status}: ${bodyText.slice(0, 300)}`,
    res.status,
    { code, retryAfterMs }
  );
}

// ── Retry helper: up to 3 attempts, exponential backoff ──
// Retries on: network errors, 5xx, 429, and Meta throttle codes (honoring
// Retry-After). Fails fast on genuine 4xx (bad token / payload / template).
async function withMetaRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = isRetryableMetaError(err);
      if (!retryable || attempt === maxRetries) throw err;

      // Honor Meta's Retry-After when it gives one; otherwise exponential backoff
      // (500 ms → 1 s → 2 s), capped so a single send never blocks a batch too long.
      const hinted = err instanceof MetaApiError ? err.retryAfterMs : undefined;
      const backoff = hinted ?? 500 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, Math.min(backoff, 8000)));
    }
  }
  throw new Error('Meta API: max retries exceeded');
}

// A send is worth retrying in-process only for transient failures. Hard 4xx
// (auth/payload) and any other error are surfaced immediately to the caller,
// which (for broadcasts) schedules a longer DB-level backoff.
export function isRetryableMetaError(err: unknown): boolean {
  if (err instanceof MetaApiError) {
    if (err.status === 429 || err.isRateLimited) return true;
    if (err.status >= 500) return true;
    return false; // genuine 4xx — don't hammer Meta
  }
  // Network / timeout errors (AbortError, fetch failures) are transient.
  return true;
}

// ── Clean phone numbers: remove +, spaces, dashes, brackets ──
export function cleanPhone(phone: string): string {
  const digits = phone.replace(/[\s+\-()]/g, '');
  if (!/^\d{7,15}$/.test(digits)) {
    throw new Error(`Invalid phone number: "${phone}" → "${digits}" is not 7-15 digits`);
  }
  return digits;
}

// ── Generate Request Headers ──
// Meta Cloud API access tokens always start with "EAA". If a caller hands us
// anything else (encrypted ciphertext that bypassed the version-aware
// decryptor, a misnamed env var, a half-rotated token) we throw here rather
// than letting Meta reply 401 "Cannot parse access token" 600ms later. The
// alerting layer relies on this exception to surface the real cause.
function headers(accessToken: string): Record<string, string> {
  if (!/^EAA[A-Za-z0-9]/.test(accessToken)) {
    const preview = accessToken
      ? `${accessToken.slice(0, 8)}…(${accessToken.length} chars)`
      : 'empty';
    throw new Error(
      `Meta token shape invalid (expected EAA…, got ${preview}). ` +
      `Likely cause: decryptToken returned ciphertext or the token env is wrong.`
    );
  }
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  };
}

export type MetaMediaType = 'image' | 'video' | 'audio' | 'document';

export interface MetaSendResult {
  messageId: string;
  status: string;
}

// ═══════════════════════════════════════
// MARK: Message as Read (Blue Ticks)
// ═══════════════════════════════════════
export async function markMessageAsRead(
  accessToken: string,
  phoneNumberId: string,
  messageId: string
): Promise<void> {
  if (!accessToken || !phoneNumberId || !messageId) return;

  try {
    await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: headers(accessToken),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Non-fatal — don't block message processing for a read receipt
  }
}

// ═══════════════════════════════════════
// TYPING: Show "typing…" bubble to the customer
// ═══════════════════════════════════════
// Meta's typing indicator piggybacks on a read receipt: marking the customer's
// last message read with a typing_indicator makes WhatsApp show "typing…" for
// up to 25 seconds OR until our next outbound message — whichever comes first.
// Call this right before AI generation so the customer sees the bot "thinking",
// then the reply replaces the bubble. Fire-and-forget; never block the reply.
export async function sendTypingIndicator(
  accessToken: string,
  phoneNumberId: string,
  messageId: string
): Promise<void> {
  if (!accessToken || !phoneNumberId || !messageId) return;

  try {
    await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: headers(accessToken),
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Non-fatal — a missing typing bubble must never block the actual reply
  }
}

// ═══════════════════════════════════════
// SEND: Text Message
// ═══════════════════════════════════════
export async function sendTextMessage(
  accessToken: string,
  phoneNumberId: string,
  destination: string,
  text: string,
  contextMessageId?: string
): Promise<MetaSendResult> {
  if (!accessToken || !phoneNumberId || !destination || !text) {
    throw new Error('Meta sendTextMessage: missing required parameters');
  }

  const payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone(destination),
    type: 'text',
    text: {
      preview_url: false,
      body: text,
    },
  };

  if (contextMessageId) {
    payload.context = {
      message_id: contextMessageId,
    };
  }

  return withMetaRetry(async () => {
    let res: Response;
    try {
      res = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: headers(accessToken),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      throw new Error(`Meta network error: ${(err as Error).message}`);
    }

    if (!res.ok) {
      throw await metaErrorFromResponse(res, 'text');
    }

    const data = await res.json();
    return {
      messageId: data.messages?.[0]?.id || '',
      status: 'sent',
    };
  });
}

// ═══════════════════════════════════════
// SEND: Interactive Buttons Message (Reply Buttons)
// ═══════════════════════════════════════
// WhatsApp Cloud API interactive message with up to 3 reply buttons.
// See: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-reply-buttons-messages
export async function sendInteractiveButtonsMessage(
  accessToken: string,
  phoneNumberId: string,
  destination: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  headerText?: string,
  footerText?: string
): Promise<MetaSendResult> {
  if (!accessToken || !phoneNumberId || !destination || !bodyText) {
    throw new Error('Meta sendInteractiveButtonsMessage: missing required parameters');
  }
  if (buttons.length === 0 || buttons.length > 3) {
    throw new Error(`Meta sendInteractiveButtonsMessage: must have 1-3 buttons (got ${buttons.length})`);
  }

  const interactive: Record<string, unknown> = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.map(b => ({
        type: 'reply',
        reply: {
          id: b.id.slice(0, 256),
          title: b.title.slice(0, 20),
        },
      })),
    },
  };
  if (headerText) interactive.header = { type: 'text', text: headerText.slice(0, 60) };
  if (footerText) interactive.footer = { text: footerText.slice(0, 60) };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone(destination),
    type: 'interactive',
    interactive,
  };

  return withMetaRetry(async () => {
    const res = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: headers(accessToken),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw await metaErrorFromResponse(res, 'interactive_buttons');
    const data = await res.json();
    return { messageId: data.messages?.[0]?.id || '', status: 'sent' };
  });
}

// ═══════════════════════════════════════
// SEND: Interactive List Message
// ═══════════════════════════════════════
// WhatsApp Cloud API interactive list message with up to 10 rows.
// See: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/interactive-list-messages
export async function sendInteractiveListMessage(
  accessToken: string,
  phoneNumberId: string,
  destination: string,
  bodyText: string,
  buttonLabel: string,
  sections: Array<{ title?: string; rows: Array<{ id: string; title: string; description?: string }> }>,
  headerText?: string,
  footerText?: string
): Promise<MetaSendResult> {
  if (!accessToken || !phoneNumberId || !destination || !bodyText) {
    throw new Error('Meta sendInteractiveListMessage: missing required parameters');
  }

  const interactive: Record<string, unknown> = {
    type: 'list',
    body: { text: bodyText },
    action: {
      button: (buttonLabel || 'Select').slice(0, 20),
      sections: sections.map(s => ({
        ...(s.title ? { title: s.title.slice(0, 24) } : {}),
        rows: s.rows.map(r => ({
          id: r.id.slice(0, 200),
          title: r.title.slice(0, 24),
          ...(r.description ? { description: r.description.slice(0, 72) } : {}),
        })),
      })),
    },
  };
  if (headerText) interactive.header = { type: 'text', text: headerText.slice(0, 60) };
  if (footerText) interactive.footer = { text: footerText.slice(0, 60) };

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone(destination),
    type: 'interactive',
    interactive,
  };

  return withMetaRetry(async () => {
    const res = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: headers(accessToken),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw await metaErrorFromResponse(res, 'interactive_list');
    const data = await res.json();
    return { messageId: data.messages?.[0]?.id || '', status: 'sent' };
  });
}

// ═══════════════════════════════════════
// SEND: Template Message
// ═══════════════════════════════════════
// Supports both a raw components array (Meta format) and a simple list of body variables
export async function sendTemplateMessage(
  accessToken: string,
  phoneNumberId: string,
  destination: string,
  templateName: string,
  componentsOrVariables: any[] = [],
  languageCode = 'en'
): Promise<MetaSendResult> {
  if (!accessToken || !phoneNumberId || !destination || !templateName) {
    throw new Error('Meta sendTemplateMessage: missing required parameters');
  }

  // Backwards compatibility: Map a simple array of string body variables to Meta's body component format
  let components = componentsOrVariables;
  if (
    componentsOrVariables.length > 0 &&
    typeof componentsOrVariables[0] === 'string'
  ) {
    components = [
      {
        type: 'body',
        parameters: componentsOrVariables.map(val => ({
          type: 'text',
          text: String(val),
        })),
      },
    ];
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone(destination),
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      ...(components.length > 0 && { components }),
    },
  };

  return withMetaRetry(async () => {
    let res: Response;
    try {
      res = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: headers(accessToken),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      throw new Error(`Meta network error: ${(err as Error).message}`);
    }

    if (!res.ok) {
      throw await metaErrorFromResponse(res, 'template');
    }

    const data = await res.json();
    return {
      messageId: data.messages?.[0]?.id || '',
      status: 'sent',
    };
  });
}

// ═══════════════════════════════════════
// SEND: Media Message
// ═══════════════════════════════════════
export async function sendMediaMessage(
  accessToken: string,
  phoneNumberId: string,
  destination: string,
  mediaType: MetaMediaType,
  url: string,
  caption?: string,
  contextMessageId?: string
): Promise<MetaSendResult> {
  if (!accessToken || !phoneNumberId || !destination || !url) {
    throw new Error('Meta sendMediaMessage: missing required parameters');
  }

  const mediaPayload: Record<string, string> = { link: url };
  if (caption && (mediaType === 'image' || mediaType === 'document')) {
    mediaPayload.caption = caption;
  }
  if (mediaType === 'document') {
    mediaPayload.filename = caption || url.split('/').pop()?.split('?')[0] || 'document';
  }

  const payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone(destination),
    type: mediaType,
    [mediaType]: mediaPayload,
  };

  if (contextMessageId) {
    payload.context = {
      message_id: contextMessageId,
    };
  }

  return withMetaRetry(async () => {
    let res: Response;
    try {
      res = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: headers(accessToken),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      throw new Error(`Meta network error: ${(err as Error).message}`);
    }

    if (!res.ok) {
      throw await metaErrorFromResponse(res, 'media');
    }

    const data = await res.json();
    return {
      messageId: data.messages?.[0]?.id || '',
      status: 'sent',
    };
  });
}

// ═══════════════════════════════════════
// FETCH: Media URL (Resolves Media ID to direct URL)
// ═══════════════════════════════════════
// Fetches metadata for a media asset uploaded by a user (returns download link)
export async function getMediaUrl(
  accessToken: string,
  mediaId: string
): Promise<string | null> {
  if (!accessToken || !mediaId) return null;

  try {
    const res = await fetch(`${META_BASE}/${mediaId}`, {
      method: 'GET',
      headers: headers(accessToken),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.error(`Meta media resolution error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.url || null; // Returns the temporary URL hosted by Meta
  } catch (err) {
    console.error('❌ Meta getMediaUrl failed:', (err as Error).message);
    return null;
  }
}

// ═══════════════════════════════════════
// TEST: Connection Verification
// ═══════════════════════════════════════
// Queries phone number details to verify token validity, display name, and ID connection
export async function testConnection(
  accessToken: string,
  phoneNumberId: string
): Promise<{ success: boolean; error?: string; details?: any }> {
  if (!accessToken || !phoneNumberId) {
    return { success: false, error: 'Access token and phone number ID are required' };
  }

  try {
    const res = await fetch(`${META_BASE}/${phoneNumberId}`, {
      method: 'GET',
      headers: headers(accessToken),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const details = await res.json();
      return { success: true, details };
    }

    const errText = await res.text().catch(() => '');
    return {
      success: false,
      error: `Verification failed (${res.status}): ${errText.slice(0, 200)}`,
    };
  } catch (err) {
    return {
      success: false,
      error: `Network error: ${(err as Error).message}`,
    };
  }
}

// ═══════════════════════════════════════
// HELPERS: Webhook Parsing
// ═══════════════════════════════════════
export interface ParsedMetaMessage {
  messageId: string;
  fromPhone: string;
  appPhoneId: string; // The phone number ID this webhook was delivered to
  type: string;       // "text" | "image" | "audio" | "video" | "document" | "voice" | "interactive" | "reaction" | "status_update"
  text: string;       // Message content / caption / selected option title
  timestamp: number;
  isStatusUpdate: boolean;
  isReaction?: boolean;
  buttonId?: string;  // Raw button reply id (for button_trigger flows)
  reactionEmoji?: string;
  reactedToMessageId?: string;
  status?: string;    // "sent" | "delivered" | "read" | "failed"
  mediaId?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaCaption?: string;
  // Populated when Meta delivers type:"unsupported" (or attaches an errors array).
  // This is the ONLY place Meta explains WHY a message couldn't be delivered —
  // e.g. code 131051 "Unsupported message type". Capturing it is what lets us
  // diagnose lost messages instead of just storing a blank "[unsupported]".
  errorCode?: number;
  errorReason?: string;
  referral?: {        // Ad click tracking
    source_type?: string;
    source_id?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
    source_url?: string;
  };
}

export function parseMetaWebhook(body: Record<string, any>): ParsedMetaMessage | null {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const metadata = value?.metadata;

    if (!value) return null;

    const appPhoneId = metadata?.phone_number_id || '';

    // Case 1: Status updates
    if (value.statuses && value.statuses.length > 0) {
      const statusObj = value.statuses[0];
      return {
        messageId: statusObj.id || '',
        fromPhone: statusObj.recipient_id || '',
        appPhoneId,
        type: 'status_update',
        text: '',
        timestamp: parseInt(statusObj.timestamp) * 1000 || Date.now(),
        isStatusUpdate: true,
        status: statusObj.status || '',
      };
    }

    // Case 2: Incoming Messages
    if (value.messages && value.messages.length > 0) {
      const msg = value.messages[0];
      const fromPhone = msg.from || '';
      const messageId = msg.id || '';
      const timestamp = parseInt(msg.timestamp) * 1000 || Date.now();
      const msgType = msg.type || 'text';

      let text = '';
      let mediaId: string | undefined;
      let mediaMimeType: string | undefined;
      let mediaFilename: string | undefined;
      let mediaCaption: string | undefined;
      let buttonId: string | undefined;
      let errorCode: number | undefined;
      let errorReason: string | undefined;

      // Meta attaches an `errors` array whenever it can't deliver a message's
      // contents (most commonly alongside type:"unsupported"). Capture it so we
      // can see the real reason instead of a blank marker.
      const firstError = Array.isArray(msg.errors) ? msg.errors[0] : undefined;
      if (firstError) {
        errorCode = typeof firstError.code === 'number' ? firstError.code : undefined;
        errorReason = firstError.title || firstError.error_data?.details || firstError.message || undefined;
      }

      if (msgType === 'text') {
        text = msg.text?.body || '';
      } else if (msgType === 'interactive') {
        const interactiveType = msg.interactive?.type;
        if (interactiveType === 'list_reply') {
          const listReply = msg.interactive?.list_reply;
          text = listReply?.title || listReply?.id || '';
          buttonId = listReply?.id || undefined;
        } else if (interactiveType === 'button_reply') {
          const buttonReply = msg.interactive?.button_reply;
          text = buttonReply?.title || buttonReply?.id || '';
          buttonId = buttonReply?.id || undefined;
        } else {
          text = '[Interactive Option Selected]';
        }
      } else if (msgType === 'button') {
        // Quick replies
        text = msg.button?.text || msg.button?.payload || '';
        buttonId = msg.button?.payload || msg.button?.text || undefined;
      } else if (['image', 'video', 'audio', 'document', 'voice'].includes(msgType)) {
        const mediaObj = msg[msgType];
        mediaId = mediaObj?.id;
        text = mediaObj?.caption || `[${msgType}]`;
        mediaMimeType = mediaObj?.mime_type;
        mediaFilename = mediaObj?.filename;
        mediaCaption = mediaObj?.caption;
      } else if (msgType === 'sticker') {
        const stickerObj = msg.sticker;
        mediaId = stickerObj?.id;
        mediaMimeType = stickerObj?.mime_type || 'image/webp';
        text = '[sticker]';
      } else if (msgType === 'location') {
        const loc = msg.location;
        text = loc ? `📍 Location: ${loc.latitude}, ${loc.longitude}` : '📍 Location shared';
      } else if (msgType === 'contacts') {
        const contact = msg.contacts?.[0];
        text = contact ? `👤 ${contact.name?.formatted_name || 'Contact shared'}` : '👤 Contact shared';
      } else if (msgType === 'unsupported') {
        // Meta sometimes embeds text even in unsupported messages (e.g. system OTPs).
        text = msg.text?.body || '[unsupported]';
        console.warn('⚠️ Meta unsupported msg raw:', JSON.stringify(msg));
      } else if (msgType === 'reaction') {
        const reactionObj = msg.reaction;
        return {
          messageId,
          fromPhone,
          appPhoneId,
          type: 'reaction',
          text: '',
          timestamp,
          isStatusUpdate: false,
          isReaction: true,
          reactionEmoji: reactionObj?.emoji || '',
          reactedToMessageId: reactionObj?.message_id || '',
        };
      } else {
        // Unknown message type — try to extract text body before falling back.
        text = msg.text?.body || `[${msgType}]`;
        console.warn('⚠️ Meta unknown msg type raw:', JSON.stringify(msg));
      }

      // Extract Meta Ad (CTWA) referrals if present
      let referral: ParsedMetaMessage['referral'] | undefined;
      if (msg.referral) {
        referral = {
          source_type: msg.referral.source_type,
          source_id: msg.referral.source_id,
          headline: msg.referral.headline,
          body: msg.referral.body,
          ctwa_clid: msg.referral.ctwa_clid,
          source_url: msg.referral.source_url,
        };
      }

      return {
        messageId,
        fromPhone,
        appPhoneId,
        type: msgType,
        text,
        timestamp,
        isStatusUpdate: false,
        mediaId,
        mediaMimeType,
        mediaFilename,
        mediaCaption,
        errorCode,
        errorReason,
        referral,
        buttonId,
      };
    }
  } catch (err) {
    console.error('❌ Meta parseMetaWebhook error:', err);
  }

  return null;
}

// ═══════════════════════════════════════
// DELETE: Outbound Message (Unsend)
// ═══════════════════════════════════════
export async function deleteWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  waMessageId: string
): Promise<boolean> {
  if (!accessToken || !phoneNumberId || !waMessageId) {
    throw new Error('Meta deleteWhatsAppMessage: missing required parameters');
  }

  const payload = {
    messaging_product: 'whatsapp',
    status: 'deleted',
    message_id: waMessageId,
  };

  return withMetaRetry(async () => {
    try {
      const res = await fetch(`${META_BASE}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: headers(accessToken),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ Meta deleteWhatsAppMessage failed:', errorText);
        return false;
      }

      const data = await res.json();
      return data.success || false;
    } catch (err) {
      console.error('❌ Meta deleteWhatsAppMessage exception:', err);
      return false;
    }
  });
}

// ═══════════════════════════════════════
// STAFF ALERTS
// ═══════════════════════════════════════
export interface StaffAlertResult {
  phone: string;
  ok: boolean;
  error?: string;
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  return digits;
}

export async function sendStaffAlert(
  tenant: {
    wa_phone_number_id?: string | null;
    wa_access_token?: string | null;
    staff_phone?: string | null;
    manager_phone?: string | null;
  },
  text: string
): Promise<StaffAlertResult[]> {
  if (!tenant.wa_phone_number_id || !tenant.wa_access_token) {
    console.error(`❌ sendStaffAlert: skipped — missing ${!tenant.wa_phone_number_id ? 'wa_phone_number_id' : 'wa_access_token'}`);
    return [];
  }

  const rawPhones = [tenant.staff_phone, tenant.manager_phone].filter(Boolean) as string[];
  if (rawPhones.length === 0) {
    console.error(`❌ sendStaffAlert: skipped — no staff/manager phones configured (staff_phone=${tenant.staff_phone}, manager_phone=${tenant.manager_phone})`);
    return [];
  }

  const phones = [...new Set(rawPhones.map(normalizePhone))];
  const token = decryptToken(tenant.wa_access_token) as string;

  const results: StaffAlertResult[] = [];

  await Promise.all(
    phones.map(async (phone) => {
      try {
        await sendTextMessage(token, tenant.wa_phone_number_id!, phone, text);
        console.log(`✅ Staff alert delivered → ${phone}`);
        results.push({ phone, ok: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Staff alert failed → ${phone}: ${msg}`);
        results.push({ phone, ok: false, error: msg });
      }
    })
  );

  return results;
}

// ═══════════════════════════════════════
// VERIFY: Webhook Signature
// ═══════════════════════════════════════
// Verifies HMAC-SHA256 signature from Meta
export function verifySignature(rawBody: string, signature: string, appSecret: string): boolean {
  if (!signature || !appSecret) return false;
  if (!signature.startsWith('sha256=')) return false;

  const expectedSignature = signature.slice(7); // Remove 'sha256='
  const actualSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  if (expectedSignature.length !== actualSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf8'),
    Buffer.from(actualSignature, 'utf8')
  );
}
