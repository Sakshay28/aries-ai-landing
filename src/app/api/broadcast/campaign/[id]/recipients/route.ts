import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const campaignId = params.id;

    // Fetch queue items for this campaign
    const { data: queueItems, error: queueErr } = await supabaseAdmin
      .from('broadcast_queue')
      .select('id, phone, payload, status, failure_reason, processed_at, contact_id')
      .eq('tenant_id', tenantId)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
      .limit(5000);

    if (queueErr) {
      return NextResponse.json({ success: false, message: queueErr.message }, { status: 500 });
    }

    // Fetch delivery receipts
    const { data: deliveries } = await supabaseAdmin
      .from('broadcast_deliveries')
      .select('phone, status, delivered_at, read_at, failed_reason')
      .eq('tenant_id', tenantId)
      .eq('campaign_id', campaignId);

    const deliveryMap = new Map<string, any>();
    deliveries?.forEach((d) => {
      deliveryMap.set(d.phone, d);
    });

    // Merge status: delivery receipt status (read > delivered > sent > failed) takes precedence
    const recipientList = (queueItems || []).map((q) => {
      const delivery = deliveryMap.get(q.phone);
      const name = q.payload?.name || null;
      const status = delivery?.status || q.status;

      return {
        id: q.id,
        phone: q.phone,
        name: name && name !== 'there' ? name : null,
        status, // 'read' | 'delivered' | 'sent' | 'failed' | 'cancelled' | 'pending'
        delivered_at: delivery?.delivered_at || null,
        read_at: delivery?.read_at || null,
        failure_reason: delivery?.failed_reason || q.failure_reason || null,
        processed_at: q.processed_at,
      };
    });

    return NextResponse.json({
      success: true,
      data: recipientList,
      totalCount: recipientList.length,
    });
  } catch (err: any) {
    console.error('[campaign recipients route] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
