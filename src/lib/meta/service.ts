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
  return phone.replace(/[\s+\-()]/g, '');
}

// ── Generate Request Headers ──
function headers(accessToken: string): Record<string, string> {
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
// SEND: Text Message
// ═══════════════════════════════════════
export async function sendTextMessage(
  accessToken: string,
  phoneNumberId: string,
  destination: string,
  text: string
): Promise<MetaSendResult> {
  if (!accessToken || !phoneNumberId || !destination || !text) {
    throw new Error('Meta sendTextMessage: missing required parameters');
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone(destination),
    type: 'text',
    text: {
      preview_url: false,
      body: text,
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
  caption?: string
): Promise<MetaSendResult> {
  if (!accessToken || !phoneNumberId || !destination || !url) {
    throw new Error('Meta sendMediaMessage: missing required parameters');
  }

  const mediaPayload: Record<string, string> = { link: url };
  if (caption && (mediaType === 'image' || mediaType === 'document')) {
    mediaPayload.caption = caption;
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone(destination),
    type: mediaType,
    [mediaType]: mediaPayload,
  };

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

      if (msgType === 'text') {
        text = msg.text?.body || '';
      } else if (msgType === 'interactive') {
        const interactiveType = msg.interactive?.type;
        if (interactiveType === 'list_reply') {
          const listReply = msg.interactive?.list_reply;
          text = listReply?.title || listReply?.id || '';
        } else if (interactiveType === 'button_reply') {
          const buttonReply = msg.interactive?.button_reply;
          text = buttonReply?.title || buttonReply?.id || '';
        } else {
          text = '[Interactive Option Selected]';
        }
      } else if (msgType === 'button') {
        // Quick replies
        text = msg.button?.text || msg.button?.payload || '';
      } else if (['image', 'video', 'audio', 'document', 'voice'].includes(msgType)) {
        const mediaObj = msg[msgType];
        mediaId = mediaObj?.id;
        text = mediaObj?.caption || `[${msgType}]`;
        mediaMimeType = mediaObj?.mime_type;
        mediaFilename = mediaObj?.filename;
        mediaCaption = mediaObj?.caption;
      } else if (msgType === 'location') {
        const loc = msg.location;
        text = loc ? `📍 Location: ${loc.latitude}, ${loc.longitude}` : '📍 Location shared';
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
          reactionEmoji: reactionObj?.emoji || '👍',
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
          ctwa_clid: msg.referral.ctwa_clid || msg.referral.video_url || msg.referral.image_url, // fallback logic
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
      };
    }
  } catch (err) {
    console.error('❌ Meta parseMetaWebhook error:', err);
  }

  return null;
}

// ═══════════════════════════════════════
// STAFF ALERTS
// ═══════════════════════════════════════
export async function sendStaffAlert(
  tenant: {
    wa_phone_number_id?: string | null;
    wa_access_token?: string | null;
    staff_phone?: string | null;
    manager_phone?: string | null;
  },
  text: string
): Promise<void> {
  if (!tenant.wa_phone_number_id || !tenant.wa_access_token) return;
  if (!tenant.staff_phone && !tenant.manager_phone) return;

  const phones = [tenant.staff_phone, tenant.manager_phone].filter(Boolean) as string[];
  const token = decryptToken(tenant.wa_access_token) as string;

  for (const phone of phones) {
    try {
      await sendTextMessage(
        token,
        tenant.wa_phone_number_id,
        phone,
        `🔔 STAFF ALERT:\n\n${text}`
      );
    } catch (err) {
      console.error(`Failed to send staff alert to ${phone} via Meta:`, err);
    }
  }
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
