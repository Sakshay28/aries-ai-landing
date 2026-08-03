import { NextRequest, NextResponse, after } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { sendLocationToWhatsApp, getSavedLocationById, LocationSendContext } from '@/lib/location/service';
import { decryptToken } from '@/lib/utils/crypto';

/**
 * POST /api/chat/send-location
 * Sends a native location message card from Live Chat.
 * Accepts:
 * - conversationId (required)
 * - locationId (optional, saved location ID)
 * - inline coordinates: latitude, longitude, name, address (optional fallback)
 */
export async function POST(req: NextRequest) {
  try {
    const { conversationId, locationId, latitude, longitude, name, address } = await req.json();

    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'Missing conversationId' }, { status: 400 });
    }

    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    // 1. Fetch conversation and tenant credentials in parallel
    const [convResult, tenantResult] = await Promise.all([
      supabase
        .from('conversations')
        .select('id, sender_id, tenant_id, channel, leads(phone)')
        .eq('id', conversationId)
        .eq('tenant_id', tenantId)
        .single(),
      supabaseAdmin
        .from('tenants')
        .select('wa_access_token, wa_phone_number_id')
        .eq('id', tenantId)
        .single(),
    ]);

    const { data: conv, error: convErr } = convResult;
    const { data: tenant, error: tenantErr } = tenantResult;

    if (convErr || !conv) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    if (tenantErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    if (!tenant.wa_access_token || !tenant.wa_phone_number_id) {
      return NextResponse.json({ success: false, error: 'WhatsApp credentials are not active. Contact support.' }, { status: 400 });
    }

    // 2. Resolve coordinates
    let locPayload: { latitude: number; longitude: number; name: string; address: string } | null = null;
    let savedLocationId: string | undefined = undefined;

    if (locationId) {
      const savedLoc = await getSavedLocationById(tenantId, locationId);
      if (!savedLoc) {
        return NextResponse.json({ success: false, error: 'Saved location not found' }, { status: 404 });
      }
      locPayload = {
        latitude: savedLoc.latitude,
        longitude: savedLoc.longitude,
        name: savedLoc.name,
        address: savedLoc.address
      };
      savedLocationId = savedLoc.id;
    } else if (latitude !== undefined && longitude !== undefined && name && address) {
      locPayload = { latitude, longitude, name, address };
    }

    if (!locPayload) {
      return NextResponse.json({ success: false, error: 'Missing location details or ID' }, { status: 400 });
    }

    // 3. Determine recipient phone number
    const leadsData = conv.leads as unknown as { phone: string | null } | { phone: string | null }[] | null;
    const leadPhone = Array.isArray(leadsData) ? leadsData[0]?.phone : leadsData?.phone;
    const recipientPhone = leadPhone || conv.sender_id;

    // 4. Decrypt token
    const decryptedToken = decryptToken(tenant.wa_access_token);
    if (!decryptedToken) {
      return NextResponse.json({ success: false, error: 'Token decryption failed' }, { status: 500 });
    }

    // 5. Send asynchronously using after() to keep agent panel snappy
    const sendCtx: LocationSendContext = {
      tenantId,
      phone: recipientPhone,
      conversationId,
      accessToken: decryptedToken,
      phoneNumberId: tenant.wa_phone_number_id,
      source: 'agent',
    };

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locPayload.name)}`;

    // Create optimistic message record first so agent gets instant feedback
    const { data: insertedMsg, error: insertErr } = await supabaseAdmin
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'outbound',
        content: `📍 ${locPayload.name}\n${locPayload.address}`,
        message_type: 'location',
        channel: 'whatsapp',
        status: 'sent',
        ai_generated: false,
        media_url: mapsUrl,
        metadata: {
          interactive_type: 'location',
          latitude: locPayload.latitude,
          longitude: locPayload.longitude,
          location_name: locPayload.name,
          location_address: locPayload.address,
          saved_location_id: savedLocationId,
          google_maps_url: mapsUrl
        }
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[send-location-api] Failed to store message:', insertErr);
      return NextResponse.json({ success: false, error: 'Failed to insert message' }, { status: 500 });
    }

    after(async () => {
      try {
        const sendResult = await sendLocationToWhatsApp(sendCtx, locPayload!, savedLocationId);
        
        if (!sendResult.success) {
          // Flip message to failed if Meta rejects it
          await supabaseAdmin
            .from('messages')
            .update({ status: 'failed', error_message: sendResult.error || 'Meta API error' })
            .eq('id', insertedMsg.id);
        } else {
          // correlation update for delivery webhooks
          await supabaseAdmin
            .from('messages')
            .update({ wa_message_id: sendResult.messageId })
            .eq('id', insertedMsg.id);
        }

        // Keep conversation active
        await supabaseAdmin
          .from('conversations')
          .update({ last_message_at: new Date().toISOString(), is_active: true })
          .eq('id', conversationId);

      } catch (err: any) {
        console.error('[send-location-api] Async send error:', err);
        await supabaseAdmin
          .from('messages')
          .update({ status: 'failed', error_message: err.message || 'Unknown error' })
          .eq('id', insertedMsg.id);
      }
    });

    return NextResponse.json({ success: true, messageId: insertedMsg.id, message: insertedMsg });

  } catch (err: any) {
    console.error('[send-location-api] POST error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
