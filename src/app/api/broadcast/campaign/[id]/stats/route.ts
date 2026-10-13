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

    const [
      pending,
      processing,
      retrying,
      queueSent,
      queueFailedRaw,
      queueCancelled,
      deliveriesDelivered,
      deliveriesRead,
      deliveriesFailed,
      deliveriesSentOnly,
      analyticsRes
    ] = await Promise.all([
      getCount('broadcast_queue', 'pending'),
      getCount('broadcast_queue', 'processing'),
      getCount('broadcast_queue', 'retrying'),
      getCount('broadcast_queue', 'sent'),
      getCount('broadcast_queue', 'failed'),
      getCount('broadcast_queue', 'cancelled'),
      getCount('broadcast_deliveries', 'delivered'),
      getCount('broadcast_deliveries', 'read'),
      getCount('broadcast_deliveries', 'failed'),
      getCount('broadcast_deliveries', 'sent'),
      supabaseAdmin
        .from('broadcast_analytics')
        .select('delivered_count, read_count, failed_count')
        .eq('campaign_id', campaignId)
        .maybeSingle(),
    ]);

    const analytics = analyticsRes.data;

    const totalRecipients = campaign.total_recipients || campaign.audience_count || campaign.recipient_count || 0;
    const queued = processing + retrying;

    // Delivery rows are authoritative per-wamid state:
    // A message with status='read' was delivered first, so delivered total = delivered + read
    const deliveriesDeliveredTotal = deliveriesDelivered + deliveriesRead;
    const totalDeliveriesRecorded = deliveriesDeliveredTotal + deliveriesFailed + deliveriesSentOnly;

    const queueFailed = queueFailedRaw + queueCancelled;
    const sent = Math.max(queueSent, totalDeliveriesRecorded, campaign.sent_count || 0);

    // Reconcile delivered and read, strictly clamping to sent
    const rawDeliv = Math.max(deliveriesDeliveredTotal, analytics?.delivered_count ?? 0, campaign.delivered_count ?? 0);
    const deliv = sent > 0 ? Math.min(sent, rawDeliv) : rawDeliv;

    const rawRead = Math.max(deliveriesRead, analytics?.read_count ?? 0, campaign.read_count ?? 0);
    const readCnt = deliv > 0 ? Math.min(deliv, rawRead) : 0;

    const failed = Math.max(queueFailed, deliveriesFailed, analytics?.failed_count ?? 0, campaign.failed_count ?? 0);

    const deliveryRate = sent > 0 ? Math.round((deliv / sent) * 100) : 0;
    const readRate     = sent > 0 ? Math.round((readCnt / sent) * 100) : 0;

    return NextResponse.json({
      success: true,
      campaignId:     campaign.id,
      campaignName:   campaign.name,
      status:         campaign.status,
      totalRecipients,
      pending,
      queued,
      sent,
      delivered:      deliv,
      read:           readCnt,
      failed,
      deliveryRate,
      readRate,
    });

  } catch (error: any) {
    console.error('[broadcast] [stats] stats GET API Exception:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
