import { supabaseAdmin } from '@/lib/supabase/admin';

export interface AuditLog {
  id: string;
  tenant_id: string;
  campaign_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  before_state: Record<string, any>;
  after_state: Record<string, any>;
  created_at: string;
}

export class AuditLogService {
  /**
   * Tracks a meaningful delta log for campaigns, configurations, templates, or delivery changes.
   */
  static async logChange(
    tenantId: string,
    campaignId: string | null,
    actorId: string | null,
    action: string,
    entityType: string,
    before: Record<string, any>,
    after: Record<string, any>
  ): Promise<AuditLog | null> {
    try {
      // 1. Compute human-readable differentials
      const beforeStateClean: Record<string, any> = {};
      const afterStateClean: Record<string, any> = {};

      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
      
      allKeys.forEach((key) => {
        // Exclude system fields or metadata keys that shouldn't bloat operator eyes
        if (['id', 'tenant_id', 'created_at', 'updated_at', 'deleted_at', 'synced_at'].includes(key)) {
          return;
        }

        const valBefore = before[key];
        const valAfter = after[key];

        // Evaluate diff
        if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
          beforeStateClean[key] = valBefore === undefined ? null : valBefore;
          afterStateClean[key] = valAfter === undefined ? null : valAfter;
        }
      });

      // Avoid inserting empty log if no actual change exists
      if (Object.keys(afterStateClean).length === 0 && Object.keys(beforeStateClean).length === 0 && action === 'edit') {
        return null; 
      }

      const { data, error } = await supabaseAdmin
        .from('broadcast_audit_logs')
        .insert({
          tenant_id: tenantId,
          campaign_id: campaignId,
          actor_user_id: actorId,
          action,
          entity_type: entityType,
          before_state: beforeStateClean,
          after_state: afterStateClean
        })
        .select('*')
        .single();

      if (error) throw error;
      console.log(`🔒 [audit] Logged action "${action}" on ${entityType} for campaign ${campaignId}`);
      return data;
    } catch (err) {
      console.error('❌ Failed to create audit log:', err);
      return null;
    }
  }

  /**
   * Retrieves the recent audit log activities for a specific campaign.
   */
  static async getAuditLogs(campaignId: string): Promise<AuditLog[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('broadcast_audit_logs')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('❌ Failed to fetch campaign audit logs:', err);
      return [];
    }
  }
}
