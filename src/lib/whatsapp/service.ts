// ═══════════════════════════════════════════════════════════
// 📲 WhatsApp Cloud API Service — Multi-Tenant
// ═══════════════════════════════════════════════════════════
// Every function takes a `tenant` parameter so it uses
// THAT client's WhatsApp credentials, not a global config.
// ═══════════════════════════════════════════════════════════

import crypto from 'crypto';
import axios from 'axios';
import type { Tenant } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { withRetry } from '@/lib/utils/safety';
import { decryptToken } from '@/lib/utils/crypto';
import { Resend } from 'resend';
import { invalidateCache } from '@/lib/tenant/manager';

const WA_API_VERSION = 'v21.0';
const WA_API_BASE = `https://graph.facebook.com/${WA_API_VERSION}`;

// ── Headers for a specific tenant ──
function getHeaders(tenant: Tenant) {
  return {
    Authorization: `Bearer ${decryptToken(tenant.wa_access_token)}`,
    'Content-Type': 'application/json',
  };
}

function getMessagesUrl(tenant: Tenant) {
  return `${WA_API_BASE}/${tenant.wa_phone_number_id}/messages`;
}

export function isWhatsAppConfigured(tenant: Tenant): boolean {
  return !!(tenant.wa_phone_number_id && tenant.wa_access_token);
}

// ═══════════════════════════════════════
// SEND: Text Message
// ═══════════════════════════════════════
export async function sendTextMessage(tenant: Tenant, to: string, text: string) {
  const phone = to.replace(/[^0-9]/g, '');

  if (!isWhatsAppConfigured(tenant)) {
    console.log(`📤 [DEMO] ${tenant.business_name} → ${phone}: ${text.slice(0, 80)}...`);
    return { messaging_product: 'whatsapp', status: 'demo', to: phone };
  }

  try {
    const { data } = await withRetry(async () => {
      return await axios.post(
        getMessagesUrl(tenant),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phone,
          type: 'text',
          text: { preview_url: true, body: text },
        },
        { headers: getHeaders(tenant), timeout: 10000 }
      );
    }, { maxRetries: 3, delayMs: 1000, context: 'sendTextMessage' });

    console.log(`📤 [${tenant.business_name}] WA → ${phone} (${data.messages?.[0]?.id})`);
    return data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { data?: { error?: { message?: string; code?: number; type?: string } }; status?: number }; message?: string };
    const errData = axiosError.response?.data?.error;
    const httpStatus = axiosError.response?.status;
    console.error(`❌ [${tenant.business_name}] WA send error:`, errData?.message || axiosError.message);

    // ── Fix #13: Detect expired token — only on confirmed OAuthException ──
    // Meta returns 401 for both expired tokens AND transient rate-limit blocks.
    // Only wipe the token if it's specifically the OAuthException type.
    if (httpStatus === 401 && errData?.type === 'OAuthException' && errData?.code === 190) {
      console.error(`🔑 [${tenant.business_name}] ACCESS TOKEN EXPIRED — flagging tenant`);
      await handleTokenExpiry(tenant);
    }

    if (errData?.code === 131047) {
      console.error('   → 24h window expired. Use a template message.');
    }
    throw error;
  }
}

// ═══════════════════════════════════════
// SEND: Interactive Buttons (max 3)
// ═══════════════════════════════════════
export async function sendButtonMessage(
  tenant: Tenant,
  to: string,
  bodyText: string,
  buttons: { id: string; title: string }[]
) {
  const phone = to.replace(/[^0-9]/g, '');
  if (!isWhatsAppConfigured(tenant)) {
    console.log(`📤 [DEMO] ${tenant.business_name} Buttons → ${phone}`);
    return { status: 'demo' };
  }

  const buttonRows = buttons.slice(0, 3).map((btn, i) => ({
    type: 'reply',
    reply: { id: btn.id || `btn_${i}`, title: btn.title.slice(0, 20) },
  }));

  try {
    const { data } = await axios.post(
      getMessagesUrl(tenant),
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: { buttons: buttonRows },
        },
      },
      { headers: getHeaders(tenant), timeout: 10000 }
    );

    console.log(`📤 [${tenant.business_name}] Buttons → ${phone}`);
    return data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { status?: number, data?: { error?: { code?: number; type?: string } } } };
    const errData = axiosError.response?.data?.error;
    if (axiosError.response?.status === 401 && errData?.type === 'OAuthException' && errData?.code === 190) {
      await handleTokenExpiry(tenant);
    }
    throw error;
  }
}

// ═══════════════════════════════════════
// SEND: Interactive List
// ═══════════════════════════════════════
export async function sendListMessage(
  tenant: Tenant,
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: { title: string; rows: { id: string; title: string; description?: string }[] }[]
) {
  const phone = to.replace(/[^0-9]/g, '');
  if (!isWhatsAppConfigured(tenant)) {
    console.log(`📤 [DEMO] ${tenant.business_name} List → ${phone}`);
    return { status: 'demo' };
  }

  try {
    const { data } = await axios.post(
      getMessagesUrl(tenant),
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: bodyText },
          action: {
            button: buttonLabel.slice(0, 20),
            sections: sections.map((sec) => ({
              title: sec.title,
              rows: sec.rows.map((r) => ({
                id: r.id,
                title: r.title.slice(0, 24),
                description: r.description?.slice(0, 72),
              })),
            })),
          },
        },
      },
      { headers: getHeaders(tenant), timeout: 10000 }
    );

    console.log(`📤 [${tenant.business_name}] List → ${phone}`);
    return data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { status?: number, data?: { error?: { code?: number; type?: string } } } };
    const errData = axiosError.response?.data?.error;
    if (axiosError.response?.status === 401 && errData?.type === 'OAuthException' && errData?.code === 190) {
      await handleTokenExpiry(tenant);
    }
    throw error;
  }
}

// ═══════════════════════════════════════
// SEND: Template Message (for 24h+ window)
// ═══════════════════════════════════════
export async function sendTemplateMessage(
  tenant: Tenant,
  to: string,
  templateName: string,
  languageCode = 'en',
  components: Record<string, unknown>[] = []
) {
  const phone = to.replace(/[^0-9]/g, '');
  if (!isWhatsAppConfigured(tenant)) {
    console.log(`📤 [DEMO] ${tenant.business_name} Template → ${phone}: ${templateName}`);
    return { status: 'demo' };
  }

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };

  if (components.length > 0) {
    (payload.template as Record<string, unknown>).components = components;
  }

  try {
    const { data } = await axios.post(getMessagesUrl(tenant), payload, {
      headers: getHeaders(tenant),
      timeout: 10000,
    });

    console.log(`📤 [${tenant.business_name}] Template → ${phone} (${templateName})`);
    return data;
  } catch (error: unknown) {
    const axiosError = error as { response?: { status?: number, data?: { error?: { code?: number; type?: string } } } };
    const errData = axiosError.response?.data?.error;
    if (axiosError.response?.status === 401 && errData?.type === 'OAuthException' && errData?.code === 190) {
      await handleTokenExpiry(tenant);
    }
    throw error;
  }
}

// ═══════════════════════════════════════
// SEND: Mark as Read
// ═══════════════════════════════════════
export async function markAsRead(tenant: Tenant, messageId: string) {
  if (!isWhatsAppConfigured(tenant)) return;

  try {
    await axios.post(
      getMessagesUrl(tenant),
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers: getHeaders(tenant), timeout: 5000 }
    );
  } catch {
    // Non-critical, don't throw
  }
}

// ═══════════════════════════════════════
// SEND: Staff Alert
// ═══════════════════════════════════════
export async function sendStaffAlert(tenant: Tenant, alertText: string) {
  if (tenant.staff_phone) {
    await sendTextMessage(tenant, tenant.staff_phone, alertText).catch(() => {});
  }
  if (tenant.manager_phone && tenant.manager_phone !== tenant.staff_phone) {
    await sendTextMessage(tenant, tenant.manager_phone, alertText).catch(() => {});
  }
}

// ═══════════════════════════════════════
// WEBHOOK: Verify (GET)
// ═══════════════════════════════════════
export function verifyWebhook(
  queryParams: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string },
  expectedToken: string
): { valid: boolean; challenge?: string } {
  const mode = queryParams['hub.mode'];
  const token = queryParams['hub.verify_token'];
  const challenge = queryParams['hub.challenge'];

  if (mode === 'subscribe' && token === expectedToken) {
    return { valid: true, challenge };
  }
  return { valid: false };
}

// ═══════════════════════════════════════
// WEBHOOK: Verify Signature
// ═══════════════════════════════════════
export function verifySignature(rawBody: string, signature: string, appSecret: string): boolean {
  if (!appSecret) return true; // Skip in dev

  const decryptedSecret = decryptToken(appSecret) || appSecret;
  const expected = crypto.createHmac('sha256', decryptedSecret).update(rawBody).digest('hex');
  return signature === `sha256=${expected}`;
}

// ═══════════════════════════════════════
// WEBHOOK: Parse Incoming Payload
// ═══════════════════════════════════════
export interface ParsedWhatsAppMessage {
  messageId: string;
  from: string;
  timestamp: string;
  profileName: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  type: string;
  text: string;
  buttonReplyId: string | null;
  buttonReplyTitle: string | null;
  listReplyId: string | null;
  listReplyTitle: string | null;
  isReaction: boolean;
  isStatusUpdate: boolean;
  media: Record<string, unknown> | null;
  location: Record<string, unknown> | null;
  referral: Record<string, unknown> | null;
  status?: string;
  recipientId?: string;
  errors?: unknown[];
}

export function parseWebhookPayload(body: Record<string, unknown>): ParsedWhatsAppMessage[] {
  const messages: ParsedWhatsAppMessage[] = [];
  const entries = (body?.entry as Record<string, unknown>[]) || [];

  for (const entry of entries) {
    const changes = (entry.changes as Record<string, unknown>[]) || [];

    for (const change of changes) {
      if (change.field !== 'messages') continue;

      const value = change.value as Record<string, unknown>;
      if (!value) continue;

      const metadata = (value.metadata as Record<string, string>) || {};
      const contacts = (value.contacts as Record<string, unknown>[]) || [];
      const msgs = (value.messages as Record<string, unknown>[]) || [];

      for (const msg of msgs) {
        const contact = contacts.find(
          (c) => (c as Record<string, string>).wa_id === (msg as Record<string, string>).from
        ) as Record<string, unknown> | undefined;
        const profileName = ((contact?.profile as Record<string, string>)?.name) || '';

        const parsed: ParsedWhatsAppMessage = {
          messageId: msg.id as string,
          from: msg.from as string,
          timestamp: msg.timestamp as string,
          profileName,
          phoneNumberId: metadata.phone_number_id || '',
          displayPhoneNumber: metadata.display_phone_number || '',
          type: msg.type as string,
          text: '',
          buttonReplyId: null,
          buttonReplyTitle: null,
          listReplyId: null,
          listReplyTitle: null,
          isReaction: false,
          isStatusUpdate: false,
          media: null,
          location: null,
          referral: (msg.referral as Record<string, unknown>) || null,
        };

        switch (msg.type) {
          case 'text':
            parsed.text = ((msg.text as Record<string, string>)?.body) || '';
            break;
          case 'interactive': {
            const interactive = msg.interactive as Record<string, unknown>;
            if (interactive?.type === 'button_reply') {
              const reply = interactive.button_reply as Record<string, string>;
              parsed.buttonReplyId = reply.id;
              parsed.buttonReplyTitle = reply.title;
              parsed.text = reply.title;
            } else if (interactive?.type === 'list_reply') {
              const reply = interactive.list_reply as Record<string, string>;
              parsed.listReplyId = reply.id;
              parsed.listReplyTitle = reply.title;
              parsed.text = reply.title;
            }
            break;
          }
          case 'button': {
            const button = msg.button as Record<string, string>;
            parsed.text = button?.text || '';
            parsed.buttonReplyId = button?.payload || '';
            break;
          }
          case 'image':
          case 'video':
          case 'audio':
          case 'document':
          case 'sticker':
            parsed.media = (msg[msg.type as string] as Record<string, unknown>) || null;
            parsed.text = ((msg[msg.type as string] as Record<string, string>)?.caption) || `[${msg.type}]`;
            break;
          case 'location':
            parsed.location = msg.location as Record<string, unknown>;
            parsed.text = `📍 Location shared`;
            break;
          case 'reaction':
            parsed.isReaction = true;
            parsed.text = ((msg.reaction as Record<string, string>)?.emoji) || '';
            break;
          default:
            parsed.text = `[${msg.type}]`;
        }

        messages.push(parsed);
      }

      // Status updates
      const statuses = (value.statuses as Record<string, unknown>[]) || [];
      for (const status of statuses) {
        messages.push({
          messageId: status.id as string,
          from: '',
          timestamp: status.timestamp as string,
          profileName: '',
          phoneNumberId: metadata.phone_number_id || '',
          displayPhoneNumber: '',
          type: 'status_update',
          text: '',
          buttonReplyId: null,
          buttonReplyTitle: null,
          listReplyId: null,
          listReplyTitle: null,
          isReaction: false,
          isStatusUpdate: true,
          media: null,
          location: null,
          referral: null,
          status: status.status as string,
          recipientId: status.recipient_id as string,
          errors: (status.errors as unknown[]) || [],
        });
      }
    }
  }

  return messages;
}

// ═══════════════════════════════════════
// Fix #13: Token Expiry Handler
// ═══════════════════════════════════════
// When a 401 is detected, flag the tenant and alert admin.
async function handleTokenExpiry(tenant: Tenant): Promise<void> {
  try {
    // Flag the tenant's token as expired and clear access token
    await supabaseAdmin
      .from('tenants')
      .update({
        wa_webhook_verified: false,
        wa_token_expired: true,
        wa_access_token: null,
      })
      .eq('id', tenant.id);
      
    await invalidateCache(tenant.id);

    // Log analytics event
    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenant.id,
      event_type: 'token_expired',
      channel: 'whatsapp',
      metadata: {
        business_name: tenant.business_name,
        phone_number_id: tenant.wa_phone_number_id,
        detected_at: new Date().toISOString(),
      },
    });

    if (process.env.RESEND_API_KEY && tenant.business_email) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'Aries AI Alerts <alerts@ariesai.in>',
        to: tenant.business_email,
        subject: '⚠️ ACTION REQUIRED: WhatsApp Connection Disconnected',
        html: `
          <h2>WhatsApp Connection Error</h2>
          <p>Hello ${tenant.business_name},</p>
          <p>Your WhatsApp Cloud API token has expired or been revoked. Your AI Assistant is currently offline.</p>
          <p>Please log in to your dashboard and reconnect your WhatsApp account immediately to resume service.</p>
        `,
      }).catch(e => console.error('Failed to send expiry email:', e));
    }

    // Alert platform admin via WhatsApp if configured
    const adminPhone = process.env.PLATFORM_ADMIN_PHONE;
    if (adminPhone) {
      // Direct axios call to send alert to admin using global credentials if available
      console.log(`📱 Admin alert: Token expired for ${tenant.business_name}`);
    }

    console.error(`🔑 [${tenant.business_name}] Token flagged as expired in Supabase. Client needs to reconnect.`);
  } catch (err) {
    console.error('❌ Failed to handle token expiry:', err);
  }
}


