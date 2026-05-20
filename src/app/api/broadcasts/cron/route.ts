import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { processCampaign } from '@/app/api/broadcasts/send/route';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Basic authorization check if needed (e.g. from environment secret or header)
    // To allow easy cron trigger, we'll allow standard GET/POST execution,
    // but in a production setup, we can secure it using a secret token header.
    const authHeader = req.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date().toISOString();

    // Find all scheduled campaigns ready to be sent
    const { data: scheduledCampaigns, error: fetchErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now);

    if (fetchErr) {
      console.error('Error fetching scheduled campaigns:', fetchErr);
      return NextResponse.json({ success: false, error: 'Failed to fetch scheduled campaigns' }, { status: 500 });
    }

    if (!scheduledCampaigns || scheduledCampaigns.length === 0) {
      return NextResponse.json({ success: true, message: 'No scheduled campaigns ready for execution' });
    }

    const triggeredCampaignIds: string[] = [];

    for (const campaign of scheduledCampaigns) {
      // 1. Instantly mark campaign as sending to prevent other cron sweeps from picking it up
      await supabaseAdmin
        .from('broadcast_campaigns')
        .update({ status: 'sending' })
        .eq('id', campaign.id);

      // 2. Fetch tenant credentials
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('gupshup_api_key, gupshup_phone_number, gupshup_app_name')
        .eq('id', campaign.tenant_id)
        .single();

      if (tenant?.gupshup_api_key && tenant?.gupshup_phone_number && tenant?.gupshup_app_name) {
        // 3. Process the campaign in the background safely (fire-and-forget style to avoid timeout)
        processCampaign(campaign.tenant_id, campaign.id, campaign, tenant).catch(err => {
          console.error(`Scheduled Campaign ${campaign.id} execution failed:`, err);
        });
        triggeredCampaignIds.push(campaign.id);
      } else {
        console.error(`Missing Gupshup settings for campaign ${campaign.id} (Tenant ${campaign.tenant_id})`);
        await supabaseAdmin
          .from('broadcast_campaigns')
          .update({ status: 'failed' })
          .eq('id', campaign.id);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully swept scheduled campaigns at ${now}`,
      triggered: triggeredCampaignIds,
    });
  } catch (error) {
    console.error('Scheduled cron sweep execution error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
