"use client";

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Check, ChevronDown, Megaphone, RefreshCw, Clock, Save, Zap,
  AlertCircle, AlertTriangle, CheckCircle2, Eye, Send, Target,
  Settings2, Bot, Clipboard, ArrowLeft, FlaskConical, Users,
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
const Spinner = ({ size = "sm" }: { size?: "sm" | "md" }) => (
  <RefreshCw className={`animate-spin ${size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"}`} />
);

function AutosaveIndicator({ status, onRetry }: { status: 'idle' | 'saving' | 'saved' | 'failed'; onRetry: () => void }) {
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
            <><span className="text-[11px] text-emerald-600 font-medium">✓ Saved</span></>
          )}
          {status === 'failed' && (
            <>
              <AlertCircle className="w-3 h-3 text-red-500" />
              <span className="text-[11px] text-red-500 font-medium">⊙ Save failed</span>
              <button
                type="button"
                onClick={onRetry}
                className="text-[10px] text-red-600 hover:text-red-700 underline font-semibold ml-1 bg-transparent border-none cursor-pointer"
              >
                Retry
              </button>
            </>
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
  const router = useRouter();

  // ── Global Zustand Store ──────────────────────────────────────────────────
  const {
    campaignId,
    campaignName,
    selectedTemplate,
    variables,
    audience,
    delivery,
    automationRules,
    saveStatus,
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
    setSaveStatus,
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
  const [isTesting, setIsTesting] = useState(false);
  const variableMappingRef = React.useRef<HTMLDivElement>(null);

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

  // ── Helper to resolve tenant ID securely via users table ───────────────────
  const resolveTenantId = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No authenticated user session found');
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('auth_id', user.id)
      .single();
    if (userError || !userData?.tenant_id) {
      throw new Error('No active workspace tenant found for your user account');
    }
    return userData.tenant_id;
  };

  // ── Debounced Draft Autosave ──────────────────────────────────────────────
  const performAutosave = useDebounceCallback(async () => {
    if (!campaignName.trim()) return;
    await saveCampaign();
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

  const mappedCount = React.useMemo(() => {
    return detectedVarIndices.filter(idx => {
      const cfg = variables[idx];
      if (!cfg) return false;
      if (cfg.sourceType === 'static') return !!cfg.staticValue?.trim();
      if (cfg.sourceType === 'crm_field') return !!cfg.crmField;
      if (cfg.sourceType === 'custom') return !!cfg.staticValue?.trim();
      return false;
    }).length;
  }, [detectedVarIndices, variables]);

  const unmappedVariableCount = detectedVarIndices.length - mappedCount;

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

  const getValidationText = () => {
    const firstFail = validationChecks.find(c => c.status === "fail");
    if (!firstFail) return "Launch Ready";
    const msg = firstFail.message || firstFail.label;
    if (msg.toLowerCase().includes("name")) return "Campaign name required";
    if (msg.toLowerCase().includes("template")) return "Template verification required";
    if (msg.toLowerCase().includes("variable")) return "Variable mapping incomplete";
    if (msg.toLowerCase().includes("recipient") || msg.toLowerCase().includes("audience")) return "Audience targets required";
    return msg;
  };

  const getMissingValidationMessage = (): string => {
    const issues: string[] = [];
    if (!campaignName.trim()) issues.push('Campaign name required');
    if (!selectedTemplate) issues.push('No template selected');
    if (unmappedVariableCount > 0) issues.push(`${unmappedVariableCount} variable(s) unmapped`);
    if (estimate.total === 0) issues.push('No audience selected');
    if (selectedTemplate && selectedTemplate.status !== 'APPROVED') issues.push('Template not approved');
    return `Cannot launch: ${issues.join(', ')}`;
  };

  // ── Manual Draft Saving ──────────────────────────────────────────────────────
  const handleSaveDraft = async (showToast: boolean = true) => {
    try {
      console.log('[save] starting');
      setIsSaving(true);
      const res = await fetch(
        '/api/broadcast/campaign',
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            campaignId,
            campaignName,
            templateName:selectedTemplate?.name,
            templateCategory:selectedTemplate?.category,
            deliveryMode:delivery.mode,
            scheduledAt:delivery.scheduledAt,
            audience,
            delivery,
            variables,
            automationRules,
          }),
        }
      );

      const data = await res.json();
      console.log('[save] response', data);
      if (!res.ok) {
        throw new Error(
          data.error || 'Save failed'
        );
      }

      if (!data.campaignId) {
        throw new Error(
          'campaignId missing from save response'
        );
      }

      setCampaignId(data.campaignId);
      console.log(
        '[save] success',
        data.campaignId
      );
      if (showToast) {
        toast.success('Draft saved successfully');
      }
      return data.campaignId;

    } catch (err:any) {
      console.error(
        '[save] FAILED',
        err
      );
      toast.error(
        err.message || 'Save failed'
      );
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // ── Immediate / Scheduled Launching ──────────────────────────────────────────
  const handleLaunch = async () => {
    if (!canLaunch) {
      console.warn('[launch] blocked: canLaunch=false');
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
    try {
      setIsLaunching(true);
      console.log('[launch] starting');

      // STEP 1: save latest campaign state
      const savedCampaignId = await handleSaveDraft(false);
      console.log('[launch] save result', savedCampaignId);

      if (!savedCampaignId) {
        throw new Error('Campaign save failed. No campaignId returned.');
      }

      console.log('[launch] calling API');
      const res = await fetch('/api/broadcast/launch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          campaignId: savedCampaignId
        }),
      });

      const data = await res.json();
      console.log('[launch] API response', data);

      if (!res.ok) {
        throw new Error(data.error || 'Launch failed');
      }

      console.log('[launch] success');
      toast.success(
        `Campaign launched to ${data.totalRecipients || 0} recipients`
      );

      console.log('[redirect] stats page');
      router.push(
        `/dashboard/broadcast/${savedCampaignId}/stats`
      );

    } catch (err: any) {
      console.error('[launch] FAILED', err);
      toast.error(
        err.message || 'Failed to launch campaign'
      );
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
    setIsTesting(true);
    try {
      const res = await fetch('/api/broadcasts/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: selectedTemplate.name,
          languageCode: selectedTemplate.language,
          variables: previewValues
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Test message dispatched successfully!');
      } else {
        toast.error(data.error ?? 'Test dispatch failed');
      }
    } catch {
      toast.error('Test dispatch failed');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="broadcast-page-shell"
    >
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

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="flex items-center gap-2.5"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Megaphone className="w-3.5 h-3.5" />
              </div>
              <h1 className="text-[20px] font-semibold tracking-tight text-foreground leading-none">
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
            <AutosaveIndicator status={saveStatus} onRetry={saveCampaign} />
          </div>
        </div>
      </header>

      {/* MainContentWrapper */}
      <main className="broadcast-main-content-wrapper">
        <div className="broadcast-builder-container flex-1 flex flex-col overflow-hidden">
          <div className="broadcast-main-grid" style={!showPreview ? { gridTemplateColumns: "1fr" } : undefined}>
          <section className="broadcast-left-column space-y-8">
            {/* Section: Template Selection */}
            <div id="section-template" className="space-y-3 text-left">
              <div className="space-y-1">
                <h2 className="text-[16px] font-bold text-foreground tracking-tight">Template Selection</h2>
                <p className="text-[12.5px] text-muted-foreground/80 leading-none">Choose and configure a WhatsApp message template to send.</p>
              </div>
              <div className="border border-border/45 bg-card rounded-[24px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-200 hover:-translate-y-[0.5px]">
                <TemplateSelector
                  templates={templates}
                  selectedTemplate={selectedTemplate}
                  onSelect={(tpl) => {
                    selectTemplate(tpl);
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

            {/* Section: Variables mapping if required */}
            {selectedTemplate && detectedVarIndices.length > 0 && (
              <div ref={variableMappingRef} id="variable-mapping-section" className="space-y-3 text-left pt-2">
                <div className="space-y-1">
                  <h2 className="text-[16px] font-bold text-foreground tracking-tight">Template Variables</h2>
                  <p className="text-[12.5px] text-muted-foreground/80 leading-none">Map the placeholders in your template to static text or CRM data fields.</p>
                </div>
                <div className="border border-border/45 bg-card rounded-[24px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-200 hover:-translate-y-[0.5px]">
                  <VariableMapper
                    bodyText={selectedTemplate.body ?? ""}
                    variables={variables}
                    onChange={setVariables}
                    previewValues={previewValues}
                  />
                </div>
              </div>
            )}

            {/* Section: Audience targeting Cohort options */}
            <div id="section-audience" className="space-y-3 text-left pt-2">
              <div className="space-y-1">
                <h2 className="text-[16px] font-bold text-foreground tracking-tight">Audience</h2>
                <p className="text-[12.5px] text-muted-foreground/80 leading-none">Choose who receives this broadcast.</p>
              </div>
              <div className="border border-border/45 bg-card rounded-[24px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-200 hover:-translate-y-[0.5px]">
                <AudienceBuilder
                  audience={audience}
                  onChange={updateAudience}
                  estimate={estimate}
                  totalContacts={totalContacts}
                  completedCampaigns={allCampaigns.filter(c => c.status === "completed")}
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

            {/* Section: Advanced Delivery and compliance limits */}
            <div id="section-delivery" className="space-y-3 text-left pt-2">
              <div className="space-y-1">
                <h2 className="text-[16px] font-bold text-foreground tracking-tight">Delivery</h2>
                <p className="text-[12.5px] text-muted-foreground/80 leading-none">Control timing and sending behavior.</p>
              </div>
              <div className="border border-border/45 bg-card rounded-[24px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-200 hover:-translate-y-[0.5px]">
                <DeliverySettings
                  config={delivery}
                  onChange={updateDelivery}
                  estimatedDuration={estimatedDuration}
                  audienceCount={estimate.total}
                />
              </div>
            </div>

            {/* Section: Automation and conversational rules */}
            <div id="section-automation" className="space-y-3 text-left pt-2">
              <div className="space-y-1">
                <h2 className="text-[16px] font-bold text-foreground tracking-tight">Automation</h2>
                <p className="text-[12.5px] text-muted-foreground/80 leading-none">Define conversational follow-up rules for responses.</p>
              </div>
              <div className="border border-border/45 bg-card rounded-[24px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-all duration-200 hover:-translate-y-[0.5px]">
                <AutomationRules rules={automationRules} onChange={setAutomationRules} />
              </div>
            </div>

            {/* Section: Stripe style Launch Check Timeline */}
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
                  onSaveDraft={() => handleSaveDraft(true)}
                  onLaunch={handleLaunch}
                  onTestSend={handleTestSend}
                  onDuplicate={() => toast("Duplicate functionality coming soon")}
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

          {showPreview && (
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
                  />
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </main>

      {/* ActionFooter */}
      <footer className="broadcast-action-footer">
        <div className="broadcast-footer-grid">
          {/* LEFT: recipient summary */}
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
                    {delivery.mode === "scheduled" ? (
                      <>
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>Scheduled delivery</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3 shrink-0" />
                        <span>Immediate delivery</span>
                      </>
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

          {/* CENTER: validation */}
          <div className="w-full flex justify-center shrink-0">
            {canLaunch ? (
              <div className="flex items-center justify-center gap-1.5 bg-emerald-500/10 dark:bg-emerald-500/5 border border-emerald-500/20 rounded-full px-3 h-9 max-w-[240px]">
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 truncate">
                  Launch Ready
                </span>
              </div>
            ) : unmappedVariableCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  variableMappingRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  });
                  // Trigger a 1.5s highlight ring pulse
                  variableMappingRef.current?.classList.add('highlight-ring');
                  setTimeout(() => {
                    variableMappingRef.current?.classList.remove('highlight-ring');
                  }, 1500);
                }}
                className="variable-warning-chip flex items-center justify-center gap-1.5 bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/20 hover:border-amber-500/40 rounded-full px-3 h-9 max-w-[240px] text-amber-700 dark:text-amber-400 transition-all font-bold text-[11px] truncate"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
                <span>⚠ Variable mapping incomplete — click to fix</span>
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

          {/* RIGHT: actions */}
          <div className="broadcast-actions-group">
            {/* Save Draft */}
            <button
              type="button"
              onClick={() => handleSaveDraft(true)}
              disabled={isSaving}
              className="save-draft-btn button-nowrap h-10 px-3.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/40 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5"
            >
              {isSaving ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
              Save Draft
            </button>

            {/* Test Campaign */}
            <button
              type="button"
              onClick={handleTestSend}
              disabled={isTesting}
              className="test-campaign-btn button-nowrap h-10 px-3.5 text-[12.5px] font-semibold border border-border bg-background hover:bg-secondary/35 rounded-xl text-foreground transition-all duration-150 flex items-center justify-center gap-1.5"
            >
              {isTesting ? <Spinner size="sm" /> : <FlaskConical className="w-4 h-4" />}
              Test Campaign
            </button>

            {/* Launch — hard-disabled until all validations pass */}
            <button
              type="button"
              onClick={handleLaunch}
              disabled={!canLaunch}
              title={!canLaunch ? getMissingValidationMessage() : undefined}
              className={`launch-btn button-nowrap h-10 px-5 text-[12.5px] font-bold tracking-wide rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 select-none ${
                !canLaunch
                  ? "bg-zinc-150 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-650 border border-zinc-200/50 dark:border-zinc-800/85 cursor-not-allowed opacity-40"
                  : "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-[0_4px_16px_rgba(99,102,241,0.22)] hover:shadow-[0_4px_20px_rgba(99,102,241,0.35)] text-white border border-indigo-500/10"
              }`}
            >
              <Send className="w-3 h-3" />
              {delivery.mode === "scheduled" ? "Schedule" : "Launch"}
            </button>
          </div>
        </div>
      </footer>

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
        templateName={selectedTemplate?.name || "No Template Selected"}
        recipients={recipientsData.recipients}
        deliveryMode={delivery.mode}
        scheduledAt={delivery.scheduledAt}
        estimatedDuration={estimatedDuration}
        isLaunching={isLaunching}
      />
    </motion.div>
  );
}
