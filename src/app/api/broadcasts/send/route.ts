import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { sendTemplateMessage } from '@/lib/gupshup/service';

export async function POST(req: NextRequest) {
  try {
    const { campaignId } = await req.json();

    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'Missing campaignId' }, { status: 400 });
    }

    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createServerSupabaseClient();

    // 1. Get Campaign details
    const { data: campaign, error: campaignErr } = await supabase
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (campaignErr || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status === 'sending' || campaign.status === 'completed') {
      return NextResponse.json({ success: false, error: 'Campaign already sent or sending' }, { status: 400 });
    }

    // 2. Get Tenant Gupshup Credentials
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('gupshup_api_key, gupshup_phone_number')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant || !tenant.gupshup_api_key || !tenant.gupshup_phone_number) {
      return NextResponse.json({ success: false, error: 'Gupshup is not configured' }, { status: 400 });
    }

    // 3. Mark campaign as sending
    await supabaseAdmin
      .from('broadcast_campaigns')
      .update({ status: 'sending', sent_at: new Date().toISOString() })
      .eq('id', campaignId);

    // 4. Fetch target audience (leads)
    // For now, if audience_filter is empty, fetch all leads with a phone number
    const { data: leads, error: leadsErr } = await supabaseAdmin
      .from('leads')
      .select('id, phone')
      .eq('tenant_id', tenantId)
      .not('phone', 'is', null);

    if (leadsErr || !leads || leads.length === 0) {
      await supabaseAdmin.from('broadcast_campaigns').update({ status: 'failed' }).eq('id', campaignId);
      return NextResponse.json({ success: false, error: 'No valid leads found in audience' }, { status: 400 });
    }

    // 5. Fire off messages (In production, this should be sent to a background worker queue)
    // To respect Gupshup rate limits (~100 req/sec for templates), we map sequentially or chunk
    // Vercel serverless functions max duration is 10s-60s depending on plan.
    // For the MVP, we process in a fast loop asynchronously and return 200 early or wait for a small batch.

    const processCampaign = async () => {
      let sentCount = 0;
      let failedCount = 0;

      for (const lead of leads) {
        if (!lead.phone) continue;

        try {
          const result = await sendTemplateMessage(
            tenant.gupshup_api_key as string,
            tenant.gupshup_phone_number as string,
            lead.phone,
            campaign.template_name,
            campaign.template_variables || []
          );

          // Log broadcast message
          await supabaseAdmin.from('broadcast_messages').insert({
            tenant_id: tenantId,
            campaign_id: campaignId,
            lead_id: lead.id,
            recipient_phone: lead.phone,
            wa_message_id: result.messageId,
            status: result.status === 'failed' ? 'failed' : 'sent',
            sent_at: new Date().toISOString()
          });

          if (result.status === 'failed') failedCount++;
          else sentCount++;

        } catch (error) {
          console.error(`Broadcast failed for lead ${lead.id}:`, error);
          await supabaseAdmin.from('broadcast_messages').insert({
            tenant_id: tenantId,
            campaign_id: campaignId,
            lead_id: lead.id,
            recipient_phone: lead.phone,
            status: 'failed',
            error_message: (error as Error).message
          });
          failedCount++;
        }
      }

      // Finalize campaign
      await supabaseAdmin.from('broadcast_campaigns').update({
        status: failedCount === leads.length ? 'failed' : 'completed',
        sent_count: sentCount,
        failed_count: failedCount
      }).eq('id', campaignId);
    };

    // Run the sending process (fire-and-forget for now to prevent Vercel timeout on large lists)
    processCampaign().catch(console.error);

    return NextResponse.json({
      success: true,
      message: 'Campaign sending started',
      audience_size: leads.length
    });

  } catch (error) {
    console.error('Broadcast send error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
