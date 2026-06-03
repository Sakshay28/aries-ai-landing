import { NextRequest, NextResponse, after } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const maxDuration = 10;

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

    const { count } = await supabaseAdmin
      .from('broadcast_queue')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'retrying']);

    // Delegate to the self-chaining process-queue endpoint so large retries
    // don't blow the 10s function timeout.
    after(async () => {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
      const cronSecret = process.env.CRON_SECRET;
      if (!appUrl || !cronSecret) return;
      try {
        await fetch(`${appUrl}/api/broadcast/process-queue`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cronSecret}` },
        });
      } catch (e) {
        console.error('[RETRY_NOW] Failed to trigger process-queue:', e);
      }
    });

    return NextResponse.json({
      success: true,
      pendingCount: count ?? 0,
      message: 'Processing started — refresh stats in 30 seconds.',
    });

  } catch (error: any) {
    console.error('[RETRY_NOW] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
