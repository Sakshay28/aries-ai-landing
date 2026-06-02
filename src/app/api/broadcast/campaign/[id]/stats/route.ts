import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Resolve Auth
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: campaignId } = await context.params;

    // 2. Fetch Campaign
    const { data: campaign, error: campaignErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (campaignErr || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    // 3. Aggregate real-time counts from queue and deliveries
    const getCount = async (table: string, status: string) => {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', status);
      return error ? 0 : (count || 0);
    };

    const [pending, processing, retrying, sent, delivered, read, failed] = await Promise.all([
      getCount('broadcast_queue', 'pending'),
      getCount('broadcast_queue', 'processing'),
      getCount('broadcast_queue', 'retrying'),
      getCount('broadcast_deliveries', 'sent'),
      getCount('broadcast_deliveries', 'delivered'),
      getCount('broadcast_deliveries', 'read'),
      getCount('broadcast_deliveries', 'failed'),
    ]);

    const totalRecipients = campaign.audience_count || campaign.recipient_count || 0;
    const queued = processing + retrying;

    // Calculate delivery and read rates based on total enqueued/sent
    const deliveryRate = totalRecipients > 0
      ? Math.round((delivered / totalRecipients) * 100)
      : 0;

    const readRate = totalRecipients > 0
      ? Math.round((read / totalRecipients) * 100)
      : 0;

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      status: campaign.status,
      totalRecipients,
      pending,
      queued,
      sent,
      delivered,
      read,
      failed,
      deliveryRate,
      readRate
    });

  } catch (error: any) {
    console.error('[broadcast] [stats] stats GET API Exception:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
