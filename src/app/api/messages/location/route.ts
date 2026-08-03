import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendLocationToWhatsApp, getSavedLocationById, LocationSendContext } from '@/lib/location/service';
import { decryptToken } from '@/lib/utils/crypto';
import { getRedisClient } from '@/lib/redis/client';
import { sendLocationByIdSchema, sendLocationInlineSchema } from '@/lib/types/location';

// Simple rate limiter using Redis
async function checkApiRateLimit(tenantId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true; // fail open

  const key = `rate:api:messages:${tenantId}`;
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, 60); // limit per minute
    }
    return current <= 60; // 60 requests per minute limit
  } catch {
    return true;
  }
}

/**
 * POST /api/messages/location
 * Public API to send a native WhatsApp location card to a customer.
 */
export async function POST(req: NextRequest) {
  const start = Date.now();
  console.log('[public-location-api] Incoming request');

  try {
    // 1. Authenticate via x-api-key header
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Missing x-api-key header' }, { status: 401 });
    }

    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, wa_access_token, wa_phone_number_id, is_active')
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json({ success: false, error: 'Invalid API key or inactive tenant' }, { status: 401 });
    }

    // 2. Rate limiting check
    const rateOk = await checkApiRateLimit(tenant.id);
    if (!rateOk) {
      return NextResponse.json({ success: false, error: 'Too many requests. Limit is 60/min.' }, { status: 429 });
    }

    // 3. Parse and validate body
    const body = await req.json();
    const phone = body.phone;
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Missing phone number' }, { status: 400 });
    }

    let locPayload: { latitude: number; longitude: number; name: string; address: string } | null = null;
    let savedLocationId: string | undefined = undefined;

    if (body.locationId) {
      const parsed = sendLocationByIdSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'Invalid payload: locationId must be a UUID' }, { status: 400 });
      }
      
      const savedLoc = await getSavedLocationById(tenant.id, body.locationId);
      if (!savedLoc) {
        return NextResponse.json({ success: false, error: 'Saved location not found or permission denied' }, { status: 404 });
      }
      locPayload = {
        latitude: savedLoc.latitude,
        longitude: savedLoc.longitude,
        name: savedLoc.name,
        address: savedLoc.address
      };
      savedLocationId = savedLoc.id;
    } else {
      const parsed = sendLocationInlineSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 });
      }
      locPayload = {
        latitude: body.latitude,
        longitude: body.longitude,
        name: body.name,
        address: body.address
      };
    }

    if (!tenant.wa_access_token || !tenant.wa_phone_number_id) {
      return NextResponse.json({ success: false, error: 'WhatsApp is not configured for this account' }, { status: 400 });
    }

    const decryptedToken = decryptToken(tenant.wa_access_token);
    if (!decryptedToken) {
      return NextResponse.json({ success: false, error: 'Token decryption failed' }, { status: 500 });
    }

    const cleanPhone = phone.replace(/\D/g, '');

    // 4. Resolve or create conversation
    let conversationId: string | null = null;
    try {
      const { data: convs } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenant.id)
        .eq('sender_id', cleanPhone)
        .limit(1);
      
      if (convs && convs.length > 0) {
        conversationId = convs[0].id;
      } else {
        // Create conversation
        const { data: newConv } = await supabaseAdmin
          .from('conversations')
          .insert({
            tenant_id: tenant.id,
            sender_id: cleanPhone,
            sender_name: cleanPhone,
            channel: 'whatsapp',
            is_active: true,
            bot_paused: false,
            created_at: new Date().toISOString(),
            last_message_at: new Date().toISOString()
          })
          .select('id')
          .single();
        conversationId = newConv?.id ?? null;
      }
    } catch (convErr: any) {
      console.error('[public-location-api] Conversation resolution error:', convErr);
    }

    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'Failed to create conversation context' }, { status: 500 });
    }

    // 5. Send location card
    const sendCtx: LocationSendContext = {
      tenantId: tenant.id,
      phone: cleanPhone,
      conversationId,
      accessToken: decryptedToken,
      phoneNumberId: tenant.wa_phone_number_id,
      source: 'api'
    };

    const result = await sendLocationToWhatsApp(sendCtx, locPayload, savedLocationId);
    
    // Log API audit details
    console.log(`[public-location-api] Audit: tenant=${tenant.id} phone=${cleanPhone} location=${locPayload.name} status=${result.success ? 'success' : 'failed'} duration=${Date.now() - start}ms`);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'Meta API delivery failed' }, { status: 502 });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });

  } catch (err: any) {
    console.error('[public-location-api] POST error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
