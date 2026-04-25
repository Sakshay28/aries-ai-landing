// ═══════════════════════════════════════════════════════════
// 📱 WhatsApp Connect API — Embedded Signup Token Handler
// ═══════════════════════════════════════════════════════════
// Receives the OAuth code from Meta's Embedded Signup flow,
// exchanges it for a permanent access token, then saves
// the WhatsApp credentials to the tenant in Supabase.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { invalidateCache } from '@/lib/tenant/manager';
import axios from 'axios';
import { encryptToken } from '@/lib/utils/crypto';
import { getTenantId } from '@/lib/auth/getTenantId';

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { code, phone_number_id, waba_id, manual = false } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Missing OAuth code from Embedded Signup' },
        { status: 400 }
      );
    }

    // Step 1: Exchange short-lived code for a long-lived access token
    let accessToken: string;

    if (manual && phone_number_id) {
      // Manual mode: caller passes the token directly, skip OAuth exchange
      accessToken = code;
    } else {
      // Embedded Signup flow: exchange the short-lived OAuth code
      try {
        const tokenRes = await axios.get(`${META_GRAPH_URL}/oauth/access_token`, {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: META_APP_ID,
            client_secret: META_APP_SECRET,
            fb_exchange_token: code,
          },
          timeout: 15000,
        });
        accessToken = tokenRes.data.access_token;
        if (!accessToken) throw new Error('No access_token in response');
      } catch (tokenErr) {
        console.error('❌ Token exchange failed:', tokenErr);
        return NextResponse.json(
          { success: false, error: 'Failed to exchange OAuth code. Please try again.' },
          { status: 400 }
        );
      }
    }

    // Step 2: If phone_number_id wasn't provided, look it up from WABA
    let phoneNumberId = phone_number_id;

    let validPhone = false;
    if (waba_id) {
      try {
        const phonesRes = await axios.get(
          `${META_GRAPH_URL}/${waba_id}/phone_numbers`,
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
        );

        const phones = phonesRes.data.data || [];
        if (!phoneNumberId && phones.length > 0) {
          phoneNumberId = phones[0].id;
        }

        // Verify the provided phoneNumberId belongs to this WABA
        if (phoneNumberId && phones.some((p: any) => p.id === phoneNumberId)) {
          validPhone = true;
        }
      } catch (phoneErr) {
        console.error('⚠️ Could not fetch phone numbers:', phoneErr);
      }
    } else if (phoneNumberId) {
      validPhone = true;
    }

    if (!phoneNumberId || !validPhone) {
      return NextResponse.json(
        { success: false, error: 'Invalid phone number or it does not belong to the provided Business Account.' },
        { status: 400 }
      );
    }

    // Step 3: Fetch the display phone number for verification
    let displayPhone = '';
    try {
      const phoneRes = await axios.get(
        `${META_GRAPH_URL}/${phoneNumberId}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
      );
      displayPhone = phoneRes.data.display_phone_number || '';
    } catch {
      // Non-critical
    }

    // Step 4: Register the phone for Cloud API messaging
    const waPin = process.env.WA_CLOUD_API_PIN;
    if (!waPin) {
      console.error('❌ WA_CLOUD_API_PIN is not set. Phone registration skipped.');
    } else {
      try {
        await axios.post(
          `${META_GRAPH_URL}/${phoneNumberId}/register`,
          { messaging_product: 'whatsapp', pin: waPin },
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
        );
        console.log(`✅ Phone ${phoneNumberId} registered for Cloud API`);
      } catch (regErr) {
        console.warn('⚠️ Phone registration step failed (may already be registered):', regErr);
      }
    }

    // Step 5: Subscribe the WABA to webhooks
    if (waba_id) {
      try {
        await axios.post(
          `${META_GRAPH_URL}/${waba_id}/subscribed_apps`,
          {},
          { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10000 }
        );
        console.log(`✅ WABA ${waba_id} subscribed to webhooks`);
      } catch (subErr) {
        console.warn('⚠️ Webhook subscription failed:', subErr);
      }
    }

    // Step 6: Save credentials to Supabase
    const { data: tenant, error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        wa_phone_number_id: phoneNumberId,
        wa_access_token: encryptToken(accessToken),
        wa_business_account_id: waba_id || null,
        wa_webhook_verified: false,
        onboarding_completed: true,
      })
      .eq('id', tenantId)
      .select('id, business_name, wa_phone_number_id')
      .single();

    if (updateErr) {
      throw new Error(`Supabase update failed: ${updateErr.message}`);
    }

    // Invalidate cache so new credentials take effect immediately
    invalidateCache(tenantId);

    // Log analytics
    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenantId,
      event_type: 'whatsapp_connected',
      channel: 'whatsapp',
      metadata: {
        phone_number_id: phoneNumberId,
        display_phone: displayPhone,
        waba_id: waba_id,
      },
    });

    console.log(`✅ [${tenant?.business_name}] WhatsApp connected: ${phoneNumberId} (${displayPhone})`);

    return NextResponse.json({
      success: true,
      data: {
        phone_number_id: phoneNumberId,
        display_phone: displayPhone,
        waba_id: waba_id,
      },
    });
  } catch (error) {
    console.error('❌ WhatsApp connect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to connect WhatsApp. Please try again.' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════
// GET: Check current connection status
// ═══════════════════════════════════════
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('wa_phone_number_id, wa_business_account_id, wa_webhook_verified, onboarding_completed')
    .eq('id', tenantId)
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: {
      connected: !!(data?.wa_phone_number_id),
      phone_number_id: data?.wa_phone_number_id,
      waba_id: data?.wa_business_account_id,
      webhook_verified: data?.wa_webhook_verified,
      onboarding_completed: data?.onboarding_completed,
    },
  });
}
