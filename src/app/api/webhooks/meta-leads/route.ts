// ═══════════════════════════════════════════════════════════
// 🔗 Meta Lead Ads Public Webhook Route
// ═══════════════════════════════════════════════════════════
// 1. Verification (GET): Standard hub.challenge handshake.
// 2. Lead Sync (POST): Listens to leadgen webhook, queries
//    the Graph API, and inserts the lead into the tenant CRM.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { triggerCapiEvent } from '@/lib/integrations/capi-trigger';
import { verifySignature } from '@/lib/meta/service';

// The Verification Token you enter inside the Facebook Developer Console Webhooks configuration
const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'aries_ai_leads_token_2026';

/**
 * 1. Webhook Handshake Verification (GET)
 * Facebook requests this to confirm ownership of the server.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Meta Webhook Verification successful!');
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  console.warn('❌ Meta Webhook Verification failed: invalid verify token.');
  return new Response('Verification Token mismatch', { status: 403 });
}

/**
 * 2. Incoming Lead Gen Sync Notification (POST)
 */
export async function POST(req: NextRequest) {
  try {
    const appSecret = process.env.META_APP_SECRET;
    const signature = req.headers.get('x-hub-signature-256') ?? '';
    const rawBody = await req.text();

    if (!appSecret) {
      console.error('❌ META_APP_SECRET not set — rejecting meta-leads webhook');
      return new Response('Unauthorized', { status: 401 });
    }
    if (!verifySignature(rawBody, signature, appSecret)) {
      console.warn('❌ Meta Leads Webhook: signature verification failed');
      return new Response('Unauthorized', { status: 401 });
    }

    const body = JSON.parse(rawBody);

    // Check if the change is a leadgen event
    if (body.object !== 'page') {
      return NextResponse.json({ success: true, message: 'Non-page object ignored' });
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'leadgen') continue;

        const value = change.value;
        if (!value || !value.leadgen_id) continue;

        const leadgenId = value.leadgen_id;
        const formId = value.form_id;
        const pageId = entry.id; // Page ID linked to the event
        const campaignId = value.campaign_id || null;
        const adsetId = value.adgroup_id || null;
        const adId = value.ad_id || null;

        console.log(`📥 Incoming Meta Leadgen: ID ${leadgenId}, Form: ${formId}, Page: ${pageId}`);

        // Find the active tenant who has configured this Meta page or form
        // Querying all tenant_integrations where integration_id = 'meta_ads' and is_active = true
        const { data: integrations, error: intError } = await supabaseAdmin
          .from('tenant_integrations')
          .select('tenant_id, config')
          .eq('integration_id', 'meta_ads')
          .eq('is_active', true);

        if (intError || !integrations || integrations.length === 0) {
          console.warn('⚠️ No active Meta integrations found for this event.');
          continue;
        }

        // Find matching tenant integration
        const matchedIntegration = integrations.find((integration: any) => {
          const cfg = integration.config || {};
          const pageIds = cfg.page_ids || [];
          const formIds = (cfg.forms || []).map((f: any) => f.form_id);
          return pageIds.includes(pageId) || formIds.includes(formId);
        });

        if (!matchedIntegration) {
          console.warn(`⚠️ Leadgen form ${formId} / Page ${pageId} not associated with any active tenant.`);
          continue;
        }

        const tenantId = matchedIntegration.tenant_id;
        const config = matchedIntegration.config as Record<string, any>;
        const systemToken = config.access_token;

        if (!systemToken) {
          console.error(`❌ Integration found but System Access Token is missing for tenant: ${tenantId}`);
          continue;
        }

        // 3. Query the Graph API to fetch full lead customer fields
        const leadRes = await fetch(`https://graph.facebook.com/v20.0/${leadgenId}?access_token=${systemToken}`);
        if (!leadRes.ok) {
          console.error(`❌ Failed to fetch lead data from Graph API: ${leadRes.statusText}`);
          continue;
        }

        const leadData = await leadRes.json();
        const fieldData = leadData.field_data || [];

        // Parse fields dynamically
        let name = '';
        let email = '';
        let phone = '';

        // Extract native questions and custom inputs
        for (const field of fieldData) {
          const fName = field.name?.toLowerCase();
          const fVal = field.values?.[0];
          if (!fVal) continue;

          if (fName.includes('full_name') || fName === 'name') {
            name = fVal;
          } else if (fName.includes('email')) {
            email = fVal;
          } else if (fName.includes('phone') || fName.includes('contact')) {
            phone = fVal;
          }
        }

        if (!phone && !email) {
          console.warn('⚠️ Retrieved lead has neither email nor phone number. Skipping creation.');
          continue;
        }

        // Standardize Name if blank
        if (!name) name = 'Meta Ad Lead';

        // 4. Check if lead already exists to avoid double entries
        const { data: existingLead } = await supabaseAdmin
          .from('leads')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('phone', phone)
          .maybeSingle();

        if (existingLead) {
          console.log(`🔄 Lead with phone ${phone} already exists in tenant ${tenantId}. Updating campaign data.`);
          await supabaseAdmin
            .from('leads')
            .update({
              meta_campaign_id: campaignId,
              meta_adset_id: adsetId,
              meta_ad_id: adId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingLead.id);
          continue;
        }

        // 5. Create new CRM lead with Meta Ads attribution
        const { data: newLead, error: insertError } = await supabaseAdmin
          .from('leads')
          .insert({
            tenant_id: tenantId,
            name,
            phone,
            email,
            channel: 'manual', // or introduce 'meta_ads' channel in CHECK constraint if altered
            source_detail: 'Meta Lead Gen Form',
            meta_campaign_id: campaignId,
            meta_adset_id: adsetId,
            meta_ad_id: adId,
            lead_status: 'new',
            notes: `Auto-synced lead from Meta Lead Form: ${leadData.form_id || formId}`,
          })
          .select()
          .single();

        if (insertError) {
          console.error(`❌ CRM Insertion Error:`, insertError);
          continue;
        }

        // Log analytics event
        await supabaseAdmin.from('analytics_events').insert({
          tenant_id: tenantId,
          event_type: 'lead_captured',
          metadata: {
            lead_id: newLead.id,
            source: 'meta_leadgen',
            campaign_id: campaignId,
          },
        });

        // Trigger Meta Conversions API (CAPI) Lead conversion event
        await triggerCapiEvent('Lead', {
          tenantId,
          leadId: newLead.id,
        });

        console.log(`🎉 Successfully Synced Lead gen from Meta Ads! Tenant: ${tenantId}, Lead: ${name} (${phone})`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ Meta Webhook POST Error:', err);
    return NextResponse.json({ success: false, error: 'Internal Webhook sync error' }, { status: 500 });
  }
}
