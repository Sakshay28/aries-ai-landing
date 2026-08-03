// ═══════════════════════════════════════════════════════════
// 📍 Centralized Location Service
// ═══════════════════════════════════════════════════════════
// Handles saved location database CRUD, Google Maps URL resolution,
// and native WhatsApp location message dispatching.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendLocationMessage } from '@/lib/meta/service';
import { 
  locationPayloadSchema, 
  savedLocationCreateSchema, 
  savedLocationUpdateSchema, 
  parseCoordinatesFromUrl,
  buildGoogleMapsUrl,
  SavedLocation,
  LocationPayload
} from '@/lib/types/location';

export interface LocationSendContext {
  tenantId: string;
  phone: string;
  conversationId: string;
  accessToken: string;
  phoneNumberId: string;
  senderId?: string | null;
  source: 'ai' | 'agent' | 'flow' | 'api' | 'broadcast';
  flowId?: string | null;
  campaignId?: string | null;
}

/**
 * Fetch all active saved locations for a tenant, ordered by priority desc.
 */
export async function getSavedLocations(tenantId: string): Promise<SavedLocation[]> {
  const { data, error } = await supabaseAdmin
    .from('saved_locations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error) {
    console.error('[location-service] Error fetching locations:', error.message);
    throw error;
  }
  return data as SavedLocation[];
}

/**
 * Get a single saved location by ID, enforcing tenant isolation.
 */
export async function getSavedLocationById(tenantId: string, id: string): Promise<SavedLocation | null> {
  const { data, error } = await supabaseAdmin
    .from('saved_locations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[location-service] Error fetching location by ID:', error.message);
    throw error;
  }
  return data as SavedLocation | null;
}

/**
 * Create a new saved location for a tenant.
 */
export async function createSavedLocation(
  tenantId: string, 
  payload: Record<string, any>, 
  createdByUserId?: string
): Promise<SavedLocation> {
  const validated = savedLocationCreateSchema.parse(payload);
  
  // If this location is marked default, unset is_default on other locations
  if (validated.is_default) {
    await supabaseAdmin
      .from('saved_locations')
      .update({ is_default: false })
      .eq('tenant_id', tenantId);
  }

  // Pre-calculate google maps url if not provided
  const mapsUrl = validated.google_maps_url || buildGoogleMapsUrl(validated.latitude, validated.longitude, validated.name);

  const { data, error } = await supabaseAdmin
    .from('saved_locations')
    .insert({
      tenant_id: tenantId,
      name: validated.name,
      address: validated.address,
      latitude: validated.latitude,
      longitude: validated.longitude,
      google_maps_url: mapsUrl,
      place_id: validated.place_id || null,
      category: validated.category || 'MAIN',
      priority: validated.priority ?? 0,
      is_default: validated.is_default ?? false,
      is_active: true,
      created_by: createdByUserId || null,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[location-service] Error creating location:', error.message);
    throw error;
  }
  return data as SavedLocation;
}

/**
 * Update a saved location.
 */
export async function updateSavedLocation(
  tenantId: string, 
  id: string, 
  payload: Record<string, any>
): Promise<SavedLocation> {
  const validated = savedLocationUpdateSchema.parse(payload);

  // Verify ownership
  const existing = await getSavedLocationById(tenantId, id);
  if (!existing) {
    throw new Error('Location not found or permission denied');
  }

  if (validated.is_default) {
    await supabaseAdmin
      .from('saved_locations')
      .update({ is_default: false })
      .eq('tenant_id', tenantId)
      .neq('id', id);
  }

  const { data, error } = await supabaseAdmin
    .from('saved_locations')
    .update({
      ...validated,
      updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[location-service] Error updating location:', error.message);
    throw error;
  }
  return data as SavedLocation;
}

/**
 * Soft delete a saved location.
 */
export async function deleteSavedLocation(tenantId: string, id: string): Promise<boolean> {
  const existing = await getSavedLocationById(tenantId, id);
  if (!existing) {
    throw new Error('Location not found or permission denied');
  }

  const { error } = await supabaseAdmin
    .from('saved_locations')
    .update({
      is_active: false,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('id', id);

  if (error) {
    console.error('[location-service] Error deleting location:', error.message);
    throw error;
  }
  return true;
}

/**
 * Resolve Google Maps URL by following redirects and parsing coordinates.
 */
export async function resolveGoogleMapsUrl(url: string): Promise<{
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}> {
  console.log(`[location-service] Resolving Google Maps URL: ${url}`);
  try {
    let targetUrl = url;
    
    // Follow redirect if short URL (maps.app.goo.gl or goo.gl)
    if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      targetUrl = res.url;
      console.log(`[location-service] Redirected target URL: ${targetUrl}`);
    }

    // Try parsing from redirect URL
    const coords = parseCoordinatesFromUrl(targetUrl);
    if (!coords) {
      throw new Error('Could not extract coordinates from final URL');
    }

    // Attempt to scrape place name/details (best-effort)
    let name: string | undefined;
    let address: string | undefined;
    
    try {
      const htmlRes = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const htmlText = await htmlRes.text();
      
      // Extract title: <title>Romeo Lane Jaipur - Google Maps</title>
      const titleMatch = htmlText.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const fullTitle = titleMatch[1].replace(' - Google Maps', '').trim();
        const parts = fullTitle.split(' to ');
        name = parts[0]?.trim();
        address = parts[1]?.trim() || fullTitle;
      }
    } catch (scrapeErr) {
      console.warn('[location-service] Web scrape title resolution skipped:', scrapeErr);
    }

    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      name: name || 'Location Name',
      address: address || 'Resolved Address'
    };
  } catch (err) {
    console.error('[location-service] Google Maps URL resolution failed:', err);
    throw err;
  }
}

/**
 * Single entry point to send a native WhatsApp location message card,
 * record it in the database messages table, and log analytics.
 */
export async function sendLocationToWhatsApp(
  ctx: LocationSendContext,
  payload: LocationPayload,
  savedLocationId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { tenantId, phone, conversationId, accessToken, phoneNumberId, senderId, source, flowId, campaignId } = ctx;
  const start = Date.now();

  try {
    // 1. Validate payload
    const validated = locationPayloadSchema.parse(payload);
    const cleanPhone = phone.replace(/\D/g, '');

    console.log(`[location-service] Dispatching native location card to +${cleanPhone} (source: ${source})`);

    // 2. Call Meta Cloud API
    const waResult = await sendLocationMessage(
      accessToken,
      phoneNumberId,
      cleanPhone,
      validated.latitude,
      validated.longitude,
      validated.name,
      validated.address
    );

    if (!waResult.messageId) {
      throw new Error('Meta API response was missing message ID');
    }

    // 3. Generate Maps link
    const mapsUrl = buildGoogleMapsUrl(validated.latitude, validated.longitude, validated.name);

    // 4. Insert message record
    const { error: msgInsertErr } = await supabaseAdmin
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'outbound',
        content: `📍 ${validated.name}\n${validated.address}`,
        message_type: 'location',
        channel: 'whatsapp',
        status: 'sent',
        ai_generated: source === 'ai',
        sender_id: senderId || null,
        wa_message_id: waResult.messageId,
        media_url: mapsUrl, // Store maps link in media_url for fallback rendering
        metadata: {
          interactive_type: 'location',
          latitude: validated.latitude,
          longitude: validated.longitude,
          location_name: validated.name,
          location_address: validated.address,
          saved_location_id: savedLocationId,
          google_maps_url: mapsUrl
        }
      });

    if (msgInsertErr) {
      console.error('[location-service] Failed to store message in DB:', msgInsertErr.message);
    }

    // 5. Track in analytics_events
    const { error: analErr } = await supabaseAdmin
      .from('analytics_events')
      .insert({
        tenant_id: tenantId,
        event_type: 'location_sent',
        channel: 'whatsapp',
        metadata: {
          source,
          flow_id: flowId || null,
          campaign_id: campaignId || null,
          location_name: validated.name,
          location_id: savedLocationId || null,
          wa_message_id: waResult.messageId,
          customer_phone: cleanPhone,
          latency_ms: Date.now() - start
        }
      });

    if (analErr) {
      console.error('[location-service] Failed to log analytics event:', analErr.message);
    }

    return { success: true, messageId: waResult.messageId };

  } catch (err: any) {
    const errorMsg = err.message || 'Unknown location send error';
    console.error('[location-service] Send native location exception:', errorMsg);

    // Track failed send in analytics
    try {
      await supabaseAdmin
        .from('analytics_events')
        .insert({
          tenant_id: tenantId,
          event_type: 'location_send_failed',
          channel: 'whatsapp',
          metadata: {
            source,
            flow_id: flowId || null,
            campaign_id: campaignId || null,
            location_name: payload.name,
            error: errorMsg
          }
        });
    } catch (analyticsErr) {
      console.error('Failed to record location analytics failure:', analyticsErr);
    }

    return { success: false, error: errorMsg };
  }
}
