// ═══════════════════════════════════════════════════════════
// 📍 AI Tool: Send Location Card
// ═══════════════════════════════════════════════════════════
// Resolves locations semantically via database lookup based on
// category, name, or keywords, and dispatches native maps.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendLocationToWhatsApp, LocationSendContext } from '@/lib/location/service';
import { AITool, ToolContext } from './registry';
import { SavedLocation } from '@/lib/types/location';

export class SendLocationTool implements AITool {
  async execute(ctx: ToolContext, args: Record<string, any>): Promise<{ success: boolean; error?: string }> {
    const { tenantId } = ctx;
    const query = (args.query || '').trim().toLowerCase();

    console.log(`[send-location-tool] Resolving location semantically for tenant ${tenantId} using query: "${query}"`);

    // 1. Fetch all active saved locations for this tenant
    const { data: locations, error: dbErr } = await supabaseAdmin
      .from('saved_locations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (dbErr || !locations || locations.length === 0) {
      const errorMsg = dbErr?.message || 'No saved locations found for this tenant.';
      console.warn(`[send-location-tool] Lookup failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    const savedLocations = locations as SavedLocation[];
    let matchedLocation: SavedLocation | null = null;

    // 2. Try exact/partial category match if query aligns with category enum
    const queryUpper = query.toUpperCase();
    const categoryMatches = savedLocations.filter(
      (loc) => loc.category === queryUpper
    );

    if (categoryMatches.length > 0) {
      // Pick highest priority or default
      matchedLocation = this.selectBestLocation(categoryMatches);
      console.log(`[send-location-tool] Category match found: "${matchedLocation.name}" (category: ${matchedLocation.category})`);
    }

    // 3. Try semantic/name/address keyword matching
    if (!matchedLocation && query) {
      const keywordMatches = savedLocations.filter((loc) => {
        const nameMatch = loc.name.toLowerCase().includes(query);
        const addrMatch = loc.address.toLowerCase().includes(query);
        const catMatch = loc.category.toLowerCase().includes(query);
        return nameMatch || addrMatch || catMatch;
      });

      if (keywordMatches.length > 0) {
        matchedLocation = this.selectBestLocation(keywordMatches);
        console.log(`[send-location-tool] Semantic match found: "${matchedLocation.name}" (score check: query match)`);
      }
    }

    // 4. Fallback to default location
    if (!matchedLocation) {
      const defaultLoc = savedLocations.find((loc) => loc.is_default);
      if (defaultLoc) {
        matchedLocation = defaultLoc;
        console.log(`[send-location-tool] Fallback used: default location "${matchedLocation.name}"`);
      }
    }

    // 5. Fallback to highest priority location
    if (!matchedLocation) {
      matchedLocation = this.selectBestLocation(savedLocations);
      console.log(`[send-location-tool] Fallback used: highest priority location "${matchedLocation.name}"`);
    }

    if (!matchedLocation) {
      return { success: false, error: 'Could not resolve a suitable location.' };
    }

    // 6. Send the native location card
    const sendCtx: LocationSendContext = {
      tenantId: ctx.tenantId,
      phone: ctx.phone,
      conversationId: ctx.conversationId,
      accessToken: ctx.accessToken,
      phoneNumberId: ctx.phoneNumberId,
      senderId: ctx.senderId,
      source: 'ai',
      flowId: ctx.flowId,
      campaignId: ctx.campaignId
    };

    return sendLocationToWhatsApp(
      sendCtx,
      {
        latitude: matchedLocation.latitude,
        longitude: matchedLocation.longitude,
        name: matchedLocation.name,
        address: matchedLocation.address
      },
      matchedLocation.id
    );
  }

  /**
   * Selects the best location from a list based on default status and priority.
   */
  private selectBestLocation(locations: SavedLocation[]): SavedLocation {
    // 1. Check if any are default
    const def = locations.find((l) => l.is_default);
    if (def) return def;

    // 2. Sort by priority desc, then created_at asc
    return [...locations].sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    })[0];
  }
}
