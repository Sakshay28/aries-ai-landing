import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { decryptToken } from '@/lib/utils/crypto';
import { sendTemplateMessage } from '@/lib/gupshup/service';

const BATCH_DELAY_MS = 200;  // 5 msg/s — safe for all Gupshup plans
const MAX_RECIPIENTS = 500;  // guard against Vercel 5-min timeout

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
      .select('gupshup_api_key, gupshup_phone_number, gupshup_app_name')
      .eq('id', tenantId)
      .single();

    if (!tenant?.gupshup_api_key || !tenant?.gupshup_phone_number || !tenant?.gupshup_app_name) {
      return NextResponse.json({ success: false, error: 'Gupshup is not configured in Settings' }, { status: 400 });
    }

    // Update status to sending
    await supabaseAdmin
      .from('broadcast_campaigns')
      .update({ status: 'sending' })
      .eq('id', campaignId);

    // after() runs after the 200 is flushed — true fire-and-forget.
    after(() => processCampaign(tenantId, campaignId, campaign, tenant));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Broadcast send error:', error);
    return NextResponse.json({ success: false, error: 'Failed to start sending campaign' }, { status: 500 });
  }
}

async function processCampaign(
  tenantId: string,
  campaignId: string,
  campaign: Record<string, unknown>,
  tenant: Record<string, unknown>
) {
  try {
    const decryptedApiKey = decryptToken(tenant.gupshup_api_key as string) as string;

    const { data: leads, error } = await supabaseAdmin
      .from('leads')
      .select('id, phone')
      .eq('tenant_id', tenantId)
      .not('phone', 'is', null)
      .limit(MAX_RECIPIENTS);

    if (error || !leads || leads.length === 0) {
      await supabaseAdmin
        .from('broadcast_campaigns')
        .update({ status: 'failed' })
        .eq('id', campaignId);
      return;
    }

    let sent = 0;
    let failed = 0;

    for (const lead of leads) {
      try {
        const result = await sendTemplateMessage(
          decryptedApiKey,
          tenant.gupshup_phone_number as string,
          lead.phone,
          campaign.template_name as string,
          [],
          'en',
          tenant.gupshup_app_name as string
        );

        sent++;
        await supabaseAdmin.from('broadcast_messages').insert({
          tenant_id: tenantId,
          campaign_id: campaignId,
          lead_id: lead.id,
          recipient_phone: lead.phone,
          wa_message_id: result.messageId,
          status: 'sent',
        });
      } catch (e) {
        failed++;
        console.error(`Broadcast: failed to send to ${lead.phone}:`, (e as Error).message);
      }

      // 200 ms between sends = 5 msg/s (safe for all Gupshup plans)
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }

    await supabaseAdmin
      .from('broadcast_campaigns')
      .update({ status: 'completed', sent_count: sent, failed_count: failed })
      .eq('id', campaignId);

  } catch (error) {
    console.error('Broadcast: campaign processing failed:', error);
    await supabaseAdmin
      .from('broadcast_campaigns')
      .update({ status: 'failed' })
      .eq('id', campaignId);
  }
}
