import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';
import { after } from 'next/server';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: campaignId } = await params;

    // Verify campaign belongs to this tenant
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('id, status, total_recipients')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (campErr || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    if (!['sending', 'draft'].includes(campaign.status)) {
      return NextResponse.json({
        success: false,
        error: `Campaign is ${campaign.status} — only sending/draft campaigns can be retried`,
      }, { status: 400 });
    }

    // Count pending items for this campaign
    const { count } = await supabaseAdmin
      .from('broadcast_queue')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'retrying']);

    after(async () => {
      try {
        await BroadcastEngineService.processQueue(100, true);
      } catch (e) {
        console.error('[RETRY_NOW] processQueue failed:', e);
      }
    });

    return NextResponse.json({
      success: true,
      pendingCount: count ?? 0,
      message: 'Processing started — refresh the stats page in 10 seconds.',
    });

  } catch (error: any) {
    console.error('[RETRY_NOW] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
