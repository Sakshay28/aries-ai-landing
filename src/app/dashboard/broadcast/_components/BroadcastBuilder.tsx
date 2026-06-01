"use client";

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Check, ChevronDown, Megaphone, RefreshCw, Clock, Save, Zap,
  AlertCircle, AlertTriangle, CheckCircle2, Eye, Send, Target,
  Settings2, Bot, Clipboard, ArrowLeft, FlaskConical,
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

import { useBroadcastStore } from '../store/broadcast.store';
import { useDebounceCallback } from '../hooks/useDebounce';
import { validateCampaignPreflight } from '../validators/broadcast.validator';
import { 
  Campaign, 
  Template, 
  VariableConfig, 
  AudienceState, 
  DeliveryConfig, 
  AutomationRule, 
  EstimateResult 
} from '../types';

interface BroadcastBuilderProps {
  campaign: Campaign | null; // null = new
  allCampaigns: Campaign[];
  onClose: () => void;
  onSaved: () => void;
}

const PREVIEW_PROFILES: Record<string, Record<string, string>> = {
  Sakshay: { '1': 'Sakshay', '2': 'SKY-2045', '3': 'Friday, 7 PM' },
  John:    { '1': 'John',    '2': 'JHN-1901', '3': 'Saturday, 11 AM' },
  Priya:   { '1': 'Priya',  '2': 'PRY-0078', '3': 'Sunday, 5 PM' },
};

type SectionId = 'template' | 'variables' | 'audience' | 'delivery' | 'automation' | 'review';

const SECTION_META: Record<SectionId, { icon: React.ElementType; label: string }> = {
  template:   { icon: Megaphone,  label: 'Template'          },
  variables:  { icon: Zap,        label: 'Variables'         },
  audience:   { icon: Target,     label: 'Audience'          },
  delivery:   { icon: Clock,      label: 'Delivery'          },
  automation: { icon: Bot,        label: 'Automation'        },
  review:     { icon: CheckCircle2, label: 'Review & Launch' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
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

export function BroadcastBuilder({ campaign, allCampaigns, onClose, onSaved }: BroadcastBuilderProps) {
  const supabase = createBrowserSupabaseClient();

  // ── Global Zustand Store ──────────────────────────────────────────────────
  const {
    campaignId,
    campaignName,
    selectedTemplate,
    variables,
    audience,
    delivery,
    automationRules,
    autosaveStatus,
    previewRecipient,
    isLoading,
    setCampaignId,
    setCampaignName,
    selectTemplate,
    setVariables,
    updateAudience,
    updateDelivery,
    setAutomationRules,
    setPreviewRecipient,
    setAutosaveStatus,
    resetBuilder,
    loadCampaign,
    saveCampaign
  } = useBroadcastStore();

  // ── Local UI State ──────────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [totalContacts, setTotalContacts] = useState(0);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  // Initialize and load campaign details
  useEffect(() => {
    if (campaign) {
      loadCampaign(campaign.id);
    } else {
      resetBuilder();
    }
  }, [campaign, loadCampaign, resetBuilder]);

  // Fetch meta templates & local contacts CRM metadata
  useEffect(() => {
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
        
        // Fetch CRM distinct tags
        const { data: tagData } = await supabase.from('leads').select('tags').not('tags', 'is', null);
        const allTags = new Set<string>();
        (tagData ?? []).forEach((row: { tags?: string[] }) => (row.tags ?? []).forEach(t => allTags.add(t)));
        setAvailableTags([...allTags]);
      } catch { /* non-critical */ }
    };

    fetchTemplates();
    fetchContactStats();
  }, []);

  // ── Debounced Draft Autosave ──────────────────────────────────────────────
  const performAutosave = useDebounceCallback(async () => {
    if (!campaignName.trim()) return;
    setAutosaveStatus('saving');
    try {
      const { data: tenantData } = await supabase.from('tenants').select('id').single();
      if (!tenantData) throw new Error('No tenant found');
      
      const savedId = await saveCampaign(supabase, tenantData.id);
      if (savedId) {
        setAutosaveStatus('saved');
        setTimeout(() => setAutosaveStatus('idle'), 2500);
      } else {
        throw new Error('Save failed');
      }
    } catch {
      setAutosaveStatus('error');
      setTimeout(() => setAutosaveStatus('idle'), 3000);
    }
  }, 800);

  // Trigger autosave on form input changes
  useEffect(() => {
    if (campaignName.trim()) {
      performAutosave();
    }
  }, [campaignName, selectedTemplate?.name, audience.type, delivery.mode, delivery.scheduledAt]);

  // ── Derived State Calculations ──────────────────────────────────────────────
  const previewValues: Record<string, string> = { ...PREVIEW_PROFILES[previewRecipient] };

  // Overlay variable mapper configuration values over preview profile
  Object.entries(variables).forEach(([idx, cfg]) => {
    if (cfg.sourceType === 'static' && cfg.staticValue) {
      previewValues[idx] = cfg.staticValue;
    } else if (cfg.sourceType === 'crm_field') {
      previewValues[idx] = PREVIEW_PROFILES[previewRecipient]?.[idx] ?? `[${cfg.crmField}]`;
    }
  });

  // Calculate recipients dynamically
  const audienceBaseCount = React.useMemo(() => {
    if (audience.type === 'all') return totalContacts;
    if (audience.type === 'tags') return audience.tags.length > 0 ? totalContacts : 0;
    if (audience.type === 'custom') return audience.customFilters.length > 0 ? totalContacts : 0;
    if (audience.type === 'csv') return totalContacts; // Simulated CSV upload
    if (audience.type === 'retarget') return audience.retargetCampaignId ? Math.round(totalContacts * 0.45) : 0;
    return 0;
  }, [audience.type, audience.tags.length, audience.customFilters.length, audience.retargetCampaignId, totalContacts]);

  const estimate: EstimateResult = calcEstimates(audience.type, audienceBaseCount);
  const estimatedDuration = calcDuration(estimate.total, delivery.throttleRate);

  // Detect index variables inside template body
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

  // Pre-flight check validators
  const validationChecks = validateCampaignPreflight(
    {
      name: campaignName,
      template_name: selectedTemplate?.name || '',
      variables,
      audience,
      delivery,
      automationRules,
    },
    detectedVarIndices,
    estimate.total
  );

  const canLaunch = validationChecks.every(c => c.status !== 'fail');

  // ── Manual Draft Saving ──────────────────────────────────────────────────────
  const handleSaveDraft = async () => {
    if (!campaignName.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    setIsSaving(true);
    try {
      const { data: tenantData } = await supabase.from('tenants').select('id').single();
      if (!tenantData) throw new Error('No active workspace tenant found');
      
      const savedId = await saveCampaign(supabase, tenantData.id, 'draft');
      if (savedId) {
        toast.success('Draft saved successfully');
        onSaved();
      } else {
        throw new Error('Transaction failed');
      }
    } catch (e) {
      toast.error((e as Error).message ?? 'Failed to save campaign draft');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Immediate / Scheduled Launching ──────────────────────────────────────────
  const handleLaunch = async () => {
    if (!canLaunch) {
      toast.error('Please resolve validation issues before launching');
      return;
    }
    setIsLaunching(true);
    try {
      const { data: tenantData } = await supabase.from('tenants').select('id').single();
      if (!tenantData) throw new Error('No active workspace tenant found');

      const launchStatus = delivery.mode === 'scheduled' ? 'scheduled' : 'sending';
      const campaignIdSaved = await saveCampaign(supabase, tenantData.id, launchStatus);
      if (!campaignIdSaved) throw new Error('Failed to save configuration before launch');

      if (delivery.mode !== 'scheduled') {
        const res = await fetch('/api/broadcasts/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: campaignIdSaved }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        toast.success('Campaign launched! Sending started.');
      } else {
        toast.success('Campaign scheduled successfully.');
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message ?? 'Failed to launch broadcast campaign');
    } finally {
      setIsLaunching(false);
    }
  };

  // ── Test Outbound Send ───────────────────────────────────────────────────────
  const handleTestSend = async () => {
    if (!selectedTemplate) {
      toast.error('Please select a message template first');
      return;
    }
    try {
      const res = await fetch('/api/broadcasts/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateName: selectedTemplate.name, variables: previewValues }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Test message dispatched successfully!');
      } else {
        toast.error(data.error ?? 'Test dispatch failed');
      }
    } catch {
      toast.error('Test dispatch failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-[13px] font-semibold text-muted-foreground">Loading broadcast configurations…</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full bg-background overflow-hidden"
    >
      {/* Top compact system navigation bar */}
      <header className="h-14 border-b border-border/60 flex items-center justify-between px-6 shrink-0 bg-background/95 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors shrink-0"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex flex-col min-w-0 text-left">
            <div className="flex items-center gap-2">
              <input
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
                placeholder="Untitled Campaign"
                className="text-[13.5px] font-bold text-foreground bg-transparent border-none outline-none placeholder:text-muted-foreground/45 min-w-[200px] w-auto h-5 leading-none focus:ring-0 p-0"
              />
              <AutosaveIndicator status={autosaveStatus} />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground/60 leading-none mt-0.5">
              Draft &bull; WhatsApp Outreach V4
            </span>
          </div>
        </div>

        {/* Live Preview trigger button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPreview(p => !p)}
            className={`hidden lg:flex xl:hidden items-center gap-1.5 h-8 px-3 text-[11.5px] font-bold rounded-lg border transition-colors ${
              showPreview ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Live Preview
          </button>
        </div>
      </header>

      {/* Workspace Columns */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── LEFT: Builder form controls (57% optimized grid) ────────────────── */}
        <div className={`min-w-0 relative flex flex-col transition-all duration-300 ${showPreview ? 'lg:w-[57%] shrink-0 border-r border-border/40' : 'w-full'}`}>
          {/* Scrollable Form Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
            <div className="max-w-2xl w-full mx-auto px-6 pt-4 pb-8 space-y-6 flex-1">

              {/* Section: Template Selection */}
              <Section id="template">
                <TemplateSelector
                  templates={templates}
                  selectedTemplate={selectedTemplate}
                  onSelect={selectTemplate}
                  loading={templatesLoading}
                />
              </Section>

              {/* Section: Variables mapping if required */}
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

              {/* Section: Audience targeting Cohort options */}
              <Section id="audience">
                <AudienceBuilder
                  audience={audience}
                  onChange={updateAudience}
                  estimate={estimate}
                  totalContacts={totalContacts}
                  completedCampaigns={allCampaigns.filter(c => c.status === 'completed')}
                  availableTags={availableTags}
                />
              </Section>

              <div className="h-px bg-border/40" />

              {/* Section: Advanced Delivery and compliance limits */}
              <Section id="delivery">
                <DeliverySettings
                  config={delivery}
                  onChange={updateDelivery}
                  estimatedDuration={estimatedDuration}
                  audienceCount={estimate.total}
                />
              </Section>

              <div className="h-px bg-border/40" />

              {/* Section: Automation and conversational rules */}
              <Section id="automation">
                <AutomationRules rules={automationRules} onChange={setAutomationRules} />
              </Section>

              <div className="h-px bg-border/40" />

              {/* Section: Stripe style Launch Check Timeline */}
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
                  onDuplicate={() => toast('Duplicate functionality coming soon')}
                  isSaving={isSaving}
                  isLaunching={isLaunching}
                  validationChecks={validationChecks}
                />
              </Section>

              <div className="h-4" />
            </div>
          </div>

          {/* DOCKED BOTTOM ACTIONS BAR */}
          <div className="shrink-0 border-t border-border/40 bg-background/85 dark:bg-zinc-950/80 backdrop-blur-xl py-3.5 shadow-[0_-8px_32px_rgba(0,0,0,0.03)] select-none z-10">
            <div className="max-w-2xl w-full mx-auto px-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              
              {/* Left Side: Dynamic Dispatch Summary */}
              <div className="flex flex-col text-left">
                <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-muted-foreground/55">
                  Dispatch Status
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[12px] font-semibold tabular-nums text-foreground">
                    {audience.type === 'all' && `${estimate.total.toLocaleString()} contacts (All)`}
                    {audience.type === 'tags' && `${audience.tags.length > 0 ? estimate.total.toLocaleString() : '0'} contacts (${audience.tags.length} tag${audience.tags.length !== 1 ? 's' : ''})`}
                    {audience.type === 'custom' && `${audience.customFilters.length > 0 ? estimate.total.toLocaleString() : '0'} contacts (${audience.customFilters.length} filter${audience.customFilters.length !== 1 ? 's' : ''})`}
                    {audience.type === 'csv' && `${estimate.total.toLocaleString()} contacts (CSV)`}
                    {audience.type === 'retarget' && `${audience.retargetCampaignId ? estimate.total.toLocaleString() : '0'} contacts (Retarget)`}
                  </span>
                  <span className="w-[3px] h-[3px] rounded-full bg-border/80 shrink-0" />
                  <span className="text-[11px] text-muted-foreground/70 font-medium">
                    {delivery.mode === 'scheduled' ? 'Scheduled' : 'Immediate'}
                  </span>
                </div>
              </div>

              {/* Right Side: Quick Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="h-8 px-3 text-[11px] font-semibold border border-border/60 rounded-lg text-muted-foreground bg-background hover:bg-secondary/30 hover:text-foreground transition-all duration-[130ms] ease-out disabled:opacity-40 flex items-center gap-1.5"
                >
                  <Save className="w-3 h-3" />
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={handleTestSend}
                  disabled={!selectedTemplate}
                  className="h-8 px-3 text-[11px] font-semibold border border-border/60 rounded-lg text-muted-foreground bg-background hover:bg-secondary/30 hover:text-foreground transition-all duration-[130ms] ease-out disabled:opacity-40 flex items-center gap-1.5"
                >
                  <FlaskConical className="w-3 h-3" />
                  Test
                </button>
                <button
                  onClick={handleLaunch}
                  disabled={isLaunching || !canLaunch}
                  className={`h-8 px-4 text-[11.5px] font-bold text-white rounded-lg transition-all duration-[130ms] ease-out flex items-center gap-1.5 ${
                    !canLaunch
                      ? 'bg-indigo-600/30 text-white/40 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-500/20 active:scale-[0.98]'
                  }`}
                >
                  {isLaunching ? (
                    <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Launching…</>
                  ) : (
                    <><Send className="w-3.5 h-3.5" /> {delivery.mode === 'scheduled' ? 'Schedule' : 'Launch'}</>
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* ── RIGHT: Live WhatsApp Device Showcase (43% hero showcase) ───────── */}
        <AnimatePresence>
          {showPreview && (
            <motion.aside
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="hidden lg:flex w-[43%] shrink-0 bg-[#f6f7f9] dark:bg-secondary/10 flex-col overflow-hidden shadow-[-1px_0_0_rgba(148,163,184,0.02)]"
            >
              {/* Header profile picker tab selector replacing the aggressive header line */}
              <div className="px-6 pt-5 pb-3 bg-transparent flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60">WhatsApp Live Preview</p>
                </div>
                <div className="flex items-center bg-slate-200/50 dark:bg-zinc-800/40 rounded-lg p-0.5 border border-slate-300/10 gap-0.5">
                  {['Sakshay', 'John', 'Priya'].map((p) => {
                    const isActive = previewRecipient === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setPreviewRecipient(p as any)}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-[6px] transition-all duration-[120ms] ease-out ${
                          isActive
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground/60 hover:text-muted-foreground'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Centered device box with no vertical scrolling */}
              <div className="flex-grow overflow-hidden px-8 xl:px-10 py-6 flex flex-col items-center justify-center">
                <WhatsAppPreview
                  template={selectedTemplate}
                  variableMapping={previewValues}
                  previewProfile={previewRecipient}
                  onProfileChange={setPreviewRecipient as any}
                />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
