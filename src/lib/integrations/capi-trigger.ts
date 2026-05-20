// ═══════════════════════════════════════════════════════════
// 🎯 Conversions API (CAPI) Automation Triggers
// ═══════════════════════════════════════════════════════════
// Provides high-level utility functions to capture server-side events
// (Leads, Schedules, Purchases) and automatically fire them to Meta's CAPI.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendMetaCapiEvent } from './meta-capi';

interface TriggerContext {
  tenantId: string;
  leadId: string;
  clientIp?: string;
  clientUserAgent?: string;
}

/**
 * Triggers a Meta CAPI event automatically for a tenant and lead.
 * Seamlessly resolves configuration and hashes identifiers before sending.
 */
export async function triggerCapiEvent(
  eventName: 'Lead' | 'Schedule' | 'Purchase' | 'Contact',
  context: TriggerContext,
  customData?: { value?: number; currency?: string; contentName?: string }
): Promise<{ success: boolean; message?: string }> {
  try {
    const { tenantId, leadId, clientIp, clientUserAgent } = context;

    // 1. Fetch active Meta Ads integration configuration for the tenant
    const { data: integration, error: intError } = await supabaseAdmin
      .from('tenant_integrations')
      .select('config, is_active')
      .eq('tenant_id', tenantId)
      .eq('integration_id', 'meta_ads')
      .maybeSingle();

    if (intError || !integration || !integration.is_active) {
      // Quiet fail if Meta integration is not active or configured
      return { success: false, message: 'Meta Ads integration not active or configured for this tenant.' };
    }

    const config = integration.config as Record<string, any>;
    const pixelId = config.pixel_id;
    const accessToken = config.access_token;

    // Check if CAPI mapping is enabled for this specific event type
    const capiEvents = config.capi_events || ['Lead', 'Schedule', 'Purchase'];
    if (!capiEvents.includes(eventName)) {
      return { success: false, message: `Meta CAPI tracking is disabled for event: ${eventName}` };
    }

    if (!pixelId || !accessToken) {
      return { success: false, message: 'Missing Meta Pixel ID or System Access Token in integration settings.' };
    }

    // 2. Retrieve lead contact and attribution details
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('name, email, phone, fbclid')
      .eq('id', leadId)
      .maybeSingle();

    if (leadError || !lead) {
      return { success: false, message: `Lead details not found for ID: ${leadId}` };
    }

    // 3. Dispatch the CAPI call to the API runner
    const result = await sendMetaCapiEvent(pixelId, accessToken, {
      eventName,
      userContext: {
        email: lead.email || undefined,
        phone: lead.phone || undefined,
        fullName: lead.name || undefined,
        fbclid: lead.fbclid || undefined,
        clientIp: clientIp || undefined,
        clientUserAgent: clientUserAgent || undefined,
      },
      customData: customData ? {
        value: customData.value,
        currency: customData.currency || 'INR',
        contentName: customData.contentName,
      } : undefined,
    });

    if (!result.success) {
      console.error(`❌ Meta CAPI triggering failed for ${eventName}:`, result.error);
      return { success: false, message: result.error };
    }

    return { success: true };
  } catch (err) {
    console.error('❌ Unexpected error in triggerCapiEvent:', err);
    return { success: false, message: err instanceof Error ? err.message : 'Unknown exception' };
  }
}
