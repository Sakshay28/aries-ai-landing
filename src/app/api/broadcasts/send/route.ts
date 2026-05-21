import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { processCampaign } from '@/lib/broadcast/queue';

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
      .select('wa_access_token, wa_phone_number_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) {
      return NextResponse.json({ success: false, error: 'WhatsApp is not yet active for your account. Contact support.' }, { status: 400 });
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
