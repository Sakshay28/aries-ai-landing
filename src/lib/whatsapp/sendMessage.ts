import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';

export interface SendMessageParams {
  to: string;
  templateName: string;
  languageCode: string;
  variables: Record<string, string>;
  tenantId?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends a WhatsApp template message using the Meta WhatsApp Cloud API.
 * Supports per-tenant credentials loaded from the database, with a fallback to environment variables.
 */
export async function sendWhatsAppMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const { to, templateName, languageCode, variables, tenantId } = params;

  let accessToken = '';
  let phoneNumberId = '';

  // 1. Resolve credentials
  if (tenantId) {
    try {
      const { data: tenant, error: tenantErr } = await supabaseAdmin
        .from('tenants')
        .select('wa_access_token, wa_phone_number_id')
        .eq('id', tenantId)
        .single();

      if (!tenantErr && tenant) {
        if (tenant.wa_access_token) {
          try {
            accessToken = decryptToken(tenant.wa_access_token as string) || '';
          } catch (decryptErr) {
            console.error(`[whatsapp] Failed to decrypt token for tenant ${tenantId}:`, decryptErr);
          }
        }
        phoneNumberId = tenant.wa_phone_number_id || '';
      }
    } catch (err) {
      console.error(`[whatsapp] Database error resolving tenant credentials for ${tenantId}:`, err);
    }
  }

  // Fallback to environment variables if database credentials are not found
  if (!accessToken) {
    accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  }
  if (!phoneNumberId) {
    phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  }

  if (!accessToken || !phoneNumberId) {
    const errorMsg = 'Missing Meta credentials. Please set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID or link your Meta account.';
    console.error('[whatsapp] Credentials check failed:', errorMsg);
    return { success: false, error: errorMsg };
  }

  // 2. Sanitise phone number: keep only digits
  const cleanTo = to.replace(/\D/g, '');
  if (!cleanTo || cleanTo.length < 10) {
    const errorMsg = `Invalid phone number format: "${to}"`;
    console.error('[whatsapp] Phone validation failed:', errorMsg);
    return { success: false, error: errorMsg };
  }

  // 3. Build body components from variables sorted numerically by key
  const sortedKeys = Object.keys(variables).sort((a, b) => Number(a) - Number(b));
  const bodyComponents = sortedKeys.length > 0
    ? [{
        type: 'body',
        parameters: sortedKeys.map((key) => ({
          type: 'text',
          text: String(variables[key]),
        })),
      }]
    : [];

  const payload = {
    messaging_product: 'whatsapp',
    to: cleanTo,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode || 'en' },
      components: bodyComponents,
    },
  };

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  // 4. Send Meta API request with error handling & logs
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errMsg = data?.error?.message || `HTTP error ${response.status}`;
      console.error('[whatsapp] Meta API request failed:', errMsg, JSON.stringify(data));
      return { success: false, error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id;
    if (!messageId) {
      const errMsg = 'No message ID returned from Meta API response';
      console.error('[whatsapp] Response missing message ID:', JSON.stringify(data));
      return { success: false, error: errMsg };
    }

    console.log(`[whatsapp] Successfully sent message ${messageId} to ${cleanTo}`);
    return { success: true, messageId };

  } catch (err: any) {
    const errMsg = err.message || 'Unknown network or request error';
    console.error('[whatsapp] Send WhatsApp message exception:', errMsg);
    return { success: false, error: errMsg };
  }
}
