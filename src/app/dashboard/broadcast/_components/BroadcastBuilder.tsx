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
import { RecipientPreviewPanel } from './RecipientPreviewPanel';
import { RecipientDrawer } from './RecipientDrawer';
import { LaunchSafetyModal } from './LaunchSafetyModal';
import { RecipientCacheResult } from '@/lib/broadcast/services/broadcast-recipient.service';
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
// calcEstimates removed in favor of real-time multi-tenant backend calculations

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
  return (
    <div id={`section-${id}`} ref={scrollRef} className="scroll-mt-6">
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
  const [estimate, setEstimate] = useState<EstimateResult>({ total: 0, excluded: 0, duplicates: 0, invalid: 0, spamRisk: 'LOW' });
  const [recipientsData, setRecipientsData] = useState<RecipientCacheResult>({
    totalRecipients: 0,
    excluded: 0,
    duplicatesRemoved: 0,
    invalidNumbers: 0,
    normalizationCount: 0,
    recipients: []
  });
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [safetyModalOpen, setSafetyModalOpen] = useState(false);

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
        const res = await fetch('/api/dashboard/leads');
        const data = await res.json();
        if (data.success && Array.isArray(data.leads)) {
          const leads = data.leads;
          const phoneLeads = leads.filter((l: any) => !!l.phone);
          setTotalContacts(phoneLeads.length);
          
          // Fetch CRM distinct tags
          const allTags = new Set<string>();
          leads.forEach((l: any) => {
            if (Array.isArray(l.tags)) {
              l.tags.forEach((t: string) => allTags.add(t));
            }
          });
          setAvailableTags([...allTags]);
        }
      } catch (err) {
        console.error('Failed to fetch contact stats:', err);
      }
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

  // Fetch dynamic audience estimate and recipients list in real-time
  useEffect(() => {
    const resolveRecipients = async () => {
      setRecipientsLoading(true);
      try {
        const res = await fetch('/api/broadcast/recipients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campaignId: campaign?.id || null, audience })
        });
        const data = await res.json();
        if (data.success) {
          setRecipientsData({
            totalRecipients: data.totalRecipients,
            excluded: data.excluded,
            duplicatesRemoved: data.duplicatesRemoved,
            invalidNumbers: data.invalidNumbers,
            normalizationCount: data.normalizationCount,
            recipients: data.recipients
          });

          // Maintain CampaignReview component estimates in sync
          setEstimate({
            total: data.totalRecipients,
            excluded: data.excluded,
            duplicates: data.duplicatesRemoved,
            invalid: data.invalidNumbers,
            spamRisk: data.totalRecipients > 5000 ? 'HIGH' : data.totalRecipients > 2000 ? 'MEDIUM' : 'LOW'
          });
        }
      } catch (err) {
        console.error('Failed to resolve broadcast recipients:', err);
      } finally {
        setRecipientsLoading(false);
      }
    };
    resolveRecipients();
  }, [audience, totalContacts, campaign?.id]);

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
  const validationChecks = [
    ...validateCampaignPreflight(
      {
        name: campaignName,
        template_name: selectedTemplate?.name || '',
        variables,
        audience: audience as any,
        delivery,
        automationRules,
      },
      detectedVarIndices,
      estimate.total
    ),
    {
      id: 'template_approved',
      label: 'Official WhatsApp Template Verified',
      status: (selectedTemplate?.status === 'APPROVED' ? 'pass' : 'fail') as 'pass' | 'fail' | 'warn',
      message: selectedTemplate?.status === 'APPROVED' ? undefined : 'Template is not yet officially approved by Meta'
    }
  ];

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
      const failing = validationChecks.filter(c => c.status === 'fail');
      if (failing.length > 0) {
        toast.error(`Cannot launch: ${failing[0].message || failing[0].label}`);
      } else {
        toast.error('Please resolve validation issues before launching');
      }
      return;
    }
    setSafetyModalOpen(true);
  };

  const confirmLaunch = async () => {
    setSafetyModalOpen(false);
    setIsLaunching(true);
    try {
      const { data: tenantData } = await supabase.from('tenants').select('id').single();
      if (!tenantData) throw new Error('No active workspace tenant found');

      // Save campaign first to write all latest parameters
      const campaignIdSaved = await saveCampaign(supabase, tenantData.id, 'draft');
      if (!campaignIdSaved) throw new Error('Failed to save configuration before launch');

      const res = await fetch('/api/broadcast/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: campaignIdSaved }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (delivery.mode === 'scheduled') {
        toast.success('Campaign scheduled successfully.');
      } else {
        toast.success('Campaign launched! Sending started.');
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
      className="absolute inset-0 flex flex-col bg-background overflow-hidden"
    >
      {/* Workspace Columns */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── LEFT: Builder form controls (61% optimized grid) ────────────────── */}
        <div className={`min-w-0 relative flex flex-col transition-all duration-300 ${showPreview ? 'lg:w-[61%] shrink-0 border-r border-border/40' : 'w-full'}`}>
          {/* Scrollable Form Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
            <div className="max-w-2xl w-full mx-auto px-6 pt-6 pb-[180px] space-y-6 flex-1">

              {/* Premium Animated Broadcast Section Header */}
              <div className="flex items-center justify-between gap-4 mb-4 select-none">
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-lg flex items-center justify-center border border-border/40 bg-secondary/10 hover:bg-secondary/35 text-muted-foreground hover:text-foreground transition-all duration-[120ms] shrink-0"
                    aria-label="Back to campaigns list"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>

                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="flex items-center gap-2.5"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0"
                    >
                      <Megaphone className="w-3.5 h-3.5" />
                    </motion.div>
                    <h1 className="text-[22px] md:text-[24px] font-semibold tracking-tight text-foreground leading-none">
                      Broadcast
                    </h1>
                  </motion.div>
                </div>

                {/* Inline campaign name setting pill */}
                <div className="flex items-center gap-2 border border-border/45 hover:border-border/60 bg-secondary/20 hover:bg-secondary/40 rounded-xl px-3 py-1.5 transition-all duration-150 shrink-0 select-none">
                  <span className="text-[10px] font-bold text-muted-foreground/60 tracking-wider uppercase shrink-0">Campaign:</span>
                  <input
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    placeholder="Untitled Campaign…"
                    className="w-28 sm:w-36 bg-transparent border-none outline-none focus:ring-0 p-0 text-[11px] text-foreground placeholder:text-muted-foreground/45 font-semibold leading-none truncate"
                  />
                  <span className="w-[1px] h-3.5 bg-border/40 shrink-0 mx-0.5" />
                  <AutosaveIndicator status={autosaveStatus} />
                </div>
              </div>

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
              <Section id="audience" className="space-y-5">
                <AudienceBuilder
                  audience={audience}
                  onChange={updateAudience}
                  estimate={estimate}
                  totalContacts={totalContacts}
                  completedCampaigns={allCampaigns.filter(c => c.status === 'completed')}
                  availableTags={availableTags}
                  onOpenRecipientsDrawer={() => setDrawerOpen(true)}
                />
                
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
                  audience={audience}
                  variables={variables}
                  detectedVarIndices={detectedVarIndices}
                />
              </Section>

              <div className="h-4" />
            </div>
          </div>

          {/* DOCKED BOTTOM ACTIONS BAR */}
          <div className="absolute bottom-6 left-4 right-4 sm:left-6 sm:right-6 lg:left-8 lg:right-8 z-20 max-w-2xl mx-auto border border-border/60 bg-background/80 dark:bg-zinc-950/85 backdrop-blur-xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.12)] rounded-2xl select-none">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              
              {/* Left Side: Dynamic Dispatch Summary & Real Avatars Stack */}
              <div className="flex items-center gap-3 min-w-0">
                {/* Avatars stack */}
                {estimate.total > 0 && (
                  <div className="flex -space-x-1.5 overflow-hidden shrink-0 select-none">
                    {recipientsData.recipients
                      .filter(r => r.status === 'eligible')
                      .slice(0, 3)
                      .map((r, idx) => {
                        const initials = (r.name || 'T')[0].toUpperCase();
                        return (
                          <div
                            key={idx}
                            className="inline-block h-6 w-6 rounded-full border-2 border-background bg-indigo-500/10 text-[9.5px] font-bold text-indigo-600 flex items-center justify-center ring-1 ring-border/20"
                          >
                            {initials}
                          </div>
                        );
                      })}
                  </div>
                )}
                
                <div className="flex flex-col text-left min-w-0">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(true)}
                      className="text-[12.5px] font-bold tracking-tight text-foreground hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-all flex items-center gap-1 leading-none text-left"
                    >
                      {estimate.total.toLocaleString()} targets ready
                    </button>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/35 shrink-0" />
                    <span className="text-[11px] text-muted-foreground font-semibold">
                      {delivery.mode === 'scheduled' ? 'Scheduled' : 'Immediate'}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 font-medium select-none mt-0.5">
                    {delivery.mode === 'scheduled' ? 'Queued for delivery' : 'Ready for direct dispatch'}
                  </span>
                </div>
              </div>

              {/* Middle/Right: Validation status and Quick Action buttons */}
              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                {/* Validation Status Badge */}
                <div className="flex items-center gap-1.5 bg-secondary/30 border border-border/50 px-2.5 py-1 rounded-xl shrink-0 select-none mr-1.5">
                  {canLaunch ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="text-[10.5px] font-extrabold text-emerald-600 dark:text-emerald-400">Ready</span>
                    </>
                  ) : (
                    <>
                      <span className="relative flex h-2 w-2 animate-pulse">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                      <span className="text-[10.5px] font-extrabold text-amber-600 dark:text-amber-500">Validation required</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleSaveDraft}
                    disabled={isSaving}
                    className="h-8.5 px-3 text-[11.5px] font-bold border border-border/80 rounded-xl text-muted-foreground bg-secondary/10 hover:bg-secondary/30 hover:text-foreground transition-all duration-[120ms] ease-out disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button
                    onClick={handleTestSend}
                    disabled={!selectedTemplate}
                    className="h-8.5 px-3 text-[11.5px] font-bold border border-border/80 rounded-xl text-muted-foreground bg-secondary/10 hover:bg-secondary/30 hover:text-foreground transition-all duration-[120ms] ease-out disabled:opacity-40 flex items-center gap-1.5"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    Test
                  </button>
                  <button
                    onClick={handleLaunch}
                    disabled={isLaunching}
                    className={`h-8.5 px-4 text-[11.5px] font-bold text-white rounded-xl transition-all duration-[120ms] ease-out flex items-center gap-1.5 ${
                      !canLaunch
                        ? 'bg-indigo-600/40 hover:bg-indigo-600/50 cursor-pointer shadow-sm active:scale-[0.98]'
                        : 'bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20 active:scale-[0.98]'
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
        </div>

        {/* ── RIGHT: Live WhatsApp Device Showcase (39% hero showcase) ───────── */}
        <AnimatePresence>
          {showPreview && (
            <motion.aside
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="hidden lg:flex w-[39%] shrink-0 bg-[#f6f7f9] dark:bg-secondary/10 flex-col overflow-hidden shadow-[-1px_0_0_rgba(148,163,184,0.02)]"
            >
              {/* Centered device box with no vertical scrolling */}
              <div className="flex-grow overflow-hidden px-6 xl:px-8 py-8 flex flex-col items-center justify-center">
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

      {/* Recipient sliding panel list */}
      <RecipientDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        recipients={recipientsData.recipients}
        totalRecipients={recipientsData.totalRecipients}
      />

      {/* Safety modal check before dispatch */}
      <LaunchSafetyModal
        isOpen={safetyModalOpen}
        onClose={() => setSafetyModalOpen(false)}
        onConfirm={confirmLaunch}
        templateName={selectedTemplate?.name || 'No Template Selected'}
        recipients={recipientsData.recipients}
        deliveryMode={delivery.mode}
        scheduledAt={delivery.scheduledAt}
        estimatedDuration={estimatedDuration}
        isLaunching={isLaunching}
      />
    </motion.div>
  );
}
