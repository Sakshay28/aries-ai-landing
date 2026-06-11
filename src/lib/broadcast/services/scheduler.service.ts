import { supabaseAdmin } from '@/lib/supabase/admin';
import { BroadcastEngineService } from './broadcast-engine.service';

export class SchedulerService {
  /**
   * Scans the database for scheduled broadcast campaigns that are due now
   * and triggers their queue populating launch process.
   */
  static async checkAndDispatchScheduled(): Promise<number> {
    let triggered = 0;
    try {
      const now = new Date().toISOString();

      // Fetch campaigns that are scheduled and scheduled_for is in the past/now
      const { data: campaigns, error } = await supabaseAdmin
        .from('broadcast_campaigns')
        .select('*')
        .eq('status', 'scheduled')
        .lte('scheduled_for', now);

      if (error) throw error;
      if (!campaigns || campaigns.length === 0) return 0;

      for (const campaign of campaigns) {
        console.log(`⏰ Scheduler: dispatching campaign ${campaign.name} (${campaign.id})`);

        // Atomically claim this campaign so a parallel scheduler tick can't double-dispatch.
        // Use a CAS (compare-and-swap): only update if status is still 'scheduled'.
        const { data: claimed, error: claimErr } = await supabaseAdmin
          .from('broadcast_campaigns')
          .update({ status: 'launching', updated_at: now })
          .eq('id', campaign.id)
          .eq('status', 'scheduled')
          .select('id')
          .maybeSingle();

        if (claimErr || !claimed) {
          console.warn(`⏰ Scheduler: campaign ${campaign.id} already claimed or gone — skipping`);
          continue;
        }

        // launchCampaign checks for 'draft' or 'scheduled' — patch it to also accept 'launching'
        const res = await BroadcastEngineService.launchCampaign(campaign.tenant_id, campaign.id);

        if (res.success) {
          triggered++;
        } else {
          console.error(`❌ Scheduler: failed to launch campaign ${campaign.id}:`, res.error);

          await supabaseAdmin
            .from('broadcast_campaigns')
            .update({ status: 'failed', updated_at: now })
            .eq('id', campaign.id);
        }
      }

    } catch (e) {
      console.error('❌ Scheduler cron execution failed:', e);
    }
    return triggered;
  }
}
