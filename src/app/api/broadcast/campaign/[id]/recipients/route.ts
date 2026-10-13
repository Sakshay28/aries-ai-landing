import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { cleanContactName } from '@/lib/broadcast/recipient-name';
import { selectInBatches } from '@/lib/supabase/select-in-batches';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id: campaignId } = await params;

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
      .select('phone, status, delivered_at, read_at, failed_reason, contact_id')
      .eq('tenant_id', tenantId)
      .eq('campaign_id', campaignId);

    // Fetch lead names for contacts missing payload names
    const missingNameContactIds = (queueItems || [])
      .filter((q) => !q.payload?.name && q.contact_id)
      .map((q) => q.contact_id) as string[];
    
    const leadNameMap = new Map<string, string>();
    if (missingNameContactIds.length > 0) {
      const uniqueIds = Array.from(new Set(missingNameContactIds));
      const leads = await selectInBatches<{ id: string; name: string | null }>(
        uniqueIds,
        (batch) =>
          supabaseAdmin
            .from('leads')
            .select('id, name')
            .in('id', batch)
      );
      leads?.forEach((l) => {
        if (l.name) leadNameMap.set(l.id, l.name);
      });
    }

    const statusRank: Record<string, number> = { read: 4, delivered: 3, failed: 2, sent: 1 };
    const deliveryMap = new Map<string, any>();
    deliveries?.forEach((d) => {
      const existing = deliveryMap.get(d.phone);
      if (!existing || (statusRank[d.status] || 0) >= (statusRank[existing.status] || 0)) {
        deliveryMap.set(d.phone, d);
      }
    });

    const seenPhones = new Set<string>();

    // Merge status: delivery receipt status (read > delivered > sent > failed) takes precedence
    const recipientList = (queueItems || []).map((q) => {
      seenPhones.add(q.phone);
      const delivery = deliveryMap.get(q.phone);
      const rawName = q.payload?.name || (q.contact_id ? leadNameMap.get(q.contact_id) : null);
      const name = cleanContactName(rawName);
      const status = delivery?.status || q.status;

      return {
        id: q.id,
        phone: q.phone,
        name,
        status, // 'read' | 'delivered' | 'sent' | 'failed' | 'cancelled' | 'pending'
        delivered_at: delivery?.delivered_at || null,
        read_at: delivery?.read_at || null,
        failure_reason: delivery?.failed_reason || q.failure_reason || null,
        processed_at: q.processed_at,
      };
    });

    // Append any delivery receipts not present in queueItems
    deliveries?.forEach((d) => {
      if (!seenPhones.has(d.phone)) {
        seenPhones.add(d.phone);
        recipientList.push({
          id: `deliv-${d.phone}`,
          phone: d.phone,
          name: null,
          status: d.status,
          delivered_at: d.delivered_at || null,
          read_at: d.read_at || null,
          failure_reason: d.failed_reason || null,
          processed_at: d.delivered_at || null,
        });
      }
    });

    // Priority sort: read (1), delivered (2), sent (3), failed (4), cancelled (5), pending (6)
    const priorityMap: Record<string, number> = {
      read: 1,
      delivered: 2,
      sent: 3,
      failed: 4,
      cancelled: 5,
      pending: 6,
    };

    recipientList.sort((a, b) => {
      const pa = priorityMap[a.status] || 99;
      const pb = priorityMap[b.status] || 99;
      if (pa !== pb) return pa - pb;
      const ta = a.read_at || a.delivered_at || a.processed_at || '';
      const tb = b.read_at || b.delivered_at || b.processed_at || '';
      return tb.localeCompare(ta);
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
