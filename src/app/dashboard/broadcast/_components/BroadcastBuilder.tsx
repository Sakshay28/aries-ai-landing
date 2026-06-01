"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Check, ChevronDown, Megaphone, RefreshCw, Clock, Save, Zap,
  AlertCircle, AlertTriangle, CheckCircle2, Eye, Send, Target,
  Settings2, Bot, Clipboard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { TemplateSelector } from './TemplateSelector';
import { WhatsAppPreview } from './WhatsAppPreview';
import { VariableMapper } from './VariableMapper';
import { AudienceBuilder } from './AudienceBuilder';
import { DeliverySettings } from './DeliverySettings';
import { AutomationRules } from './AutomationRules';
import { CampaignReview } from './CampaignReview';

// ── Types ─────────────────────────────────────────────────────────────────────
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'retrying' | 'completed' | 'failed' | 'archived' | 'cancelled';

export interface Template {
  name: string;
  category: string;
  language: string;
  status: string;
  body: string;
  headerType?: string;
  headerText?: string;
  headerMediaUrl?: string;
  footer?: string;
  buttons?: ParsedButton[];
  components?: TemplateComponent[];
  updatedAt?: string;
}

export interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: MetaButton[];
  example?: { header_handle?: string[] };
}

export interface MetaButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface ParsedButton {
  type: string;
  text: string;
  url?: string;
  phoneNumber?: string;
}

export interface AudienceState {
  type: 'all' | 'tags' | 'custom' | 'retarget';
  tags: string[];
  customFilters: CustomFilter[];
  retargetCampaignId: string | null;
  retargetCondition: 'unread' | 'no_reply' | 'clicked_cta' | 'not_clicked';
  retargetDelayDays: number;
}

export interface CustomFilter {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export interface VariableConfig {
  index: string;
  sourceType: 'crm_field' | 'static' | 'custom';
  crmField?: string;
  staticValue?: string;
}

export interface DeliveryConfig {
  mode: 'now' | 'scheduled' | 'recurring';
  scheduledAt: string | null;
  timezone: string;
  quietHoursEnabled: boolean;
  throttleRate: number;
  advancedOpen: boolean;
}

export interface AutomationRule {
  id: string;
  trigger: 'replied' | 'no_reply' | 'cta_clicked' | 'stop_received' | 'failed';
  action: 'assign_human' | 'trigger_flow' | 'send_followup' | 'notify_email' | 'auto_optout' | 'retry';
  delay?: number;
  enabled: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  template_name: string;
  status: CampaignStatus;
  audience_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  scheduled_at: string | null;
  created_at: string;
}

export interface EstimateResult {
  total: number;
  excluded: number;
  duplicates: number;
  invalid: number;
  spamRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}

type ValidationStatus = 'pass' | 'fail' | 'warn';
interface ValidationCheck {
  id: string;
  label: string;
  status: ValidationStatus;
  message?: string;
}

type SectionId = 'setup' | 'template' | 'variables' | 'audience' | 'delivery' | 'automation' | 'review';

interface BroadcastBuilderProps {
  campaign: Campaign | null; // null = new
  allCampaigns: Campaign[];
  onClose: () => void;
  onSaved: () => void;
}

const OBJECTIVES = ['Promotion', 'Reminder', 'Re-engagement', 'Announcement', 'Support'] as const;
type Objective = typeof OBJECTIVES[number];

const PREVIEW_PROFILES: Record<string, Record<string, string>> = {
  Sakshay: { '1': 'Sakshay', '2': 'SKY-2045', '3': 'Friday, 7 PM' },
  John:    { '1': 'John',    '2': 'JHN-1901', '3': 'Saturday, 11 AM' },
  Priya:   { '1': 'Priya',  '2': 'PRY-0078', '3': 'Sunday, 5 PM' },
};

const SECTION_META: Record<SectionId, { icon: React.ElementType; label: string }> = {
  setup:      { icon: Clipboard,  label: 'Campaign Setup'    },
  template:   { icon: Megaphone,  label: 'Template'          },
  variables:  { icon: Zap,        label: 'Variables'         },
  audience:   { icon: Target,     label: 'Audience'          },
  delivery:   { icon: Clock,      label: 'Delivery'          },
  automation: { icon: Bot,        label: 'Automation'        },
  review:     { icon: CheckCircle2, label: 'Review & Launch' },
};
const SECTIONS: SectionId[] = ['setup', 'template', 'variables', 'audience', 'delivery', 'automation', 'review'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function cleanName(n: string) {
  if (n.startsWith('__retarget:')) { const i = n.indexOf('__:'); if (i !== -1) return n.slice(i + 3); }
  return n;
}

function calcEstimates(audienceType: AudienceState['type'], total: number): EstimateResult {
  const excluded = Math.round(total * 0.04);
  const duplicates = Math.round(total * 0.02);
  const invalid = Math.round(total * 0.01);
  const net = total - excluded - duplicates - invalid;
  const spamRisk: EstimateResult['spamRisk'] = net > 5000 ? 'MEDIUM' : 'LOW';
  return { total: net, excluded, duplicates, invalid, spamRisk };
}

function calcDuration(count: number, rate: number) {
  if (!count || !rate) return 0;
  return Math.ceil(count / rate);
}

// ── Autosave indicator ────────────────────────────────────────────────────────
function AutosaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  return (
    <AnimatePresence mode="wait">
      {status !== 'idle' && (
        <motion.div
          key={status}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-1.5"
        >
          {status === 'saving' && (
            <><RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" /><span className="text-[11px] text-muted-foreground">Saving…</span></>
          )}
          {status === 'saved' && (
            <><Check className="w-3 h-3 text-emerald-500" /><span className="text-[11px] text-emerald-600">Saved</span></>
          )}
          {status === 'error' && (
            <><AlertCircle className="w-3 h-3 text-red-500" /><span className="text-[11px] text-red-500">Save failed</span></>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ id, children, scrollRef }: { id: SectionId; children: React.ReactNode; scrollRef?: React.RefObject<HTMLDivElement> }) {
  const { icon: Icon, label } = SECTION_META[id];
  return (
    <div id={`section-${id}`} ref={scrollRef} className="scroll-mt-6">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5 text-indigo-600" />
        </div>
        <h3 className="text-[13px] font-semibold text-foreground tracking-tight">{label}</h3>
      </div>
      {children}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function BroadcastBuilder({ campaign, allCampaigns, onClose, onSaved }: BroadcastBuilderProps) {
  const supabase = createBrowserSupabaseClient();

  // ── Form state ───────────────────────────────────────────────────────────────
  const [campaignName, setCampaignName] = useState(campaign ? cleanName(campaign.name) : '');
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState<Objective | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [variables, setVariables] = useState<Record<string, VariableConfig>>({});
  const [audience, setAudience] = useState<AudienceState>({
    type: 'all', tags: [], customFilters: [],
    retargetCampaignId: null, retargetCondition: 'unread', retargetDelayDays: 1,
  });
  const [delivery, setDelivery] = useState<DeliveryConfig>({
    mode: 'now', scheduledAt: null, timezone: 'Asia/Kolkata',
    quietHoursEnabled: true, throttleRate: 300, advancedOpen: false,
  });
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([
    { id: '1', trigger: 'stop_received', action: 'auto_optout', enabled: true },
    { id: '2', trigger: 'replied', action: 'assign_human', enabled: false },
    { id: '3', trigger: 'no_reply', action: 'send_followup', delay: 24, enabled: false },
    { id: '4', trigger: 'cta_clicked', action: 'notify_email', enabled: false },
  ]);

  // ── Templates ────────────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [totalContacts, setTotalContacts] = useState(0);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  // ── Preview state ────────────────────────────────────────────────────────────
  const [previewProfile, setPreviewProfile] = useState('Sakshay');
  const [showPreview, setShowPreview] = useState(true);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isSaving, setIsSaving] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const autosaveTimer = useRef<NodeJS.Timeout | null>(null);
  const hasMounted = useRef(false);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const previewValues: Record<string, string> = { ...PREVIEW_PROFILES[previewProfile] };

  // Merge variable mapper values into preview
  Object.entries(variables).forEach(([idx, cfg]) => {
    if (cfg.sourceType === 'static' && cfg.staticValue) previewValues[idx] = cfg.staticValue;
    else if (cfg.sourceType === 'crm_field') previewValues[idx] = PREVIEW_PROFILES[previewProfile]?.[idx] ?? `[${cfg.crmField}]`;
  });

  const estimate: EstimateResult = calcEstimates(audience.type, totalContacts);
  const estimatedDuration = calcDuration(estimate.total, delivery.throttleRate);

  // Build variable indices from template body
  const detectedVarIndices = React.useMemo(() => {
    if (!selectedTemplate?.body) return [];
    const matches = [...selectedTemplate.body.matchAll(/{{(\d+)}}/g)];
    return [...new Set(matches.map(m => m[1]))].sort();
  }, [selectedTemplate?.body]);

  const variablesValid = detectedVarIndices.every(idx => {
    const cfg = variables[idx];
    if (!cfg) return false;
    if (cfg.sourceType === 'static') return !!cfg.staticValue?.trim();
    if (cfg.sourceType === 'crm_field') return !!cfg.crmField;
    if (cfg.sourceType === 'custom') return !!cfg.staticValue?.trim();
    return false;
  });

  // ── Validation checks ────────────────────────────────────────────────────────
  const validationChecks: ValidationCheck[] = [
    {
      id: 'name',
      label: 'Campaign name set',
      status: campaignName.trim() ? 'pass' : 'fail',
      message: campaignName.trim() ? undefined : 'Campaign name is required',
    },
    {
      id: 'template',
      label: 'Template selected',
      status: selectedTemplate ? 'pass' : 'fail',
      message: selectedTemplate ? undefined : 'Select a WhatsApp template',
    },
    {
      id: 'template_approved',
      label: 'Template approved by Meta',
      status: !selectedTemplate ? 'warn' : selectedTemplate.status === 'APPROVED' ? 'pass' : 'fail',
      message: selectedTemplate && selectedTemplate.status !== 'APPROVED' ? `Template is ${selectedTemplate.status}` : undefined,
    },
    {
      id: 'variables',
      label: 'All variables mapped',
      status: detectedVarIndices.length === 0 ? 'pass' : variablesValid ? 'pass' : 'fail',
      message: variablesValid || detectedVarIndices.length === 0 ? undefined : 'Some variables are not mapped',
    },
    {
      id: 'audience',
      label: 'Audience selected',
      status: estimate.total > 0 ? 'pass' : 'warn',
      message: estimate.total === 0 ? 'No contacts in selected audience' : undefined,
    },
    {
      id: 'quiet_hours',
      label: 'Quiet hours protection',
      status: delivery.quietHoursEnabled ? 'pass' : 'warn',
      message: delivery.quietHoursEnabled ? undefined : 'Consider enabling quiet hours',
    },
    {
      id: 'schedule',
      label: delivery.mode === 'scheduled' ? 'Scheduled time set' : 'Delivery mode set',
      status: delivery.mode !== 'scheduled' || delivery.scheduledAt ? 'pass' : 'fail',
      message: delivery.mode === 'scheduled' && !delivery.scheduledAt ? 'Set a schedule date and time' : undefined,
    },
  ];
  const canLaunch = validationChecks.every(c => c.status !== 'fail');

  // ── Data fetching ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTemplates();
    fetchContactStats();
  }, []);

  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch('/api/dashboard/templates');
      const j = await res.json();
      if (j.success && Array.isArray(j.data)) {
        setTemplates(j.data.filter((t: Template) => ['APPROVED', 'PENDING'].includes(t.status)));
      }
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const fetchContactStats = async () => {
    try {
      const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).not('phone', 'is', null);
      setTotalContacts(count ?? 0);
      // Fetch distinct tags
      const { data: tagData } = await supabase.from('leads').select('tags').not('tags', 'is', null);
      const allTags = new Set<string>();
      (tagData ?? []).forEach((row: { tags?: string[] }) => (row.tags ?? []).forEach(t => allTags.add(t)));
      setAvailableTags([...allTags]);
    } catch { /* non-critical */ }
  };

  // ── Autosave ─────────────────────────────────────────────────────────────────
  const triggerAutosave = useCallback(() => {
    if (!hasMounted.current) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      performAutosave();
    }, 800);
  }, [campaignName, selectedTemplate, delivery, audience]);

  useEffect(() => {
    hasMounted.current = true;
  }, []);

  useEffect(() => {
    if (!hasMounted.current) return;
    triggerAutosave();
  }, [campaignName, selectedTemplate?.name, delivery.mode, delivery.scheduledAt, audience.type]);

  const performAutosave = async () => {
    if (!campaignName.trim()) return;
    setAutosaveStatus('saving');
    try {
      const { data: tenantData } = await supabase.from('tenants').select('id').single();
      if (!tenantData) throw new Error('No tenant');
      if (campaign?.id) {
        await supabase.from('broadcast_campaigns').update({
          name: campaignName,
          template_name: selectedTemplate?.name ?? campaign.template_name,
          status: delivery.mode === 'scheduled' && delivery.scheduledAt ? 'scheduled' : 'draft',
          scheduled_at: delivery.scheduledAt ? new Date(delivery.scheduledAt).toISOString() : null,
        }).eq('id', campaign.id);
      }
      setAutosaveStatus('saved');
      setTimeout(() => setAutosaveStatus('idle'), 2500);
    } catch {
      setAutosaveStatus('error');
      setTimeout(() => setAutosaveStatus('idle'), 3000);
    }
  };

  // ── Save Draft ───────────────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    if (!campaignName.trim()) { toast.error('Campaign name is required'); return; }
    setIsSaving(true);
    try {
      const { data: tenantData } = await supabase.from('tenants').select('id').single();
      if (!tenantData) throw new Error('No tenant found');
      if (campaign?.id) {
        const { error } = await supabase.from('broadcast_campaigns').update({
          name: campaignName,
          template_name: selectedTemplate?.name ?? campaign.template_name,
          audience_count: estimate.total,
          status: delivery.mode === 'scheduled' && delivery.scheduledAt ? 'scheduled' : 'draft',
          scheduled_at: delivery.scheduledAt ? new Date(delivery.scheduledAt).toISOString() : null,
        }).eq('id', campaign.id);
        if (error) throw error;
        toast.success('Draft updated');
      } else {
        const { error } = await supabase.from('broadcast_campaigns').insert({
          tenant_id: tenantData.id,
          name: campaignName,
          template_name: selectedTemplate?.name ?? '',
          audience_count: estimate.total,
          status: delivery.mode === 'scheduled' && delivery.scheduledAt ? 'scheduled' : 'draft',
          scheduled_at: delivery.scheduledAt ? new Date(delivery.scheduledAt).toISOString() : null,
        });
        if (error) throw error;
        toast.success('Draft saved');
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message ?? 'Failed to save draft');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Launch Campaign ──────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    if (!canLaunch) { toast.error('Fix validation errors before launching'); return; }
    setIsLaunching(true);
    try {
      const { data: tenantData } = await supabase.from('tenants').select('id').single();
      if (!tenantData) throw new Error('No tenant found');

      let campaignId = campaign?.id;
      if (!campaignId) {
        const { data: inserted, error: insertErr } = await supabase.from('broadcast_campaigns').insert({
          tenant_id: tenantData.id,
          name: campaignName,
          template_name: selectedTemplate!.name,
          audience_count: estimate.total,
          status: 'draft',
          scheduled_at: delivery.scheduledAt ? new Date(delivery.scheduledAt).toISOString() : null,
        }).select('id').single();
        if (insertErr) throw insertErr;
        campaignId = inserted.id;
      } else {
        await supabase.from('broadcast_campaigns').update({
          name: campaignName,
          template_name: selectedTemplate!.name,
          audience_count: estimate.total,
          scheduled_at: delivery.scheduledAt ? new Date(delivery.scheduledAt).toISOString() : null,
        }).eq('id', campaignId);
      }

      if (delivery.mode !== 'scheduled') {
        const res = await fetch('/api/broadcasts/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        toast.success('Campaign launched! Sending started.');
      } else {
        toast.success('Campaign scheduled successfully.');
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message ?? 'Failed to launch campaign');
    } finally {
      setIsLaunching(false);
    }
  };

  // ── Test Send ────────────────────────────────────────────────────────────────
  const handleTestSend = async () => {
    if (!selectedTemplate) { toast.error('Select a template first'); return; }
    try {
      const res = await fetch('/api/broadcasts/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateName: selectedTemplate.name, variables: previewValues }),
      });
      const data = await res.json();
      if (data.success) toast.success('Test message sent to your number!');
      else toast.error(data.error ?? 'Test send failed');
    } catch {
      toast.error('Test send failed');
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full bg-background overflow-hidden"
    >
      {/* Top Header */}
      <header className="h-14 border-b border-border/60 flex items-center justify-between px-6 shrink-0 bg-background/95 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <input
              value={campaignName}
              onChange={e => { setCampaignName(e.target.value); triggerAutosave(); }}
              placeholder="Campaign name…"
              className="text-[14px] font-semibold text-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/50 min-w-[200px] w-auto max-w-xs"
            />
          </div>
          <AutosaveIndicator status={autosaveStatus} />
        </div>

        <div className="flex items-center gap-2">
          {/* Preview toggle on smaller screens */}
          <button
            onClick={() => setShowPreview(p => !p)}
            className={`hidden lg:flex xl:hidden items-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-lg border transition-colors ${
              showPreview ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="h-8 px-4 text-[12px] font-medium border border-border rounded-lg text-foreground hover:bg-secondary transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {isSaving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            onClick={handleLaunch}
            disabled={isLaunching || !canLaunch}
            className="h-8 px-4 text-[12px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
          >
            {isLaunching ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Launching…</>
            ) : (
              <><Send className="w-3.5 h-3.5" /> {delivery.mode === 'scheduled' ? 'Schedule' : 'Launch'}</>
            )}
          </button>
        </div>
      </header>

      {/* Split Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── LEFT: Builder ─────────────────────────────────────────────────── */}
        <div className={`flex-1 min-w-0 overflow-y-auto custom-scrollbar ${showPreview ? 'xl:w-[60%] lg:w-[65%]' : 'w-full'}`}>
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-10">

            {/* Section: Setup */}
            <Section id="setup">
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
                    Description <span className="font-normal normal-case tracking-normal text-muted-foreground/50">Optional</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Add a brief note about this campaign…"
                    rows={2}
                    className="w-full px-3.5 py-2.5 bg-secondary/40 border border-transparent hover:border-border/60 focus:border-indigo-500/40 focus:bg-background rounded-xl text-[13px] text-foreground outline-none transition-all resize-none placeholder:text-muted-foreground/40"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Objective</label>
                  <div className="flex flex-wrap gap-2">
                    {OBJECTIVES.map(obj => (
                      <button
                        key={obj}
                        type="button"
                        onClick={() => setObjective(objective === obj ? null : obj)}
                        className={`h-8 px-3.5 text-[12px] font-medium rounded-full border transition-all ${
                          objective === obj
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                            : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                        }`}
                      >
                        {obj}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            <div className="h-px bg-border/40" />

            {/* Section: Template */}
            <Section id="template">
              <TemplateSelector
                templates={templates}
                selectedTemplate={selectedTemplate}
                onSelect={t => { setSelectedTemplate(t); setVariables({}); }}
                loading={templatesLoading}
              />
            </Section>

            {/* Section: Variables — only shown if template has variables */}
            {selectedTemplate && detectedVarIndices.length > 0 && (
              <>
                <div className="h-px bg-border/40" />
                <Section id="variables">
                  <VariableMapper
                    bodyText={selectedTemplate.body ?? ''}
                    variables={variables}
                    onChange={setVariables}
                    previewValues={previewValues}
                  />
                </Section>
              </>
            )}

            <div className="h-px bg-border/40" />

            {/* Section: Audience */}
            <Section id="audience">
              <AudienceBuilder
                audience={audience}
                onChange={setAudience}
                estimate={estimate}
                totalContacts={totalContacts}
                completedCampaigns={allCampaigns.filter(c => c.status === 'completed')}
                availableTags={availableTags}
              />
            </Section>

            <div className="h-px bg-border/40" />

            {/* Section: Delivery */}
            <Section id="delivery">
              <DeliverySettings
                config={delivery}
                onChange={setDelivery}
                estimatedDuration={estimatedDuration}
                audienceCount={estimate.total}
              />
            </Section>

            <div className="h-px bg-border/40" />

            {/* Section: Automation */}
            <Section id="automation">
              <AutomationRules rules={automationRules} onChange={setAutomationRules} />
            </Section>

            <div className="h-px bg-border/40" />

            {/* Section: Review */}
            <Section id="review">
              <CampaignReview
                campaignName={campaignName}
                templateName={selectedTemplate?.name ?? null}
                audienceCount={estimate.total}
                variablesValid={variablesValid || detectedVarIndices.length === 0}
                quietHoursEnabled={delivery.quietHoursEnabled}
                throttleRate={delivery.throttleRate}
                scheduledAt={delivery.scheduledAt}
                onSaveDraft={handleSaveDraft}
                onLaunch={handleLaunch}
                onTestSend={handleTestSend}
                onDuplicate={() => toast('Duplicate feature coming soon')}
                isSaving={isSaving}
                isLaunching={isLaunching}
                validationChecks={validationChecks}
              />
            </Section>

            <div className="h-16" />
          </div>
        </div>

        {/* ── RIGHT: Sticky WhatsApp Preview ────────────────────────────────── */}
        <AnimatePresence>
          {showPreview && (
            <motion.aside
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25 }}
              className="hidden lg:flex w-[35%] xl:w-[40%] shrink-0 border-l border-border/60 bg-secondary/20 flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-border/40">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Live Preview</p>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col items-center">
                <WhatsAppPreview
                  template={selectedTemplate}
                  variableMapping={previewValues}
                  previewProfile={previewProfile}
                  onProfileChange={setPreviewProfile}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
