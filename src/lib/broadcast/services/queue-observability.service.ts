import { supabaseAdmin } from '@/lib/supabase/admin';

export interface QueueObservabilityStats {
  queuedCount: number;
  processingCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  retryingCount: number;
  failedCount: number;
  totalRecipientCount: number;
  throughputPerMin: number;
  etaSecondsRemaining: number;
}

export class QueueObservabilityService {
  /**
   * Aggregates real-time stats from the broadcast queue and delivery states.
   */
  static async getQueueStats(campaignId: string): Promise<QueueObservabilityStats> {
    // Deliberately no top-level try/catch swallow here. A query failure used to
    // be returned as an all-zero stats object — indistinguishable from "queue
    // fully drained" — which made the frontend (QueueStatusCard) render a green
    // "Completed" badge while the campaign could still have thousands of
    // messages in flight. Let the error propagate so the API route returns a
    // real failure and the UI can show "status unavailable" instead of lying.
    {
      // 1. Fetch counts from broadcast_queue (which acts as the transient queue)
      const { data: queueData, error: qErr } = await supabaseAdmin
        .from('broadcast_queue')
        .select('status')
        .eq('campaign_id', campaignId);

      if (qErr) throw qErr;

      let queuedCount = 0;
      let processingCount = 0;
      let retryingCount = 0;

      (queueData || []).forEach(row => {
        if (row.status === 'pending') queuedCount++;
        else if (row.status === 'processing') processingCount++;
        else if (row.status === 'retrying') retryingCount++;
      });

      // 2. Fetch counts from the active campaign delivery state
      const { data: analytics, error: aErr } = await supabaseAdmin
        .from('broadcast_analytics')
        .select('*')
        .eq('campaign_id', campaignId)
        .single();

      // Fallback/Defaults if campaign has not recorded analytics yet
      const sentCount = analytics?.sent_count || 0;
      const deliveredCount = analytics?.delivered_count || 0;
      const readCount = analytics?.read_count || 0;
      const failedCount = analytics?.failed_count || 0;

      // 3. MEASURED throughput — count messages this campaign actually pushed to
      //    Meta in the trailing 60s. This replaces the old behaviour of echoing the
      //    configured throttle, which reported a rate the system could not achieve.
      let measuredPerMin = 0;
      try {
        const { data: sentLast60 } = await supabaseAdmin
          .rpc('campaign_sent_last_seconds', { p_campaign_id: campaignId, p_seconds: 60 });
        measuredPerMin = Number(sentLast60 ?? 0);
      } catch { /* RPC not yet migrated — fall back to configured rate below */ }

      const { data: settings } = await supabaseAdmin
        .from('broadcast_delivery_settings')
        .select('throttle_per_minute')
        .eq('campaign_id', campaignId)
        .single();
      const configuredRate = settings?.throttle_per_minute || 300;

      const totalRecipientCount = queuedCount + processingCount + retryingCount + sentCount + failedCount;
      const remainingCount = queuedCount + processingCount + retryingCount;

      // Prefer the live measured rate; fall back to the configured throttle only
      // when nothing has sent yet (so a just-launched campaign still shows an ETA).
      const throughputPerMin = measuredPerMin > 0
        ? measuredPerMin
        : (remainingCount > 0 ? configuredRate : 0);
      const etaSecondsRemaining = this.calculateETA(remainingCount, throughputPerMin || configuredRate);

      return {
        queuedCount,
        processingCount,
        sentCount,
        deliveredCount,
        readCount,
        retryingCount,
        failedCount,
        totalRecipientCount,
        throughputPerMin,
        etaSecondsRemaining
      };
    }
  }

  /**
   * Helper that calculates real-time ETA in seconds based on current throttle velocities.
   */
  static calculateETA(remainingCount: number, throttleRatePerMin: number): number {
    if (remainingCount <= 0) return 0;
    const ratePerSec = Math.max(0.1, throttleRatePerMin / 60);
    // Add 1.5 seconds default processing delay overhead to prevent optimistic clock ticks
    return Math.ceil(remainingCount / ratePerSec) + 1;
  }
}
