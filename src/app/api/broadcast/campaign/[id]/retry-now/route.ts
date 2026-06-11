import { NextRequest, NextResponse, after } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';

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

    if (!['sending', 'draft', 'paused'].includes(campaign.status)) {
      return NextResponse.json({
        success: false,
        error: `Campaign is ${campaign.status} — only sending/draft/paused campaigns can be retried`,
      }, { status: 400 });
    }

    // Resume paused campaigns back to 'sending'
    if (campaign.status === 'paused') {
      await supabaseAdmin
        .from('broadcast_campaigns')
        .update({ status: 'sending', updated_at: new Date().toISOString() })
        .eq('id', campaignId)
        .eq('tenant_id', tenantId);
    }

    const { count } = await supabaseAdmin
      .from('broadcast_queue')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'retrying']);

    // Reset any items stuck with a future next_attempt_at so they're picked up NOW.
    await supabaseAdmin
      .from('broadcast_queue')
      .update({ next_attempt_at: null, status: 'pending', locked_at: null })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'retrying', 'processing'])
      .not('next_attempt_at', 'is', null)
      .gt('next_attempt_at', new Date().toISOString());

    // Process directly in after() — no HTTP round-trip, guaranteed to run
    // even when CRON_SECRET is not configured in Vercel.
    after(async () => {
      try {
        const processed = await BroadcastEngineService.processQueue(50);
        console.log(`[RETRY_NOW] Processed ${processed} items`);

        // Chain more if needed
        if (processed >= 50) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
          const cronSecret = process.env.CRON_SECRET;
          if (appUrl && cronSecret) {
            fetch(`${appUrl}/api/broadcast/process-queue`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${cronSecret}` },
            }).catch(() => {});
          }
        }
      } catch (e) {
        console.error('[RETRY_NOW] Failed to process queue:', e);
      }
    });

    return NextResponse.json({
      success: true,
      pendingCount: count ?? 0,
      message: 'Processing started — refresh in 15 seconds.',
    });

  } catch (error: any) {
    console.error('[RETRY_NOW] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
