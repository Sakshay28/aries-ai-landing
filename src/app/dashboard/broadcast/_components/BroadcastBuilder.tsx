"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, Megaphone, RefreshCw, Clock, Save, Zap,
  AlertCircle, AlertTriangle, CheckCircle2, Send, ArrowLeft,
  FlaskConical, Users, X, Phone,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { TemplateSelector } from './TemplateSelector';
import { WhatsAppPreview } from './WhatsAppPreview';
import { VariableMapper } from './VariableMapper';
import { PhoneInput } from '@/components/ui/phone-input';
import { AudienceBuilder } from './AudienceBuilder';
import { DeliverySettings } from './DeliverySettings';
import { AutomationRules } from './AutomationRules';
import { CampaignReview } from './CampaignReview';
import { RecipientPreviewPanel } from './RecipientPreviewPanel';
import { RecipientDrawer } from './RecipientDrawer';
import { validateCampaignPreflight } from '../validators/broadcast.validator';
import { RecipientCacheResult } from '@/lib/broadcast/services/broadcast-recipient.service';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useUserContext } from '@/app/dashboard/_layout/DashboardLayoutClient';
import {
  Campaign, Template, VariableConfig,
  AudienceState, DeliveryConfig, AutomationRule, EstimateResult,
} from '../types';

// ── Props ──────────────────────────────────────────────────────────────────────
interface BroadcastBuilderProps {
  campaign: Campaign | null;
  allCampaigns: Campaign[];
  onClose: () => void;
  onSaved: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PREVIEW_PROFILES: Record<string, Record<string, string>> = {
  Sakshay: { '1': 'Sakshay', '2': 'SKY-2045', '3': 'Friday, 7 PM' },
  John:    { '1': 'John',    '2': 'JHN-1901', '3': 'Saturday, 11 AM' },
  Priya:   { '1': 'Priya',  '2': 'PRY-0078', '3': 'Sunday, 5 PM' },
};

const DEFAULT_AUDIENCE: AudienceState = {
  type: 'all', tags: [], customFilters: [],
  retargetCampaignId: null, retargetCondition: 'unread',
  retargetDelayDays: 1, manualContactIds: [], excludedContactIds: [],
};

const DEFAULT_DELIVERY: DeliveryConfig = {
  mode: 'now', scheduledAt: null, timezone: 'Asia/Kolkata',
  quietHoursEnabled: true, throttleRate: 300, advancedOpen: false,
};

const DEFAULT_AUTOMATION: AutomationRule[] = [
  { id: '1', trigger: 'stop_received', action: 'auto_optout',  enabled: true  },
  { id: '2', trigger: 'replied',       action: 'assign_human', enabled: false },
  { id: '3', trigger: 'no_reply',      action: 'send_followup', delay: 24, enabled: false },
];

// ── Small components ───────────────────────────────────────────────────────────
const Spinner = () => <RefreshCw className="w-3 h-3 animate-spin" />;

function AutosaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  return (
    <AnimatePresence mode="wait">
      {status !== 'idle' && (
        <motion.span
          key={status}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center gap-1.5"
        >
          {status === 'saving' && (
            <><RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" /><span className="text-[11px] text-muted-foreground">Saving…</span></>
          )}
          {status === 'saved' && (
            <span className="text-[11px] text-emerald-600 font-medium">✓ Saved</span>
          )}
          {status === 'error' && (
            <span className="text-[11px] text-red-500 font-medium">⊙ Save failed</span>
          )}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// ── Test Send Modal ────────────────────────────────────────────────────────────
function TestSendModal({
  open,
  onClose,
  onSend,
  isSending,
  templateName,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (phone: string) => void;
  isSending: boolean;
  templateName: string;
}) {
  const [phone, setPhone] = useState('');

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      toast.error('Enter a valid phone number (min 10 digits)');
      return;
    }
    onSend(cleaned);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18 }}
        className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-[400px] mx-4 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-foreground">Send Test Message</h3>
              <p className="text-[11px] text-muted-foreground">{templateName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Send to phone number
            </label>
            <PhoneInput value={phone} onChange={setPhone} autoFocus />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 text-[12.5px] font-semibold border border-border hover:bg-secondary/40 rounded-xl transition-colors text-muted-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSending || !phone.trim()}
              className="flex-1 h-9 text-[12.5px] font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition-colors flex items-center justify-center gap-1.5"
            >
              {isSending ? <><Spinner /><span>Sending…</span></> : <><Send className="w-3.5 h-3.5" /><span>Send Test</span></>}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function BroadcastBuilder({ campaign, allCampaigns, onClose, onSaved }: BroadcastBuilderProps) {
  const router   = useRouter();
  const supabase = createBrowserSupabaseClient();
  const { userName } = useUserContext();

  // ── ALL STATE IS LOCAL — no Zustand store ─────────────────────────────────
  const [campaignId,      setCampaignId]      = useState<string | null>(campaign?.id ?? null);
  const [campaignName,    setCampaignName]    = useState(campaign?.name ?? '');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variables,       setVariables]       = useState<Record<string, VariableConfig>>({});
  const [audience,        setAudience]        = useState<AudienceState>(DEFAULT_AUDIENCE);
  const [delivery,        setDelivery]        = useState<DeliveryConfig>(DEFAULT_DELIVERY);
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>(DEFAULT_AUTOMATION);
  const [previewRecipient, setPreviewRecipient] = useState<'Sakshay' | 'John' | 'Priya'>('Sakshay');

  // UI state
  const [templates,        setTemplates]        = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [totalContacts,    setTotalContacts]    = useState(0);
  const [availableTags,    setAvailableTags]    = useState<string[]>([]);
  const [saveStatus,       setSaveStatus]       = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isSaving,         setIsSaving]         = useState(false);
  const [isLaunching,      setIsLaunching]      = useState(false);
  const [isTesting,        setIsTesting]        = useState(false);
  const [showTestModal,    setShowTestModal]    = useState(false);
  const [estimate,         setEstimate]         = useState<EstimateResult>({ total: 0, excluded: 0, duplicates: 0, invalid: 0, spamRisk: 'LOW' });
  const [recipientsData,   setRecipientsData]   = useState<RecipientCacheResult>({
    totalRecipients: 0, excluded: 0, duplicatesRemoved: 0, invalidNumbers: 0, normalizationCount: 0, recipients: [],
  });
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [drawerOpen,        setDrawerOpen]        = useState(false);
  const [initializing,      setInitializing]      = useState(!campaign?.id);

  // Refs
  const autosaveTimer      = useRef<NodeJS.Timeout | null>(null);
  const variableMappingRef = useRef<HTMLDivElement>(null);

  // Always-current state snapshot for closures (avoids stale closure issues)
  const stateRef = useRef({
    campaignId, campaignName, selectedTemplate, variables, audience, delivery, automationRules,
  });
  // Keep it up to date on every render
  stateRef.current = { campaignId, campaignName, selectedTemplate, variables, audience, delivery, automationRules };

  // ── On mount ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTemplates();
    fetchContactStats();

    if (campaign?.id) {
      loadCampaignData(campaign.id);
    } else {
      createInitialDraft();
    }

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When templates load and we have a campaign, match the template
  useEffect(() => {
    if (campaign?.template_name && templates.length > 0 && !selectedTemplate) {
      const match = templates.find(t => t.name === campaign.template_name);
      if (match) setSelectedTemplate(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch('/api/dashboard/templates');
      const j   = await res.json();
      if (j.success && Array.isArray(j.data)) {
        // Only show APPROVED templates — PENDING/REJECTED templates will fail at send time
        setTemplates(j.data.filter((t: Template) => t.status === 'APPROVED'));
      }
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const fetchContactStats = async () => {
    try {
      const res  = await fetch('/api/dashboard/leads');
      const data = await res.json();
      if (data.success && Array.isArray(data.leads)) {
        setTotalContacts(data.leads.filter((l: any) => !!l.phone).length);
        const tags = new Set<string>();
        data.leads.forEach((l: any) => (l.tags || []).forEach((t: string) => tags.add(t)));
        setAvailableTags([...tags]);
      }
    } catch (err) {
      console.error('[BROADCAST_BUILDER] fetchContactStats failed:', err);
    }
  };

  // ── Create initial draft — gives us an ID immediately ─────────────────────
  const createInitialDraft = async () => {
    console.log('[BROADCAST_BUILDER] Creating initial draft');
    try {
      const res  = await fetch('/api/broadcast/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignName: 'Untitled Campaign' }),
      });
      const data = await res.json();
      if (data.campaignId) {
        setCampaignId(data.campaignId);
        if (!stateRef.current.campaignName) setCampaignName('Untitled Campaign');
        console.log('[BROADCAST_BUILDER] Draft created:', data.campaignId);
      } else {
        console.warn('[BROADCAST_BUILDER] Draft create failed:', data.error);
      }
    } catch (err) {
      console.error('[BROADCAST_BUILDER] createInitialDraft error:', err);
    } finally {
      setInitializing(false);
    }
  };

  // ── Load existing campaign ─────────────────────────────────────────────────
  const loadCampaignData = async (id: string) => {
    try {
      const [campaignRes, variablesRes, audienceRes, deliveryRes, automationRes] = await Promise.all([
        supabase.from('broadcast_campaigns').select('*').eq('id', id).single(),
        supabase.from('broadcast_variable_mapping').select('*').eq('campaign_id', id),
        supabase.from('broadcast_audiences').select('*').eq('campaign_id', id).maybeSingle(),
        supabase.from('broadcast_delivery_settings').select('*').eq('campaign_id', id).maybeSingle(),
        supabase.from('broadcast_automation_rules').select('*').eq('campaign_id', id),
      ]);

      const c = campaignRes.data;
      if (!c) return;

      let cleanName = c.name || '';
      if (cleanName.startsWith('__retarget:')) {
        const idx = cleanName.indexOf('__:');
        if (idx !== -1) cleanName = cleanName.slice(idx + 3);
      }
      setCampaignName(cleanName);
      setCampaignId(id);

      // Variables
      const varMap: Record<string, VariableConfig> = {};
      (variablesRes.data || []).forEach((v: any) => {
        varMap[v.variable_key] = {
          index: v.variable_key, sourceType: v.source_type,
          crmField: v.crm_field || undefined, staticValue: v.custom_value || undefined,
        };
      });
      setVariables(varMap);

      // Audience
      if (audienceRes.data) {
        const raw = audienceRes.data;
        setAudience({
          type: raw.audience_type as AudienceState['type'],
          tags: raw.tag_ids || [],
          customFilters: raw.filters?.customFilters || [],
          retargetCampaignId: raw.csv_upload_id || null,
          retargetCondition: raw.filters?.retargetCondition || 'unread',
          retargetDelayDays: raw.filters?.retargetDelayDays || 1,
          manualContactIds: raw.filters?.manualContactIds || [],
          excludedContactIds: raw.filters?.excludedContactIds || [],
          csvFile: raw.filters?.csvFile || null,
        });
      }

      // Delivery
      if (deliveryRes.data) {
        const d = deliveryRes.data;
        setDelivery({
          mode: d.send_mode as DeliveryConfig['mode'],
          scheduledAt: c.scheduled_for || null,
          timezone: d.timezone || 'Asia/Kolkata',
          quietHoursEnabled: d.quiet_hours !== false,
          throttleRate: d.throttle_per_minute || 300,
          advancedOpen: false,
        });
      }

      // Automation
      const rules = automationRes.data;
      if (rules && rules.length > 0) {
        setAutomationRules(rules.map((r: any) => ({
          id: r.id, trigger: r.trigger_type, action: r.action_type,
          delay: r.delay_minutes || undefined, enabled: r.enabled,
        })));
      }

      setInitializing(false);
    } catch (err) {
      console.error('[BROADCAST_BUILDER] loadCampaignData failed:', err);
      setInitializing(false);
    }
  };

  // ── Single save function — the ONLY save path ──────────────────────────────
  const save = useCallback(async (silent = false): Promise<string | null> => {
    const s = stateRef.current;
    const name = s.campaignName.trim();

    if (!name) {
      if (!silent) toast.error('Campaign name is required');
      return s.campaignId;
    }

    if (!silent) setIsSaving(true);
    setSaveStatus('saving');

    try {
      console.log('[BROADCAST_SAVE] Saving:', name, 'id:', s.campaignId);

      const res  = await fetch('/api/broadcast/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId:       s.campaignId,
          campaignName:     name,
          templateName:     s.selectedTemplate?.name,
          templateCategory: s.selectedTemplate?.category,
          templateLanguage: s.selectedTemplate?.language,
          deliveryMode:     s.delivery.mode,
          scheduledAt:      s.delivery.scheduledAt,
          audience:         s.audience,
          delivery:         s.delivery,
          variables:        s.variables,
          automationRules:  s.automationRules,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.campaignId) {
        throw new Error(data.error || `Save failed (HTTP ${res.status})`);
      }

      setCampaignId(data.campaignId);
      setSaveStatus('saved');
      console.log('[BROADCAST_SAVE] Success:', data.campaignId);
      setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 2500);
      return data.campaignId;

    } catch (err: any) {
      console.error('[BROADCAST_SAVE] Failed:', err.message);
      setSaveStatus('error');
      if (!silent) toast.error(err.message || 'Failed to save campaign');
      return stateRef.current.campaignId;
    } finally {
      if (!silent) setIsSaving(false);
    }
  }, []);

  // ── Autosave — debounced, only fires when we have an ID ──────────────────
  const scheduleAutosave = useCallback(() => {
    if (!stateRef.current.campaignId) return;
    if (!stateRef.current.campaignName.trim()) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => save(true), 1500);
  }, [save]);

  // Trigger autosave on meaningful field changes
  useEffect(() => {
    if (campaignId) scheduleAutosave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignName, selectedTemplate?.name, audience.type, delivery.mode, delivery.scheduledAt]);

  // ── Test send ──────────────────────────────────────────────────────────────
  const handleTestSend = () => {
    if (!selectedTemplate) {
      toast.error('Please select a template first');
      return;
    }
    setShowTestModal(true);
  };

  const executeTestSend = async (phone: string) => {
    setIsTesting(true);
    setShowTestModal(false);

    try {
      // Save first so we always have a campaignId
      const savedId = await save(true);

      console.log('[BROADCAST_TEST] Sending to:', phone, 'campaignId:', savedId);

      if (savedId) {
        // Use the production test route (campaignId + phone)
        const res  = await fetch('/api/broadcast/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: savedId, phoneNumber: phone }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success(`✓ Test message sent to ${phone}`);
        } else {
          throw new Error(data.error || 'Test send failed');
        }
      } else {
        // Fallback: direct template send without campaign
        const res  = await fetch('/api/broadcasts/test-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateName: selectedTemplate!.name,
            languageCode: selectedTemplate!.language || 'en',
            variables: previewValues,
            phoneNumber: phone,
          }),
        });
        const data = await res.json();
        if (data.success) {
          toast.success(`✓ Test message sent to ${phone}`);
        } else {
          throw new Error(data.error || 'Test send failed');
        }
      }
    } catch (err: any) {
      console.error('[BROADCAST_TEST] Failed:', err.message);
      const msg = err.message || 'Test send failed';
      if (msg.includes('credentials') || msg.includes('access_token') || msg.includes('WhatsApp')) {
        toast.error('WhatsApp not connected. Go to Settings → link your Meta Business account.');
      } else {
        toast.error(msg);
      }
    } finally {
      setIsTesting(false);
    }
  };

  // ── Launch ─────────────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    if (!canLaunch) {
      toast.error(getMissingValidationMessage());
      return;
    }

    setIsLaunching(true);

    try {
      // 1. Save current state
      const savedId = await save(false);
      if (!savedId) throw new Error('Could not save campaign before launch');

      console.log('[BROADCAST_LAUNCH] Launching:', savedId);

      // 2. Call launch API
      const res  = await fetch('/api/broadcast/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: savedId }),
      });
      const data = await res.json();
      console.log('[BROADCAST_LAUNCH] Response:', data);

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Launch failed (HTTP ${res.status})`);
      }

      const count = data.totalRecipients || data.queuedCount || 0;
      toast.success(`Campaign launched to ${count} recipient${count !== 1 ? 's' : ''}!`);

      // 3. Navigate to stats only after confirmed success
      router.push(`/dashboard/broadcast/${savedId}/stats`);

    } catch (err: any) {
      console.error('[BROADCAST_LAUNCH] Failed:', err.message);
      toast.error(err.message || 'Failed to launch campaign');
    } finally {
      setIsLaunching(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const previewValues = useMemo(() => {
    const vals: Record<string, string> = { ...PREVIEW_PROFILES[previewRecipient] };
    Object.entries(variables).forEach(([idx, cfg]) => {
      if (cfg.sourceType === 'static' && cfg.staticValue) {
        vals[idx] = cfg.staticValue;
      } else if (cfg.sourceType === 'crm_field') {
        vals[idx] = PREVIEW_PROFILES[previewRecipient]?.[idx] ?? `[${cfg.crmField}]`;
      }
    });
    return vals;
  }, [variables, previewRecipient]);

  const detectedVarIndices = useMemo(() => {
    if (!selectedTemplate?.body) return [];
    return [...new Set([...selectedTemplate.body.matchAll(/{{(\d+)}}/g)].map(m => m[1]))].sort();
  }, [selectedTemplate?.body]);

  const variablesValid = useMemo(() =>
    detectedVarIndices.every(idx => {
      const cfg = variables[idx];
      if (!cfg) return false;
      if (cfg.sourceType === 'static' || cfg.sourceType === 'custom') return !!cfg.staticValue?.trim();
      if (cfg.sourceType === 'crm_field') return !!cfg.crmField;
      return false;
    }),
    [detectedVarIndices, variables],
  );

  const unmappedVariableCount = useMemo(() =>
    detectedVarIndices.filter(idx => {
      const cfg = variables[idx];
      if (!cfg) return true;
      if (cfg.sourceType === 'static' || cfg.sourceType === 'custom') return !cfg.staticValue?.trim();
      if (cfg.sourceType === 'crm_field') return !cfg.crmField;
      return true;
    }).length,
    [detectedVarIndices, variables],
  );

  const validationChecks = useMemo(() => [
    ...validateCampaignPreflight(
      { name: campaignName, template_name: selectedTemplate?.name || '', variables, audience: audience as any, delivery, automationRules },
      detectedVarIndices,
      estimate.total,
    ),
    {
      id: 'template_approved',
      label: 'Official WhatsApp Template Verified',
      status: (selectedTemplate?.status === 'APPROVED' ? 'pass' : 'fail') as 'pass' | 'fail' | 'warn',
      message: selectedTemplate?.status === 'APPROVED' ? undefined : 'Template not yet approved by Meta',
    },
  ], [campaignName, selectedTemplate, variables, audience, delivery, automationRules, detectedVarIndices, estimate.total]);

  const canLaunch = useMemo(() => validationChecks.every(c => c.status !== 'fail'), [validationChecks]);

  const getValidationText = () => {
    const first = validationChecks.find(c => c.status === 'fail');
    if (!first) return 'Launch Ready';
    const msg = first.message || first.label;
    if (msg.toLowerCase().includes('name')) return 'Campaign name required';
    if (msg.toLowerCase().includes('template')) return 'Template required';
    if (msg.toLowerCase().includes('variable')) return 'Variables incomplete';
    if (msg.toLowerCase().includes('recipient') || msg.toLowerCase().includes('audience')) return 'Audience required';
    return msg;
  };

  const getMissingValidationMessage = (): string => {
    const issues: string[] = [];
    if (!campaignName.trim() || campaignName.length < 3) issues.push('Campaign name (min 3 chars)');
    if (!selectedTemplate) issues.push('template not selected');
    if (unmappedVariableCount > 0) issues.push(`${unmappedVariableCount} variable(s) unmapped`);
    if (estimate.total === 0) issues.push('no audience selected');
    if (selectedTemplate?.status !== 'APPROVED') issues.push('template not approved');
    return `Cannot launch: ${issues.join(', ')}`;
  };

  const estimatedDuration = delivery.throttleRate > 0 ? Math.ceil(estimate.total / delivery.throttleRate) : 0;

  // ── Recipient resolution ───────────────────────────────────────────────────
  useEffect(() => {
    const resolve = async () => {
      setRecipientsLoading(true);
      try {
        const res  = await fetch('/api/broadcast/recipients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: campaignId || null, audience }),
        });
        const data = await res.json();
        if (data.success) {
          setRecipientsData({
            totalRecipients:  data.totalRecipients,
            excluded:         data.excluded,
            duplicatesRemoved: data.duplicatesRemoved,
            invalidNumbers:   data.invalidNumbers,
            normalizationCount: data.normalizationCount,
            recipients:       data.recipients,
          });
          setEstimate({
            total:     data.totalRecipients,
            excluded:  data.excluded,
            duplicates: data.duplicatesRemoved,
            invalid:   data.invalidNumbers,
            spamRisk:  data.totalRecipients > 5000 ? 'HIGH' : data.totalRecipients > 2000 ? 'MEDIUM' : 'LOW',
          });
        }
      } catch (err) {
        console.error('[BROADCAST_BUILDER] recipient resolve failed:', err);
      } finally {
        setRecipientsLoading(false);
      }
    };
    resolve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, totalContacts]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="broadcast-page-shell"
    >
      {/* Test Send Modal */}
      <AnimatePresence>
        {showTestModal && (
          <TestSendModal
            open={showTestModal}
            onClose={() => setShowTestModal(false)}
            onSend={executeTestSend}
            isSending={isTesting}
            templateName={selectedTemplate?.name ?? ''}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="broadcast-header">
        <div className="broadcast-builder-container flex items-center justify-between h-full px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center border border-border/40 bg-secondary/10 hover:bg-secondary/35 text-muted-foreground hover:text-foreground transition-all duration-[120ms] shrink-0"
              aria-label="Back to campaigns list"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Megaphone className="w-3.5 h-3.5" />
              </div>
              <h1 className="text-[20px] font-semibold tracking-tight text-foreground leading-none">
                Broadcast
              </h1>
            </div>
          </div>

          {/* Campaign name pill */}
          <div className="flex items-center gap-2 border border-border/45 hover:border-border/60 bg-secondary/20 hover:bg-secondary/40 rounded-xl px-3 py-1.5 transition-all duration-150 shrink-0 select-none">
            <span className="text-[10px] font-bold text-muted-foreground/60 tracking-wider uppercase shrink-0">Campaign:</span>
            <input
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="Untitled Campaign…"
              className="w-28 sm:w-36 bg-transparent border-none outline-none focus:ring-0 p-0 text-[11px] text-foreground placeholder:text-muted-foreground/45 font-semibold leading-none truncate"
            />
            <span className="w-[1px] h-3.5 bg-border/40 shrink-0 mx-0.5" />
            <AutosaveIndicator status={saveStatus} />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="broadcast-main-content-wrapper">
        <div className="broadcast-builder-container flex-1 flex flex-col overflow-hidden">
          <div className="broadcast-main-grid">
            <section className="broadcast-left-column space-y-8">

              {/* Template Selection */}
              <div id="section-template" className="space-y-3 text-left">
                <div className="space-y-1">
                  <h2 className="text-[16px] font-bold text-foreground tracking-tight">Template Selection</h2>
                  <p className="text-[12.5px] text-muted-foreground/80 leading-none">Choose and configure a WhatsApp message template to send.</p>
                </div>
                <div className="border border-border/45 bg-card rounded-[24px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-200 hover:-translate-y-[0.5px]">
                  <TemplateSelector
                    templates={templates}
                    selectedTemplate={selectedTemplate}
                    onSelect={tpl => {
                      setSelectedTemplate(tpl);
                      setVariables({});
                      if (tpl) {
                        setTimeout(() => {
                          const el = variableMappingRef.current || document.getElementById('section-variables');
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el.classList.add('highlight-ring');
                            setTimeout(() => el.classList.remove('highlight-ring'), 1500);
                          }
                        }, 150);
                      }
                    }}
                    loading={templatesLoading}
                  />
                </div>
                {selectedTemplate && (
                  <div className="template-next-step-banner">
                    <span>✅ Template selected</span>
                    <span className="arrow">→</span>
                    <button
                      type="button"
                      onClick={() => variableMappingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    >
                      Now configure your variables ↓
                    </button>
                  </div>
                )}
              </div>

              {/* Variable Mapping */}
              {selectedTemplate && detectedVarIndices.length > 0 && (
                <div ref={variableMappingRef} id="variable-mapping-section" className="space-y-3 text-left pt-2">
                  <div className="space-y-1">
                    <h2 className="text-[16px] font-bold text-foreground tracking-tight">Template Variables</h2>
                    <p className="text-[12.5px] text-muted-foreground/80 leading-none">Map the placeholders in your template to static text or CRM data fields.</p>
                  </div>
                  <div className="border border-border/45 bg-card rounded-[24px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-200 hover:-translate-y-[0.5px]">
                    <VariableMapper
                      bodyText={selectedTemplate.body ?? ''}
                      variables={variables}
                      onChange={setVariables}
                      previewValues={previewValues}
                    />
                  </div>
                </div>
              )}

              {/* Audience */}
              <div id="section-audience" className="space-y-3 text-left pt-2">
                <div className="space-y-1">
                  <h2 className="text-[16px] font-bold text-foreground tracking-tight">Audience</h2>
                  <p className="text-[12.5px] text-muted-foreground/80 leading-none">Choose who receives this broadcast.</p>
                </div>
                <div className="border border-border/45 bg-card rounded-[24px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-200 hover:-translate-y-[0.5px]">
                  <AudienceBuilder
                    audience={audience}
                    onChange={setAudience}
                    estimate={estimate}
                    totalContacts={totalContacts}
                    completedCampaigns={allCampaigns.filter(c => c.status === 'completed')}
                    availableTags={availableTags}
                    onOpenRecipientsDrawer={() => setDrawerOpen(true)}
                  />
                </div>
                <div className="pt-2">
                  <RecipientPreviewPanel
                    recipients={recipientsData.recipients}
                    totalRecipients={recipientsData.totalRecipients}
                    excluded={recipientsData.excluded}
                    duplicatesRemoved={recipientsData.duplicatesRemoved}
                    invalidNumbers={recipientsData.invalidNumbers}
                    normalizationCount={recipientsData.normalizationCount}
                    onOpenDrawer={() => setDrawerOpen(true)}
                    isLoading={recipientsLoading}
                  />
                </div>
              </div>

              {/* Delivery */}
              <div id="section-delivery" className="space-y-3 text-left pt-2">
                <div className="space-y-1">
                  <h2 className="text-[16px] font-bold text-foreground tracking-tight">Delivery</h2>
                  <p className="text-[12.5px] text-muted-foreground/80 leading-none">Control timing and sending behavior.</p>
                </div>
                <div className="border border-border/45 bg-card rounded-[24px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-200 hover:-translate-y-[0.5px]">
                  <DeliverySettings
                    config={delivery}
                    onChange={setDelivery}
                    estimatedDuration={estimatedDuration}
                    audienceCount={estimate.total}
                  />
                </div>
              </div>

              {/* Automation */}
              <div id="section-automation" className="space-y-3 text-left pt-2">
                <div className="space-y-1">
                  <h2 className="text-[16px] font-bold text-foreground tracking-tight">Automation</h2>
                  <p className="text-[12.5px] text-muted-foreground/80 leading-none">Define conversational follow-up rules for responses.</p>
                </div>
                <div className="border border-border/45 bg-card rounded-[24px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-200 hover:-translate-y-[0.5px]">
                  <AutomationRules rules={automationRules} onChange={setAutomationRules} />
                </div>
              </div>

              {/* Review */}
              <div id="section-review" className="space-y-3 text-left pt-2">
                <div className="space-y-1">
                  <h2 className="text-[16px] font-bold text-foreground tracking-tight">Review</h2>
                  <p className="text-[12.5px] text-muted-foreground/80 leading-none">Verify campaign readiness before launch.</p>
                </div>
                <div className="border border-border/45 bg-card rounded-[24px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-200 hover:-translate-y-[0.5px]">
                  <CampaignReview
                    campaignName={campaignName}
                    templateName={selectedTemplate?.name ?? null}
                    audienceCount={estimate.total}
                    variablesValid={variablesValid || detectedVarIndices.length === 0}
                    quietHoursEnabled={delivery.quietHoursEnabled}
                    throttleRate={delivery.throttleRate}
                    scheduledAt={delivery.scheduledAt}
                    onSaveDraft={async () => {
                      if (!campaignName.trim()) {
                        toast.error('Enter a campaign name first');
                        return;
                      }
                      await save(false);
                      toast.success('Draft saved');
                    }}
                    onLaunch={handleLaunch}
                    onTestSend={handleTestSend}
                    onDuplicate={() => toast('Duplicate coming soon')}
                    isSaving={isSaving}
                    isLaunching={isLaunching}
                    validationChecks={validationChecks}
                    audience={audience}
                    variables={variables}
                    detectedVarIndices={detectedVarIndices}
                  />
                </div>
              </div>

            </section>

            {/* Preview panel */}
            <aside className="broadcast-preview-column">
              <div className="preview-panel">
                <div className="preview-panel-header">
                  <p className="preview-label">PREVIEW PANEL</p>
                  <h3 className="preview-title">Live Preview</h3>
                </div>
                <div className="preview-phone-container">
                  <WhatsAppPreview
                    template={selectedTemplate}
                    variableMapping={previewValues}
                    previewProfile={previewRecipient}
                    onProfileChange={setPreviewRecipient as any}
                    businessName={userName}
                  />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="broadcast-action-footer">
        <div className="broadcast-footer-grid">
          {/* Left: recipient summary */}
          <div className="min-w-0 flex flex-col justify-center text-left">
            {estimate.total > 0 ? (
              <div className="flex items-center gap-2.5">
                <div className="w-8.5 h-8.5 rounded-full bg-indigo-500/10 dark:bg-indigo-950/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="flex flex-col text-left min-w-0">
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-all leading-none text-left whitespace-nowrap"
                  >
                    {estimate.total.toLocaleString()} targets ready
                  </button>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1.5 font-medium flex items-center gap-1 leading-none select-none whitespace-nowrap">
                    {delivery.mode === 'scheduled' ? (
                      <><Clock className="w-3 h-3 shrink-0" /><span>Scheduled delivery</span></>
                    ) : (
                      <><Send className="w-3 h-3 shrink-0" /><span>Immediate delivery</span></>
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div className="w-8.5 h-8.5 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center text-zinc-400 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-bold text-zinc-400 leading-none">No targets selected</p>
                  <p className="text-[11px] text-zinc-400/80 mt-1 leading-none">Select recipients above</p>
                </div>
              </div>
            )}
          </div>

          {/* Center: validation state */}
          <div className="w-full flex justify-center shrink-0">
            {canLaunch ? (
              <div className="flex items-center justify-center gap-1.5 bg-emerald-500/10 dark:bg-emerald-500/5 border border-emerald-500/20 rounded-full px-3 h-9 max-w-[240px]">
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 truncate">Launch Ready</span>
              </div>
            ) : unmappedVariableCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  variableMappingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  variableMappingRef.current?.classList.add('highlight-ring');
                  setTimeout(() => variableMappingRef.current?.classList.remove('highlight-ring'), 1500);
                }}
                className="flex items-center justify-center gap-1.5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 hover:border-amber-500/40 rounded-full px-3 h-9 max-w-[240px] text-amber-700 dark:text-amber-400 transition-all font-bold text-[11px] truncate"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 animate-pulse" />
                <span>Variable mapping incomplete — click to fix</span>
              </button>
            ) : (
              <div className="flex items-center justify-center gap-1.5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 rounded-full px-3 h-9 max-w-[240px]">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
                <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 truncate">
                  {getValidationText()}
                </span>
              </div>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="broadcast-actions-group">
            <button
              type="button"
              onClick={async () => {
                if (!campaignName.trim()) {
                  toast.error('Enter a campaign name first');
                  return;
                }
                await save(false);
                toast.success('Draft saved');
              }}
              disabled={isSaving}
              className="save-draft-btn button-nowrap h-10 px-3.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5"
            >
              {isSaving ? <Spinner /> : <Save className="w-4 h-4" />}
              Save Draft
            </button>

            <button
              type="button"
              onClick={handleTestSend}
              disabled={isTesting || !selectedTemplate}
              className="test-campaign-btn button-nowrap h-10 px-3.5 text-[12.5px] font-semibold border border-border bg-background hover:bg-secondary/35 rounded-xl text-foreground transition-all duration-150 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isTesting ? <Spinner /> : <FlaskConical className="w-4 h-4" />}
              Test Campaign
            </button>

            <button
              type="button"
              onClick={handleLaunch}
              disabled={!canLaunch || isLaunching}
              title={!canLaunch ? getMissingValidationMessage() : undefined}
              className={`launch-btn button-nowrap h-10 px-5 text-[12.5px] font-bold tracking-wide rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 select-none ${
                !canLaunch || isLaunching
                  ? 'bg-zinc-150 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-650 border border-zinc-200/50 dark:border-zinc-800/85 cursor-not-allowed opacity-40'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-[0_4px_16px_rgba(99,102,241,0.22)] hover:shadow-[0_4px_20px_rgba(99,102,241,0.35)] text-white border border-indigo-500/10'
              }`}
            >
              {isLaunching ? <Spinner /> : <Send className="w-3 h-3" />}
              {delivery.mode === 'scheduled' ? 'Schedule' : 'Launch'}
            </button>
          </div>
        </div>
      </footer>

      <RecipientDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        recipients={recipientsData.recipients}
        totalRecipients={recipientsData.totalRecipients}
        manualContactIds={audience.manualContactIds}
        excludedContactIds={audience.excludedContactIds as string[]}
        onAudienceChange={patch => setAudience(a => ({ ...a, ...patch }))}
      />
    </motion.div>
  );
}
