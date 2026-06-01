import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { ExecutionEventService } from '@/lib/broadcast/services/execution-event.service';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId is required' }, { status: 400 });
    }

    // Secure check: verify campaign belongs to this tenant
    const { data: campaign } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    const events = await ExecutionEventService.getTimeline(campaignId);

    return NextResponse.json({ success: true, events });
  } catch (error) {
    console.error('Timeline events fetch error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
