// ═══════════════════════════════════════════════════════════
// 📲 Gupshup WhatsApp API Service — Multi-Tenant
// ═══════════════════════════════════════════════════════════
// All functions take tenant credentials as parameters so the
// code is always per-tenant, never global.
// API endpoint: https://api.gupshup.io/wa/api/v1/
// Auth: Bearer {API_KEY}
// Phone numbers must NOT have + prefix (e.g., "919876543210")
// ═══════════════════════════════════════════════════════════

const GUPSHUP_BASE = 'https://api.gupshup.io/wa/api/v1';

// ── Retry: up to 3 attempts, exponential backoff, skips 4xx errors ──
async function withGupshupRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = (err as Error).message;
      // 4xx = bad credentials / malformed request — retrying won't help
      if (/Gupshup \w+ error 4\d\d/.test(msg)) throw err;
      if (attempt === maxRetries) throw err;
      // Exponential backoff: 500 ms → 1 s → 2 s
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw new Error('Gupshup: max retries exceeded');
}

// ── Internal: clean phone number for Gupshup ──
function cleanPhone(phone: string): string {
  return phone.replace(/[\s+\-()]/g, '');
}

// ── Internal: build auth headers (Gupshup requires x-www-form-urlencoded) ──
function headers(apiKey: string): Record<string, string> {
  return {
    'apikey': apiKey,
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

// ── Internal types ──
export type GupshupMediaType = 'image' | 'video' | 'audio' | 'file';

export interface GupshupSendResult {
  messageId: string;
  status: string;
}

// ═══════════════════════════════════════
// SEND: Text Message
// ═══════════════════════════════════════
export async function sendTextMessage(
  apiKey: string,
  phoneNumber: string,      // Your Gupshup sender number (e.g. "919876543210")
  destination: string,      // Customer phone number
  text: string,
  appName: string           // Tenant's Gupshup app name (src.name)
): Promise<GupshupSendResult> {
  if (!apiKey || !phoneNumber || !destination || !text || !appName) {
    throw new Error('Gupshup sendTextMessage: missing required parameters');
  }

  const params = new URLSearchParams({
    channel: 'whatsapp',
    source: cleanPhone(phoneNumber),
    'src.name': appName,
    destination: cleanPhone(destination),
    message: JSON.stringify({ type: 'text', text }),
  });

  return withGupshupRetry(async () => {
    let res: Response;
    try {
      res = await fetch(`${GUPSHUP_BASE}/msg`, {
        method: 'POST',
        headers: headers(apiKey),
        body: params.toString(),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      throw new Error(`Gupshup network error: ${(err as Error).message}`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Gupshup error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    return {
      messageId: data.id || data.messageId || '',
      status: data.status || 'sent',
    };
  });
}

// ═══════════════════════════════════════
// SEND: Template Message (HSM)
// ═══════════════════════════════════════
export async function sendTemplateMessage(
  apiKey: string,
  phoneNumber: string,
  destination: string,
  templateName: string,
  variables: string[] = [],
  languageCode = 'en',
  appName: string = ''
): Promise<GupshupSendResult> {
  if (!apiKey || !phoneNumber || !destination || !templateName || !appName) {
    throw new Error('Gupshup sendTemplateMessage: missing required parameters (appName required)');
  }

  const params = new URLSearchParams({
    channel: 'whatsapp',
    source: cleanPhone(phoneNumber),
    'src.name': appName,
    destination: cleanPhone(destination),
    message: JSON.stringify({
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(variables.length > 0 && { bodyValues: variables }),
      },
    }),
  });

  return withGupshupRetry(async () => {
    let res: Response;
    try {
      res = await fetch(`${GUPSHUP_BASE}/msg`, {
        method: 'POST',
        headers: headers(apiKey),
        body: params.toString(),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      throw new Error(`Gupshup network error: ${(err as Error).message}`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Gupshup template error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    return {
      messageId: data.id || data.messageId || '',
      status: data.status || 'sent',
    };
  });
}

// ═══════════════════════════════════════
// SEND: Media Message (image/video/audio/file)
// ═══════════════════════════════════════
export async function sendMediaMessage(
  apiKey: string,
  phoneNumber: string,
  destination: string,
  mediaType: GupshupMediaType,
  url: string,
  caption: string | undefined,
  appName: string
): Promise<GupshupSendResult> {
  if (!apiKey || !phoneNumber || !destination || !url || !appName) {
    throw new Error('Gupshup sendMediaMessage: missing required parameters');
  }

  const mediaPayload: Record<string, string> = { url };
  if (caption && mediaType === 'image') {
    mediaPayload.caption = caption;
  }

  const params = new URLSearchParams({
    channel: 'whatsapp',
    source: cleanPhone(phoneNumber),
    'src.name': appName,
    destination: cleanPhone(destination),
    message: JSON.stringify({
      type: mediaType,
      [mediaType]: mediaPayload,
    }),
  });

  return withGupshupRetry(async () => {
    let res: Response;
    try {
      res = await fetch(`${GUPSHUP_BASE}/msg`, {
        method: 'POST',
        headers: headers(apiKey),
        body: params.toString(),
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      throw new Error(`Gupshup network error: ${(err as Error).message}`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Gupshup media error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    return {
      messageId: data.id || data.messageId || '',
      status: data.status || 'sent',
    };
  });
}

// ═══════════════════════════════════════
// TEST: Connection Verification
// ═══════════════════════════════════════
// Sends a message to self — Gupshup uses this to verify credentials.
export async function testConnection(
  apiKey: string,
  phoneNumber: string,
  appName: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiKey || !phoneNumber || !appName) {
    return { success: false, error: 'API key, phone number and app name are required' };
  }

  try {
    const params = new URLSearchParams({
      channel: 'whatsapp',
      source: cleanPhone(phoneNumber),
      'src.name': appName,
      destination: cleanPhone(phoneNumber), // Send to self
      message: JSON.stringify({
        type: 'text',
        text: '✅ Aries AI connection test successful.',
      }),
    });

    const res = await fetch(`${GUPSHUP_BASE}/msg`, {
      method: 'POST',
      headers: headers(apiKey),
      body: params.toString(),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      return { success: true };
    }

    // 4xx means credentials are wrong or phone number is invalid
    const errText = await res.text().catch(() => '');
    return {
      success: false,
      error: `Connection failed (${res.status}). Check your API key and phone number.`,
    };
  } catch (err) {
    return {
      success: false,
      error: `Network error: ${(err as Error).message}`,
    };
  }
}

// ═══════════════════════════════════════
// GET: Opted-In Contacts
// ═══════════════════════════════════════
export async function getOptedContacts(apiKey: string): Promise<string[]> {
  if (!apiKey) return [];

  try {
    const res = await fetch(`${GUPSHUP_BASE}/contacts/opted`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Gupshup contacts error: ${res.status}`);
    }

    const data = await res.json();
    return data.contacts || [];
  } catch (err) {
    console.error('❌ Gupshup getOptedContacts error:', (err as Error).message);
    return [];
  }
}

// ═══════════════════════════════════════
// HELPERS: Webhook Parsing
// ═══════════════════════════════════════
export interface ParsedGupshupMessage {
  messageId: string;
  fromPhone: string;       // Customer phone number (e.g. "919876543210")
  appPhone: string;        // Your Gupshup sender phone (from "app" field)
  appName: string;         // Gupshup app name (from body.app)
  type: string;            // "text" | "image" | "audio" | "video" | "file" | "location"
  text: string;            // Extracted message text / caption
  timestamp: number;
  isStatusUpdate: boolean;
  status?: string;         // "sent" | "delivered" | "read" | "failed"
  mediaUrl?: string;
  referral?: {             // Present when message comes from a Click-to-WhatsApp ad
    source_type?: string;  // "ad"
    source_id?: string;    // Meta ad ID
    headline?: string;     // Ad headline
    body?: string;         // Ad body text
    ctwa_clid?: string;    // Click ID for attribution
    source_url?: string;   // Ad URL
  };
}

export function parseGupshupWebhook(body: Record<string, unknown>): ParsedGupshupMessage | null {
  const eventType = body.type as string;
  const app = (body.app as string) || '';
  const timestamp = (body.timestamp as number) || Date.now();
  const payload = body.payload as Record<string, unknown>;

  if (!payload) return null;

  console.log('🔍 Gupshup eventType:', eventType, '| app:', app, '| payload keys:', Object.keys(payload));

  // Status update event — Gupshup v2 uses "message-event"
  if (eventType === 'message-event' || eventType === 'message-status') {
    return {
      messageId: (payload.id as string) || '',
      fromPhone: (payload.destination as string) || (payload.source as string) || '',
      appPhone: app,
      appName: app,
      type: 'status_update',
      text: '',
      timestamp,
      isStatusUpdate: true,
      status: (payload.type as string) || (payload.status as string) || '',
    };
  }

  // Incoming message event
  if (eventType === 'message') {
    const msgType = (payload.type as string) || 'text';
    let text = '';
    let mediaUrl: string | undefined;

    if (msgType === 'text') {
      // Gupshup v2: text is at payload.payload.text
      const innerPayload = payload.payload as Record<string, unknown> | undefined;
      text = (innerPayload?.text as string) || (payload.text as string) || '';
    } else if (['image', 'video', 'audio', 'file'].includes(msgType)) {
      const innerPayload = payload.payload as Record<string, unknown> | undefined;
      const mediaObj = (innerPayload || payload[msgType]) as Record<string, string> | undefined;
      mediaUrl = mediaObj?.url || (payload.url as string) || '';
      text = mediaObj?.caption || `[${msgType}]`;
    } else if (msgType === 'location') {
      const innerPayload = payload.payload as Record<string, unknown> | undefined;
      const loc = (innerPayload || payload.location) as Record<string, number> | undefined;
      text = loc ? `📍 Location: ${loc.latitude}, ${loc.longitude}` : '📍 Location shared';
    } else {
      text = `[${msgType}]`;
    }

    // CTWA: Meta passes referral data when message is from a Click-to-WhatsApp ad
    const referral = (payload.referral as Record<string, string> | undefined) ||
      ((payload.payload as Record<string, unknown>)?.referral as Record<string, string> | undefined);

    return {
      messageId: (payload.id as string) || '',
      fromPhone: (payload.source as string) || '',
      appPhone: app,   // app name — used for tenant lookup by gupshup_app_name
      appName: app,
      type: msgType,
      text,
      timestamp,
      isStatusUpdate: false,
      ...(mediaUrl && { mediaUrl }),
      ...(referral && { referral }),
    };
  }

  console.log('⚠️ Gupshup: unrecognised event type:', eventType);
  return null;
}

// ═══════════════════════════════════════
// UTILITY: Is Gupshup configured?
// ═══════════════════════════════════════
export function isGupshupConfigured(tenant: {
  gupshup_api_key?: string | null;
  gupshup_phone_number?: string | null;
}): boolean {
  return !!(tenant.gupshup_api_key && tenant.gupshup_phone_number);
}

// ═══════════════════════════════════════
// STAFF ALERTS
// ═══════════════════════════════════════
export async function sendStaffAlert(
  tenant: {
    gupshup_api_key?: string | null;
    gupshup_phone_number?: string | null;
    gupshup_app_name?: string | null;
    staff_phone?: string | null;
    manager_phone?: string | null;
  },
  text: string
): Promise<void> {
  if (!isGupshupConfigured(tenant)) return;
  if (!tenant.gupshup_app_name) return;
  if (!tenant.staff_phone && !tenant.manager_phone) return;

  const phones = [tenant.staff_phone, tenant.manager_phone].filter(Boolean) as string[];
  for (const phone of phones) {
    try {
      await sendTextMessage(
        tenant.gupshup_api_key as string,
        tenant.gupshup_phone_number as string,
        phone,
        `🔔 STAFF ALERT:\n\n${text}`,
        tenant.gupshup_app_name as string
      );
    } catch (err) {
      console.error(`Failed to send staff alert to ${phone}:`, err);
    }
  }
}
