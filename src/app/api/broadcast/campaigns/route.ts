import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    let query = supabaseAdmin
      .from('broadcast_campaigns')
      .select(`
        id,
        name,
        status,
        template_name,
        delivery_mode,
        scheduled_at,
        scheduled_for,
        sent_at,
        audience_count,
        recipient_count,
        sent_count,
        delivered_count,
        read_count,
        failed_count,
        completed_at,
        created_at,
        updated_at
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      console.error('[broadcast] [campaigns] Database error fetching campaigns:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const hasMore = (campaigns || []).length > limit;
    const page = hasMore ? (campaigns || []).slice(0, limit) : (campaigns || []);
    const nextCursor = hasMore ? page[page.length - 1]?.created_at : null;

    // Delivered / read / failed counts are the SOURCE-OF-TRUTH in broadcast_analytics,
    // which the Meta status webhook increments via increment_broadcast_analytics().
    // The like-named columns on broadcast_campaigns are legacy and never advance past
    // 0, so reading them made every campaign show "Delivered 0 / Read 0" even when the
    // delivery receipts had reconciled fine. Overlay the analytics row here. `sent_count`
    // stays sourced from broadcast_campaigns (its real counter; broadcast_analytics.sent_count
    // is never written).
    const analyticsByCampaign = new Map<string, { delivered_count: number; read_count: number; failed_count: number }>();
    if (page.length > 0) {
      const { data: analyticsRows } = await supabaseAdmin
        .from('broadcast_analytics')
        .select('campaign_id, delivered_count, read_count, failed_count')
        .in('campaign_id', page.map((c) => c.id));
      for (const row of analyticsRows || []) {
        analyticsByCampaign.set(row.campaign_id, {
          delivered_count: row.delivered_count || 0,
          read_count: row.read_count || 0,
          failed_count: row.failed_count || 0,
        });
      }
    }

    const formattedCampaigns = page.map((camp) => {
      const a = analyticsByCampaign.get(camp.id);
      return {
        ...camp,
        // Prefer the reconciled analytics counts; fall back to the legacy column only
        // when no analytics row exists yet (e.g. a brand-new campaign mid-send).
        delivered_count: a ? a.delivered_count : (camp.delivered_count || 0),
        read_count:      a ? a.read_count      : (camp.read_count || 0),
        failed_count:    a ? a.failed_count    : (camp.failed_count || 0),
        total_recipients: camp.audience_count || camp.recipient_count || 0,
      };
    });

    return NextResponse.json({ success: true, campaigns: formattedCampaigns, nextCursor });

  } catch (error: any) {
    console.error('[broadcast] [campaigns] GET API Exception:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
