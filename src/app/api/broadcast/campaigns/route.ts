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

    const formattedCampaigns = page.map((camp) => ({
      ...camp,
      total_recipients: camp.audience_count || camp.recipient_count || 0,
    }));

    return NextResponse.json({ success: true, campaigns: formattedCampaigns, nextCursor });

  } catch (error: any) {
    console.error('[broadcast] [campaigns] GET API Exception:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
