import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  buildFunnel,
  summarizeFailures,
  computeReadLatency,
  type CampaignInsights,
} from '@/lib/broadcast/services/campaign-insights.service';

export const dynamic = 'force-dynamic';

// Safety cap on per-row scans. Restaurant broadcast lists are small (hundreds),
// but this bounds the query for any outlier campaign so the endpoint can never
// pull an unbounded result set. Latency stats become a sample beyond this.
const ROW_SCAN_CAP = 20000;

/**
 * GET /api/broadcast/campaign/[id]/insights
 * Returns the delivery funnel, normalized failure breakdown, and speed-to-read
 * stats for a single campaign. All aggregation math lives in the pure,
 * unit-tested campaign-insights.service; this route only fetches + delegates.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: campaignId } = await context.params;

    // Ownership check — never leak another tenant's campaign insights.
    const { data: campaign, error: campaignErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('id, sent_count')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (campaignErr || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    const [analyticsRes, deliveriesRes, queueFailuresRes] = await Promise.all([
      // Reconciled cumulative counts (delivered/read/failed) — the webhook writes these.
      supabaseAdmin
        .from('broadcast_analytics')
        .select('delivered_count, read_count, failed_count')
        .eq('campaign_id', campaignId)
        .maybeSingle(),
      // Per-message rows: timestamps for read latency + post-send failure reasons.
      supabaseAdmin
        .from('broadcast_deliveries')
        .select('status, delivered_at, read_at, failed_reason')
        .eq('campaign_id', campaignId)
        .eq('tenant_id', tenantId)
        .limit(ROW_SCAN_CAP),
      // Send-time failures never get a wamid, so they only exist on the queue.
      supabaseAdmin
        .from('broadcast_queue')
        .select('failure_reason')
        .eq('campaign_id', campaignId)
        .eq('tenant_id', tenantId)
        .eq('status', 'failed')
        .limit(ROW_SCAN_CAP),
    ]);

    const analytics = analyticsRes.data;
    const deliveries = deliveriesRes.data || [];
    const queueFailures = queueFailuresRes.data || [];

    const sent = campaign.sent_count || 0;

    // ── Funnel ──
    const funnel = buildFunnel({
      sent,
      delivered: analytics?.delivered_count ?? 0,
      read: analytics?.read_count ?? 0,
      failed: analytics?.failed_count ?? 0,
    });

    // ── Failures ──
    // Two disjoint sources: queue rows (send-time, no wamid) and delivery rows
    // that Meta later reported failed (had a wamid). A message is in exactly one
    // set, so merging the raw reasons cannot double-count.
    const rawFailureReasons: (string | null)[] = [
      ...queueFailures.map((q) => q.failure_reason),
      ...deliveries.filter((d) => d.status === 'failed').map((d) => d.failed_reason),
    ];
    const failures = summarizeFailures(rawFailureReasons);

    // ── Speed to read ──
    const readLatency = computeReadLatency(
      deliveries.map((d) => ({ deliveredAt: d.delivered_at, readAt: d.read_at }))
    );

    const insights: CampaignInsights = { funnel, failures, readLatency };

    return NextResponse.json({ success: true, insights });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('[broadcast] [insights] GET API Exception:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
