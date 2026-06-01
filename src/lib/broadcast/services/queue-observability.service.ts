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
    try {
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

      // 3. Resolve active pacing settings to calculate throughput
      const { data: settings } = await supabaseAdmin
        .from('broadcast_delivery_settings')
        .select('throttle_per_minute')
        .eq('campaign_id', campaignId)
        .single();

      const throttleRate = settings?.throttle_per_minute || 300; // default 5 msgs/sec (300/min)
      
      const totalRecipientCount = queuedCount + processingCount + retryingCount + sentCount + failedCount;
      const remainingCount = queuedCount + processingCount + retryingCount;

      // Dynamic ETA and Throughput calculations
      const throughputPerMin = throttleRate;
      const etaSecondsRemaining = this.calculateETA(remainingCount, throttleRate);

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
    } catch (err) {
      console.error('❌ Failed to compute live queue observability stats:', err);
      return {
        queuedCount: 0,
        processingCount: 0,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        retryingCount: 0,
        failedCount: 0,
        totalRecipientCount: 0,
        throughputPerMin: 0,
        etaSecondsRemaining: 0
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
