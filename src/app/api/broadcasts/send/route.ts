import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId } = await req.json();
    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId required' }, { status: 400 });
    }

    // Get the campaign
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (campErr || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status !== 'draft') {
      return NextResponse.json({ success: false, error: 'Campaign is not in draft status' }, { status: 400 });
    }

    // Get tenant config
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('gupshup_api_key, gupshup_phone_number')
      .eq('id', tenantId)
      .single();

    if (!tenant?.gupshup_api_key || !tenant?.gupshup_phone_number) {
      return NextResponse.json({ success: false, error: 'Gupshup is not configured in Settings' }, { status: 400 });
    }

    // Update status to sending
    await supabaseAdmin
      .from('broadcast_campaigns')
      .update({ status: 'sending' })
      .eq('id', campaignId);

    // Run the actual send in the background to avoid blocking the response
    // (Vercel has timeouts, so for production you would use a queue like BullMQ or Vercel Inngest)
    // Here we use a simple async fire-and-forget for the demo
    
    processCampaign(tenantId, campaignId, campaign, tenant).catch(console.error);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Broadcast send error:', error);
    return NextResponse.json({ success: false, error: 'Failed to start sending campaign' }, { status: 500 });
  }
}

async function processCampaign(tenantId: string, campaignId: string, campaign: any, tenant: any) {
  try {
    // 1. Fetch leads for the audience
    // For now, it sends to all leads that have a phone number
    const { data: leads, error } = await supabaseAdmin
      .from('leads')
      .select('id, phone')
      .eq('tenant_id', tenantId)
      .not('phone', 'is', null);

    if (error || !leads || leads.length === 0) {
      await supabaseAdmin.from('broadcast_campaigns').update({ status: 'failed' }).eq('id', campaignId);
      return;
    }

    // We can filter based on campaign.audience_filter here if needed in the future

    let sent = 0;
    let failed = 0;

    // Send messages iteratively
    for (const lead of leads) {
      try {
        // Here we format the request to Gupshup.
        // Important: Gupshup requires the message payload to be URLSearchParams, not JSON.
        const params = new URLSearchParams({
          channel: 'whatsapp',
          source: tenant.gupshup_phone_number,
          destination: lead.phone,
          'src.name': 'ariesaidemo', // Using the app name as standard for Gupshup Enterprise template messaging if needed
          template: JSON.stringify({
            id: campaign.template_name,
            params: []
          }),
        });

        const res = await fetch('https://api.gupshup.io/wa/api/v1/template/msg', {
          method: 'POST',
          headers: {
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/x-www-form-urlencoded',
            'apikey': tenant.gupshup_api_key,
          },
          body: params.toString()
        });

        const json = await res.json();
        
        if (json.status === 'submitted') {
          sent++;
          // Log to broadcast_messages
          await supabaseAdmin.from('broadcast_messages').insert({
            tenant_id: tenantId,
            campaign_id: campaignId,
            lead_id: lead.id,
            recipient_phone: lead.phone,
            wa_message_id: json.messageId,
            status: 'sent'
          });
        } else {
          failed++;
        }
      } catch (e) {
        failed++;
        console.error("Failed to send template to", lead.phone, e);
      }

      // Small delay to prevent hitting rate limits
      await new Promise(r => setTimeout(r, 100));
    }

    // Update campaign final status
    await supabaseAdmin.from('broadcast_campaigns').update({
      status: 'completed',
      sent_count: sent,
      failed_count: failed
    }).eq('id', campaignId);

  } catch (error) {
    console.error("Error processing campaign in background:", error);
    await supabaseAdmin.from('broadcast_campaigns').update({ status: 'failed' }).eq('id', campaignId);
  }
}
