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

// ── Retry helper: up to 3 attempts, exponential backoff, skips 4xx errors ──
async function withMetaRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = (err as Error).message;
      // 4xx errors are credentials/payload issues - retrying will not help
      if (/Meta Cloud API error 4\d\d/.test(msg) || /status 4\d\d/.test(msg)) {
        throw err;
      }
      if (attempt === maxRetries) throw err;
      // Exponential backoff: 500 ms → 1 s → 2 s
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw new Error('Meta API: max retries exceeded');
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
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Meta Cloud API error ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    return {
      messageId: data.messages?.[0]?.id || '',
      status: 'sent',
    };
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
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Meta Cloud API template error ${res.status}: ${errText.slice(0, 300)}`);
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
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Meta Cloud API media error ${res.status}: ${errText.slice(0, 300)}`);
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
        text = '[unsupported]';
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
        text = `[${msgType}]`;
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
  if (!tenant.wa_phone_number_id || !tenant.wa_access_token) return [];

  const rawPhones = [tenant.staff_phone, tenant.manager_phone].filter(Boolean) as string[];
  if (rawPhones.length === 0) return [];

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
