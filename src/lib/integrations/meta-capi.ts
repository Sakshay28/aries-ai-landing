// ═══════════════════════════════════════════════════════════
// 📊 Meta Conversions API (CAPI) Helper Library
// ═══════════════════════════════════════════════════════════
// Handles secure, server-side conversion delivery to Meta Ads Manager
// with automatic SHA-256 hashing for user privacy.
// ═══════════════════════════════════════════════════════════

import crypto from 'crypto';

// Hashing helper
export function sha256(val: string): string {
  if (!val) return '';
  const cleaned = val.trim().toLowerCase();
  return crypto.createHash('sha256').update(cleaned).digest('hex');
}

// Phone-specific hashing helper
export function hashPhone(phone: string): string {
  if (!phone) return '';
  // Meta expects phone numbers to be numbers only, including country code (no '+' or spaces)
  const cleaned = phone.replace(/\D/g, '');
  return sha256(cleaned);
}

interface CapiUserContext {
  email?: string;
  phone?: string;
  fullName?: string;
  fbclid?: string;
  clientIp?: string;
  clientUserAgent?: string;
}

interface CapiCustomData {
  value?: number;
  currency?: string;
  contentName?: string;
  contentCategory?: string;
}

interface CapiEventPayload {
  eventName: 'Lead' | 'Schedule' | 'Purchase' | 'Contact' | 'CompleteRegistration';
  userContext: CapiUserContext;
  customData?: CapiCustomData;
  eventSourceUrl?: string;
}

/**
 * Fires a server-side conversion event to the Meta Conversions API
 */
export async function sendMetaCapiEvent(
  pixelId: string,
  accessToken: string,
  payload: CapiEventPayload
): Promise<{ success: boolean; error?: string; fbTraceId?: string }> {
  try {
    if (!pixelId || !accessToken) {
      return { success: false, error: 'Missing Meta Pixel ID or System Access Token' };
    }

    const { eventName, userContext, customData, eventSourceUrl } = payload;

    // 1. Prepare User Data with SHA-256 Hashing
    const userData: Record<string, any> = {};

    if (userContext.email) {
      userData.em = [sha256(userContext.email)];
    }

    if (userContext.phone) {
      userData.ph = [hashPhone(userContext.phone)];
    }

    if (userContext.fullName) {
      const parts = userContext.fullName.trim().split(/\s+/);
      if (parts.length > 0) {
        userData.fn = [sha256(parts[0])]; // First name
        if (parts.length > 1) {
          userData.ln = [sha256(parts[parts.length - 1])]; // Last name
        }
      }
    }

    // Facebook Click ID (fbc) and Browser details
    if (userContext.fbclid) {
      // fbc format: fb.1.<timestamp>.<fbclid>
      const ts = Math.floor(Date.now());
      userData.fbc = `fb.1.${ts}.${userContext.fbclid}`;
    }

    if (userContext.clientIp) {
      userData.client_ip_address = userContext.clientIp;
    }

    if (userContext.clientUserAgent) {
      userData.client_user_agent = userContext.clientUserAgent;
    }

    // 2. Format Custom Data (if any)
    const formattedCustomData: Record<string, any> = {};
    if (customData) {
      if (customData.value !== undefined) {
        formattedCustomData.value = customData.value;
      }
      if (customData.currency) {
        formattedCustomData.currency = customData.currency || 'INR';
      }
      if (customData.contentName) {
        formattedCustomData.content_name = customData.contentName;
      }
      if (customData.contentCategory) {
        formattedCustomData.content_category = customData.contentCategory;
      }
    }

    // 3. Formulate the single event payload
    const eventObject = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      user_data: userData,
      custom_data: Object.keys(formattedCustomData).length > 0 ? formattedCustomData : undefined,
      event_source_url: eventSourceUrl || 'https://www.ariesai.in',
      action_source: 'system_generated',
    };

    // 4. Fire POST request to Facebook Graph API
    const response = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        data: [eventObject],
      }),
    });

    const resData = await response.json();

    if (!response.ok) {
      console.error('❌ Meta CAPI request failed:', resData);
      return {
        success: false,
        error: resData?.error?.message || 'Meta API returned an error status',
      };
    }

    console.log(`🚀 Meta CAPI Conversion Sent: ${eventName} for ${userContext.email || 'Phone/Lead'}`);
    return {
      success: true,
      fbTraceId: resData?.fb_trace_id,
    };
  } catch (err) {
    console.error('❌ Error in sendMetaCapiEvent:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unknown delivery error occurred',
    };
  }
}
