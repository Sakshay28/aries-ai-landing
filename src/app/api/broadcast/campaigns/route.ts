import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: campaigns, error } = await supabaseAdmin
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
      .limit(50);

    if (error) {
      console.error('[broadcast] [campaigns] Database error fetching campaigns:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Map fields for frontend compatibility (e.g. audience_count to total_recipients if needed)
    const formattedCampaigns = (campaigns || []).map((camp) => ({
      ...camp,
      total_recipients: camp.audience_count || camp.recipient_count || 0,
    }));

    return NextResponse.json({ success: true, campaigns: formattedCampaigns });

  } catch (error: any) {
    console.error('[broadcast] [campaigns] GET API Exception:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
