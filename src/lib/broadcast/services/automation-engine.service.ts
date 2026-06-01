import { supabaseAdmin } from '@/lib/supabase/admin';
import { AutomationRule } from '@/app/dashboard/broadcast/types';

export class AutomationEngineService {
  /**
   * Executes background automation actions based on trigger criteria (e.g. STOP opt-outs).
   */
  static async triggerRule(
    tenantId: string,
    campaignId: string,
    contactId: string,
    phone: string,
    triggerType: 'replied' | 'no_reply' | 'cta_clicked' | 'stop_received' | 'failed'
  ): Promise<boolean> {
    try {
      // 1. Fetch active automation rules for this campaign matching triggerType
      const { data: rules } = await supabaseAdmin
        .from('broadcast_automation_rules')
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('trigger_type', triggerType)
        .eq('enabled', true);

      if (!rules || rules.length === 0) return false;

      for (const rule of rules) {
        console.log(`🤖 Automation Engine: firing rule ${rule.action_type} for trigger ${triggerType} on lead ${contactId}`);

        if (rule.action_type === 'auto_optout') {
          // Tag user with 'opt-out' in CRM leads list
          const { data: lead } = await supabaseAdmin
            .from('leads')
            .select('tags')
            .eq('id', contactId)
            .single();

          if (lead) {
            const currentTags = lead.tags || [];
            if (!currentTags.includes('opt-out')) {
              await supabaseAdmin
                .from('leads')
                .update({
                  tags: [...currentTags, 'opt-out'],
                  updated_at: new Date().toISOString()
                })
                .eq('id', contactId);
            }
          }

        } else if (rule.action_type === 'assign_human') {
          // Pause bot responses on conversation and escalate
          await supabaseAdmin
            .from('conversations')
            .update({
              bot_paused: true,
              escalated: true,
              escalation_reason: `Broadcast automation triggered: ${triggerType}`,
              last_message_at: new Date().toISOString()
            })
            .eq('lead_id', contactId)
            .eq('tenant_id', tenantId);

        } else if (rule.action_type === 'trigger_flow') {
          // Trigger custom conversation flow automation
          const flowId = rule.payload?.flow_id;
          if (flowId) {
            await supabaseAdmin.from('flow_executions').insert({
              tenant_id: tenantId,
              flow_id: flowId,
              contact_id: contactId,
              status: 'pending',
              created_at: new Date().toISOString()
            });
          }
        }
      }

      return true;

    } catch (e) {
      console.error('❌ Automation rule execution failed:', e);
      return false;
    }
  }
}
