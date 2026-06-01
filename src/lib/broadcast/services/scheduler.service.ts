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
        
        // Transition status to sending to prevent double-scheduler triggers
        await supabaseAdmin
          .from('broadcast_campaigns')
          .update({ status: 'sending', updated_at: now })
          .eq('id', campaign.id);

        const res = await BroadcastEngineService.launchCampaign(campaign.tenant_id, campaign.id);
        
        if (res.success) {
          triggered++;
        } else {
          console.error(`❌ Scheduler: failed to launch campaign ${campaign.id}:`, res.error);
          
          // Revert to failed status
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
