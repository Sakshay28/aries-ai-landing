import { supabaseAdmin } from '@/lib/supabase/admin';

export interface ExecutionEvent {
  id: string;
  tenant_id: string;
  campaign_id: string;
  event_type: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  metadata: Record<string, any>;
  created_by?: string | null;
  created_at: string;
}

export class ExecutionEventService {
  /**
   * Logs a campaign execution event to the database for realtime operator observability.
   */
  static async logEvent(
    tenantId: string,
    campaignId: string,
    eventType: string,
    title: string,
    description: string,
    severity: 'info' | 'warning' | 'error' | 'success' = 'info',
    metadata: Record<string, any> = {},
    createdBy: string | null = null
  ): Promise<ExecutionEvent | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('broadcast_execution_events')
        .insert({
          tenant_id: tenantId,
          campaign_id: campaignId,
          event_type: eventType,
          title,
          description,
          severity,
          metadata,
          created_by: createdBy
        })
        .select('*')
        .single();

      if (error) throw error;
      console.log(`📡 [timeline] Logged event "${eventType}" for campaign ${campaignId}`);
      return data;
    } catch (err) {
      console.error('❌ Failed to log execution event:', err);
      return null;
    }
  }

  /**
   * Like logEvent, but suppresses duplicates: if an event of the same type for
   * the same campaign already exists within `windowMs`, nothing is inserted.
   *
   * For states that are re-evaluated on every cron tick — e.g. a quiet-hours hold
   * that re-fires every 10 minutes until 9 AM — this keeps the timeline to ONE
   * entry per hold instead of one per tick. `windowMs` should comfortably exceed
   * the state's duration (the 9 PM–9 AM quiet window is at most 12h).
   */
  static async logEventOnce(
    tenantId: string,
    campaignId: string,
    eventType: string,
    title: string,
    description: string,
    severity: 'info' | 'warning' | 'error' | 'success' = 'info',
    windowMs: number = 12 * 60 * 60 * 1000,
    metadata: Record<string, any> = {}
  ): Promise<ExecutionEvent | null> {
    try {
      const since = new Date(Date.now() - windowMs).toISOString();
      const { data: existing } = await supabaseAdmin
        .from('broadcast_execution_events')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('event_type', eventType)
        .gte('created_at', since)
        .limit(1)
        .maybeSingle();
      if (existing) return null;
    } catch {
      // If the existence check itself fails, fall through and log — a rare
      // duplicate is strictly better than a silently missing timeline entry.
    }
    return this.logEvent(tenantId, campaignId, eventType, title, description, severity, metadata);
  }

  /**
   * Fetches the complete chronological history of events for a specific campaign.
   */
  static async getTimeline(campaignId: string): Promise<ExecutionEvent[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('broadcast_execution_events')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('❌ Failed to fetch execution timeline:', err);
      return [];
    }
  }

  /**
   * Opens a realtime Supabase socket channel to stream incoming timeline events live to the UI.
   */
  static streamTimeline(
    campaignId: string,
    onEvent: (event: ExecutionEvent) => void
  ) {
    const channelName = `timeline:${campaignId}:${Date.now()}`;
    return supabaseAdmin
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'broadcast_execution_events',
          filter: `campaign_id=eq.${campaignId}`
        },
        (payload) => {
          onEvent(payload.new as ExecutionEvent);
        }
      )
      .subscribe();
  }
}
