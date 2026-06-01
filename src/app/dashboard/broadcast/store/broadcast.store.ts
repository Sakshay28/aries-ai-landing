import { create } from 'zustand';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { 
  Template, 
  AudienceState, 
  DeliveryConfig, 
  AutomationRule, 
  VariableConfig, 
  Campaign 
} from '../types';

interface BroadcastState {
  campaignId: string | null;
  campaignName: string;
  selectedTemplate: Template | null;
  variables: Record<string, VariableConfig>;
  audience: AudienceState;
  delivery: DeliveryConfig;
  automationRules: AutomationRule[];
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  previewRecipient: 'Sakshay' | 'John' | 'Priya';
  isLoading: boolean;

  // Setters & Updaters
  setCampaignId: (id: string | null) => void;
  setCampaignName: (name: string) => void;
  selectTemplate: (template: Template | null) => void;
  setVariables: (variables: Record<string, VariableConfig>) => void;
  updateVariable: (index: string, config: Partial<VariableConfig>) => void;
  updateAudience: (audience: Partial<AudienceState>) => void;
  updateDelivery: (delivery: Partial<DeliveryConfig>) => void;
  setAutomationRules: (rules: AutomationRule[]) => void;
  updateAutomationRule: (id: string, rule: Partial<AutomationRule>) => void;
  setPreviewRecipient: (recipient: 'Sakshay' | 'John' | 'Priya') => void;
  setAutosaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
  
  // Actions
  resetBuilder: () => void;
  loadCampaign: (campaignId: string) => Promise<void>;
  saveCampaign: (supabase: any, tenantId: string, statusOverride?: string) => Promise<string | null>;
}

const DEFAULT_AUDIENCE: AudienceState = {
  type: 'all',
  tags: [],
  customFilters: [],
  retargetCampaignId: null,
  retargetCondition: 'unread',
  retargetDelayDays: 1,
};

const DEFAULT_DELIVERY: DeliveryConfig = {
  mode: 'now',
  scheduledAt: null,
  timezone: 'Asia/Kolkata',
  quietHoursEnabled: true,
  throttleRate: 300,
  advancedOpen: false,
};

const DEFAULT_AUTOMATION_RULES: AutomationRule[] = [
  { id: '1', trigger: 'stop_received', action: 'auto_optout', enabled: true },
  { id: '2', trigger: 'replied', action: 'assign_human', enabled: false },
  { id: '3', trigger: 'no_reply', action: 'send_followup', delay: 24, enabled: false },
  { id: '4', trigger: 'cta_clicked', action: 'notify_email', enabled: false },
];

export const useBroadcastStore = create<BroadcastState>((set, get) => ({
  campaignId: null,
  campaignName: '',
  selectedTemplate: null,
  variables: {},
  audience: DEFAULT_AUDIENCE,
  delivery: DEFAULT_DELIVERY,
  automationRules: DEFAULT_AUTOMATION_RULES,
  autosaveStatus: 'idle',
  previewRecipient: 'Sakshay',
  isLoading: false,

  setCampaignId: (id) => set({ campaignId: id }),
  setCampaignName: (name) => set({ campaignName: name }),
  selectTemplate: (template) => set({ selectedTemplate: template, variables: {} }),
  setVariables: (variables) => set({ variables }),
  updateVariable: (index, config) => set((state) => {
    const existing = state.variables[index] || { index, sourceType: 'crm_field' };
    return {
      variables: {
        ...state.variables,
        [index]: { ...existing, ...config } as VariableConfig
      }
    };
  }),
  updateAudience: (audienceUpdate) => set((state) => ({
    audience: { ...state.audience, ...audienceUpdate }
  })),
  updateDelivery: (deliveryUpdate) => set((state) => ({
    delivery: { ...state.delivery, ...deliveryUpdate }
  })),
  setAutomationRules: (rules) => set({ automationRules: rules }),
  updateAutomationRule: (id, ruleUpdate) => set((state) => ({
    automationRules: state.automationRules.map((r) => r.id === id ? { ...r, ...ruleUpdate } : r)
  })),
  setPreviewRecipient: (recipient) => set({ previewRecipient: recipient }),
  setAutosaveStatus: (status) => set({ autosaveStatus: status }),

  resetBuilder: () => set({
    campaignId: null,
    campaignName: '',
    selectedTemplate: null,
    variables: {},
    audience: DEFAULT_AUDIENCE,
    delivery: DEFAULT_DELIVERY,
    automationRules: DEFAULT_AUTOMATION_RULES,
    autosaveStatus: 'idle',
    previewRecipient: 'Sakshay',
    isLoading: false,
  }),

  loadCampaign: async (id) => {
    set({ isLoading: true });
    const supabase = createBrowserSupabaseClient();

    try {
      // 1. Fetch Campaign Core
      const { data: campaign, error: campaignErr } = await supabase
        .from('broadcast_campaigns')
        .select('*')
        .eq('id', id)
        .single();

      if (campaignErr) throw campaignErr;

      // Clean retarget marker from name if exists
      let cleanName = campaign.name || '';
      if (cleanName.startsWith('__retarget:')) {
        const idx = cleanName.indexOf('__:');
        if (idx !== -1) cleanName = cleanName.slice(idx + 3);
      }

      // 2. Fetch Templates to match the selected template
      let matchedTemplate: Template | null = null;
      if (campaign.template_name) {
        try {
          const res = await fetch('/api/dashboard/templates');
          const j = await res.json();
          if (j.success && Array.isArray(j.data)) {
            matchedTemplate = j.data.find((t: any) => t.name === campaign.template_name) || null;
          }
        } catch (e) {
          console.error('Failed to load template info:', e);
        }
      }

      // 3. Fetch variable mappings
      const { data: rawVariables } = await supabase
        .from('broadcast_variable_mapping')
        .select('*')
        .eq('campaign_id', id);

      const variablesMap: Record<string, VariableConfig> = {};
      if (rawVariables) {
        rawVariables.forEach((v: any) => {
          variablesMap[v.variable_key] = {
            index: v.variable_key,
            sourceType: v.source_type,
            crmField: v.crm_field || undefined,
            staticValue: v.custom_value || undefined
          };
        });
      }

      // 4. Fetch audience config
      const { data: rawAudience } = await supabase
        .from('broadcast_audiences')
        .select('*')
        .eq('campaign_id', id)
        .maybeSingle();

      const audienceState: AudienceState = rawAudience ? {
        type: rawAudience.audience_type,
        tags: rawAudience.tag_ids || [],
        customFilters: (rawAudience.filters as any)?.customFilters || [],
        retargetCampaignId: rawAudience.csv_upload_id || null, // CSV/Retarget ID mapping
        retargetCondition: (rawAudience.filters as any)?.retargetCondition || 'unread',
        retargetDelayDays: (rawAudience.filters as any)?.retargetDelayDays || 1,
      } : DEFAULT_AUDIENCE;

      // 5. Fetch delivery settings
      const { data: rawDelivery } = await supabase
        .from('broadcast_delivery_settings')
        .select('*')
        .eq('campaign_id', id)
        .maybeSingle();

      const deliveryConfig: DeliveryConfig = rawDelivery ? {
        mode: rawDelivery.send_mode as any,
        scheduledAt: campaign.scheduled_for || null,
        timezone: rawDelivery.timezone || 'Asia/Kolkata',
        quietHoursEnabled: rawDelivery.quiet_hours,
        throttleRate: rawDelivery.throttle_per_minute || 300,
        advancedOpen: false,
      } : {
        ...DEFAULT_DELIVERY,
        scheduledAt: campaign.scheduled_for || null,
      };

      // 6. Fetch automation rules
      const { data: rawAutomation } = await supabase
        .from('broadcast_automation_rules')
        .select('*')
        .eq('campaign_id', id);

      const automationRulesList: AutomationRule[] = rawAutomation && rawAutomation.length > 0 
        ? rawAutomation.map((r: any) => ({
            id: r.id,
            trigger: r.trigger_type,
            action: r.action_type,
            delay: r.delay_minutes || undefined,
            enabled: r.enabled
          }))
        : DEFAULT_AUTOMATION_RULES;

      set({
        campaignId: id,
        campaignName: cleanName,
        selectedTemplate: matchedTemplate,
        variables: variablesMap,
        audience: audienceState,
        delivery: deliveryConfig,
        automationRules: automationRulesList,
        isLoading: false
      });

    } catch (e) {
      console.error('Failed to load campaign data:', e);
      set({ isLoading: false });
    }
  },

  saveCampaign: async (supabase, tenantId, statusOverride) => {
    const { 
      campaignId, 
      campaignName, 
      selectedTemplate, 
      variables, 
      audience, 
      delivery, 
      automationRules 
    } = get();

    if (!campaignName.trim()) return null;

    try {
      // Determine campaign status
      let dbStatus = 'draft';
      if (statusOverride) {
        dbStatus = statusOverride;
      } else if (delivery.mode === 'scheduled' && delivery.scheduledAt) {
        dbStatus = 'scheduled';
      }

      const campaignPayload = {
        tenant_id: tenantId,
        name: campaignName,
        template_name: selectedTemplate?.name || '',
        template_category: selectedTemplate?.category || 'MARKETING',
        delivery_mode: delivery.mode,
        scheduled_for: delivery.scheduledAt ? new Date(delivery.scheduledAt).toISOString() : null,
        status: dbStatus,
        updated_at: new Date().toISOString()
      };

      let activeId = campaignId;

      // 1. Insert or Update core campaign
      if (activeId) {
        const { error } = await supabase
          .from('broadcast_campaigns')
          .update(campaignPayload)
          .eq('id', activeId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('broadcast_campaigns')
          .insert({
            ...campaignPayload,
            created_at: new Date().toISOString()
          })
          .select('id')
          .single();
        if (error) throw error;
        activeId = data.id;
        set({ campaignId: activeId });
      }

      if (!activeId) return null;

      // 2. Save variables mapping in transaction/batch
      // First delete existing variables for this campaign to avoid conflicts
      await supabase
        .from('broadcast_variable_mapping')
        .delete()
        .eq('campaign_id', activeId);

      const variablesPayload = Object.values(variables).map(v => ({
        tenant_id: tenantId,
        campaign_id: activeId,
        variable_key: v.index,
        source_type: v.sourceType,
        crm_field: v.crmField || null,
        custom_value: v.staticValue || null
      }));

      if (variablesPayload.length > 0) {
        const { error: varErr } = await supabase
          .from('broadcast_variable_mapping')
          .insert(variablesPayload);
        if (varErr) throw varErr;
      }

      // 3. Save audience targeting option
      const audiencePayload = {
        tenant_id: tenantId,
        campaign_id: activeId,
        audience_type: audience.type,
        contact_count: 0, // Calculated dynamically by background job
        tag_ids: audience.tags,
        csv_upload_id: audience.type === 'csv' || audience.type === 'retarget' ? audience.retargetCampaignId : null,
        filters: {
          customFilters: audience.customFilters,
          retargetCondition: audience.retargetCondition,
          retargetDelayDays: audience.retargetDelayDays,
        }
      };

      const { error: audErr } = await supabase
        .from('broadcast_audiences')
        .upsert(audiencePayload, { onConflict: 'campaign_id' });
      if (audErr) throw audErr;

      // 4. Save detailed delivery and compliance settings
      const deliveryPayload = {
        tenant_id: tenantId,
        campaign_id: activeId,
        send_mode: delivery.mode,
        throttle_per_minute: delivery.throttleRate,
        quiet_hours: delivery.quietHoursEnabled,
        business_hours: false,
        timezone: delivery.timezone,
        retry_failed: true,
        pause_on_failure: true
      };

      const { error: delErr } = await supabase
        .from('broadcast_delivery_settings')
        .upsert(deliveryPayload, { onConflict: 'campaign_id' });
      if (delErr) throw delErr;

      // 5. Save automation follow-up rules
      await supabase
        .from('broadcast_automation_rules')
        .delete()
        .eq('campaign_id', activeId);

      const automationRulesPayload = automationRules.map(r => ({
        tenant_id: tenantId,
        campaign_id: activeId,
        trigger_type: r.trigger,
        action_type: r.action,
        delay_minutes: r.delay || 0,
        enabled: r.enabled
      }));

      if (automationRulesPayload.length > 0) {
        const { error: autoErr } = await supabase
          .from('broadcast_automation_rules')
          .insert(automationRulesPayload);
        if (autoErr) throw autoErr;
      }

      return activeId;

    } catch (e) {
      console.error('Failed to save campaign:', e);
      return null;
    }
  }
}));
