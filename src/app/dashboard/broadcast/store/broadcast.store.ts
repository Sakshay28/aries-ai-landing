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
  saveStatus: 'idle' | 'saving' | 'saved' | 'failed';
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
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'failed') => void;
  
  // Actions
  resetBuilder: () => void;
  loadCampaign: (campaignId: string) => Promise<void>;
  saveCampaign: () => Promise<string | null>;
}

const DEFAULT_AUDIENCE: AudienceState = {
  type: 'all',
  tags: [],
  customFilters: [],
  retargetCampaignId: null,
  retargetCondition: 'unread',
  retargetDelayDays: 1,
  manualContactIds: [],
  excludedContactIds: [],
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
  saveStatus: 'idle',
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
  setSaveStatus: (status) => set({ saveStatus: status }),

  resetBuilder: () => set({
    campaignId: null,
    campaignName: '',
    selectedTemplate: null,
    variables: {},
    audience: DEFAULT_AUDIENCE,
    delivery: DEFAULT_DELIVERY,
    automationRules: DEFAULT_AUTOMATION_RULES,
    saveStatus: 'idle',
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

      const audienceState: AudienceState & { manualContactIds?: string[], excludedContactIds?: string[], csvFile?: any } = rawAudience ? {
        type: rawAudience.audience_type as any,
        tags: rawAudience.tag_ids || [],
        customFilters: (rawAudience.filters as any)?.customFilters || [],
        retargetCampaignId: rawAudience.csv_upload_id || null, // CSV/Retarget ID mapping
        retargetCondition: (rawAudience.filters as any)?.retargetCondition || 'unread',
        retargetDelayDays: (rawAudience.filters as any)?.retargetDelayDays || 1,
        manualContactIds: (rawAudience.filters as any)?.manualContactIds || [],
        excludedContactIds: (rawAudience.filters as any)?.excludedContactIds || [],
        csvFile: (rawAudience.filters as any)?.csvFile || null,
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

  saveCampaign: async () => {
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

    set({ saveStatus: 'saving' });

    try {
      const response = await fetch('/api/broadcast/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId,
          campaignName,
          templateName: selectedTemplate?.name || '',
          templateCategory: selectedTemplate?.category || 'MARKETING',
          deliveryMode: delivery.mode,
          scheduledAt: delivery.scheduledAt
            ? new Date(delivery.scheduledAt).toISOString()
            : null,
          audience,
          delivery,
          variables,
          automationRules,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      set({ 
        campaignId: data.campaignId,
        saveStatus: 'saved' 
      });

      // Auto-reset to idle after 2.5 seconds
      setTimeout(() => {
        if (get().saveStatus === 'saved') {
          set({ saveStatus: 'idle' });
        }
      }, 2500);

      return data.campaignId;
    } catch (err) {
      console.error('[saveCampaign] Failed:', err);
      set({ saveStatus: 'failed' });
      return null;
    }
  }
}));
