'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Save, Send, X, Loader2, AlertTriangle } from 'lucide-react';
import type { TemplateFormState, AutosaveState } from './types';
import { DEFAULT_FORM_STATE } from './constants';
import WhatsAppPreview from './WhatsAppPreview';
import ValidationPanel, { validateTemplate } from './ValidationPanel';
import StatusBadge from './StatusBadge';
import CategoryStep from './sections/CategoryStep';
import BasicsStep from './sections/BasicsStep';
import HeaderSection from './sections/HeaderSection';
import BodyEditor from './sections/BodyEditor';
import FooterSection from './sections/FooterSection';
import ButtonBuilder from './sections/ButtonBuilder';
import AuthStep from './sections/AuthStep';

type Step = 'category' | 'basics' | 'content' | 'review';

const STEPS: { id: Step; label: string }[] = [
  { id: 'category', label: 'Choose Type' },
  { id: 'basics', label: 'Configure Template' },
  { id: 'content', label: 'Preview & Test' },
  { id: 'review', label: 'Submit to Meta' },
];

interface Props {
  initial?: Partial<TemplateFormState>;
  onClose: () => void;
  onSaved: () => void;
  existingNames?: string[]; // passed from page context
}

export default function TemplateStudio({ initial, onClose, onSaved, existingNames = [] }: Props) {
  const [state, setState] = useState<TemplateFormState>({ ...DEFAULT_FORM_STATE, ...initial });
  const [step, setStep] = useState<Step>('category');
  const [autosave, setAutosave] = useState<AutosaveState>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false); // mobile toggle

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const issues = validateTemplate(state);
  const errors = issues.filter((i) => i.severity === 'error');
  const hasErrors = errors.length > 0;

  const onChange = useCallback((updates: Partial<TemplateFormState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Autosave (draft) — debounced 1.5s after any field change
  useEffect(() => {
    if (!state.normalizedName && !state.body) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setAutosave('saving');

    autosaveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/dashboard/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...stateToPayload(state),
            saveDraftOnly: true,
            localDraftId: state.localDraftId,
          }),
        });
        const json = await res.json() as { success: boolean; localDraftId?: string };
        if (json.success && json.localDraftId && !state.localDraftId) {
          setState((prev) => ({ ...prev, localDraftId: json.localDraftId }));
        }
        setAutosave('saved');
        setTimeout(() => setAutosave('idle'), 2000);
      } catch {
        setAutosave('error');
      }
    }, 1500);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.name, state.body, state.footer, state.buttons, state.headerText, state.headerMediaUrl, state.headerType, state.category, state.language, state.variableMap]);

  const handleSubmit = async () => {
    if (hasErrors) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/dashboard/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...stateToPayload(state),
          saveDraftOnly: false,
          localDraftId: state.localDraftId,
        }),
      });

      const json = await res.json() as {
        success: boolean;
        error?: string;
        data?: { metaTemplateId?: string; status?: string };
        localDraftId?: string;
      };

      if (!json.success) {
        setSubmitError(json.error ?? 'Submission failed. Please try again.');
        return;
      }

      // Update state with returned Meta data
      setState((prev) => ({
        ...prev,
        status: (json.data?.status as TemplateFormState['status']) ?? 'PENDING',
        metaTemplateId: json.data?.metaTemplateId,
        localDraftId: json.localDraftId ?? prev.localDraftId,
      }));

      onSaved();
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      setAutosave('saving');
      const res = await fetch('/api/dashboard/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...stateToPayload(state),
          saveDraftOnly: true,
          localDraftId: state.localDraftId,
        }),
      });
      const json = await res.json() as { success: boolean; localDraftId?: string };
      if (json.success) {
        if (json.localDraftId) setState((prev) => ({ ...prev, localDraftId: json.localDraftId }));
        setAutosave('saved');
        setTimeout(() => setAutosave('idle'), 2000);
      }
    } catch {
      setAutosave('error');
    }
  };

  const currentStepIdx = STEPS.findIndex((s) => s.id === step);
  const canGoNext = step !== 'review';
  const canGoPrev = currentStepIdx > 0;

  const AutosaveIndicator = () => (
    <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium select-none">
      {autosave === 'saving' && <><Loader2 className="w-3 h-3 animate-spin text-primary" /> Saving...</>}
      {autosave === 'saved' && <span className="text-emerald-500 font-semibold">✓ Autosaved</span>}
      {autosave === 'error' && <span className="text-red-400 font-semibold">⚠ Draft unsaved</span>}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Studio panel drawer */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className="relative ml-auto w-full max-w-5xl bg-background border-l border-border shadow-2xl flex flex-col h-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Sticky Header Row ── */}
        <div className="flex items-center gap-4 px-6 h-16 border-b border-border shrink-0 bg-background/95 backdrop-blur z-20">
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Close Builder"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex-1 flex items-center gap-3 min-w-0 mr-2">
            <h2 className="text-sm font-bold text-foreground truncate select-none leading-none">
              {state.name || 'Untitled Template'}
            </h2>
            <StatusBadge status={state.status} />
            <AutosaveIndicator />
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleSaveDraft}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-all active:scale-[0.98]"
            >
              <Save className="w-3.5 h-3.5" />
              Save Draft
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || hasErrors}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm shadow-emerald-600/10 active:scale-[0.98]"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Submit to Meta
            </button>
          </div>
        </div>

        {/* ── Dedicated Stepper Navigation Sub-Bar (Stripe/Vercel Onboarding) ── */}
        <div className="flex items-center justify-center border-b border-border shrink-0 bg-muted/10 py-3 px-6 z-10 select-none">
          <div className="flex items-center gap-6 select-none bg-muted/40 border border-border/60 px-5 py-2 rounded-2xl shadow-inner max-w-full overflow-x-auto custom-scrollbar">
            {STEPS.map((s, i) => {
              const stepIdx = STEPS.findIndex((x) => x.id === s.id);
              const activeIdx = STEPS.findIndex((x) => x.id === step);
              
              const isActive = step === s.id;

              // Structural checks for stepper checklist icons
              let isStepFinished = false;
              if (s.id === 'category') isStepFinished = !!state.category;
              if (s.id === 'basics') isStepFinished = !!state.name.trim() && !errors.some((e) => e.field === 'name');
              if (s.id === 'content') isStepFinished = !!state.body.trim() && !errors.some((e) => e.field === 'body');
              if (s.id === 'review') isStepFinished = issues.length === 0;

              return (
                <div key={s.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(s.id)}
                    className="flex items-center gap-1.5 group transition-all text-xs font-semibold"
                  >
                    {/* Ring indicator */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold border transition-all ${
                      isActive
                        ? 'bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20 scale-105'
                        : isStepFinished
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 dark:bg-emerald-500/20'
                        : 'bg-card border-border/80 text-muted-foreground group-hover:text-foreground group-hover:border-border'
                    }`}>
                      {isStepFinished ? '✓' : i + 1}
                    </div>

                    {/* Step label text */}
                    <span className={`transition-colors text-[11px] ${
                      isActive
                        ? 'text-foreground font-extrabold'
                        : isStepFinished
                        ? 'text-foreground/80 font-semibold hover:text-foreground'
                        : 'text-muted-foreground group-hover:text-foreground font-semibold'
                    }`}>
                      {s.label}
                    </span>
                  </button>

                  {/* Divider line connector */}
                  {i < STEPS.length - 1 && (
                    <div className="w-4 h-[1px] bg-border/80 shrink-0 mx-0.5 rounded" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Body Layout: Split Screen ── */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* LEFT COLUMN: BUILDER (65%) */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" style={{ flex: '65' }}>
            
            {/* Mobile layout preview toggle bar */}
            <div className="lg:hidden flex items-center justify-between p-3 bg-muted/40 border border-border/80 rounded-xl mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Mockup Preview</span>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs font-bold text-primary hover:underline"
              >
                {showPreview ? 'Hide Live Bubble' : 'Show Live Bubble'}
              </button>
            </div>

            {/* Mobile floating responsive mockup preview drawer */}
            <AnimatePresence>
              {showPreview && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="lg:hidden overflow-hidden bg-card border border-border rounded-2xl p-4 shadow-sm"
                >
                  <WhatsAppPreview state={state} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Step 1: Category selections */}
            <Section
              title="1. Category & Subtype"
              isActive={step === 'category'}
              onClick={() => setStep('category')}
            >
              <CategoryStep state={state} onChange={onChange} />
            </Section>

            {/* Step 2: Basic configs */}
            <Section
              title="2. Template Name & Language"
              isActive={step === 'basics'}
              onClick={() => setStep('basics')}
            >
              <BasicsStep state={state} onChange={onChange} existingNames={existingNames} />
            </Section>

            {/* Step 3: Body editor builders */}
            {state.category !== 'AUTHENTICATION' ? (
              <Section
                title="3. Message Content Editor"
                isActive={step === 'content'}
                onClick={() => setStep('content')}
              >
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                      Media Header (Optional)
                    </label>
                    <HeaderSection state={state} onChange={onChange} />
                  </div>
                  
                  <div className="h-px bg-border/60" />
                  
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                      Message Body Content <span className="text-red-500">*</span>
                    </label>
                    <BodyEditor state={state} onChange={onChange} />
                  </div>
                  
                  <div className="h-px bg-border/60" />
                  
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                      Footer Text (Optional)
                    </label>
                    <FooterSection state={state} onChange={onChange} />
                  </div>
                  
                  <div className="h-px bg-border/60" />
                  
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-2">
                      Interactive Buttons
                    </label>
                    <ButtonBuilder state={state} onChange={onChange} />
                  </div>
                </div>
              </Section>
            ) : (
              <Section
                title="3. Authentication Parameters"
                isActive={step === 'content'}
                onClick={() => setStep('content')}
              >
                <AuthStep state={state} onChange={onChange} />
              </Section>
            )}

            {/* Step 4: Submission and scoring dashboards */}
            <Section
              title="4. Review & Health Analysis"
              isActive={step === 'review'}
              onClick={() => setStep('review')}
            >
              <div className="space-y-4">
                <ValidationPanel state={state} issues={issues} />

                {submitError && (
                  <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 shadow-sm animate-pulse">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-red-700 dark:text-red-300">Meta Submission Blocked</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{submitError}</p>
                    </div>
                  </div>
                )}

                {state.status === 'PENDING' && (
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-sm">
                    <p className="font-bold text-amber-600 dark:text-amber-400">Template Submitted — Reviewing</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Meta reviewers process submissions via automated AI testing and human auditors. Status updates usually sync under 30 minutes.
                    </p>
                  </div>
                )}

                {state.status === 'APPROVED' && (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-sm">
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">✓ Template Approved by Meta</p>
                    <p className="text-xs text-muted-foreground mt-1">This template is officially deployed and active for broadcast automation campaigns.</p>
                  </div>
                )}

                {state.status === 'REJECTED' && state.rejectionReason && (
                  <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 space-y-2">
                    <p className="text-sm font-bold text-red-600 dark:text-red-400">Meta Review Rejected</p>
                    <p className="text-xs text-muted-foreground">Reason: {state.rejectionReason}</p>
                    <p className="text-xs text-muted-foreground">
                      Fix the highlighted health score structural errors above and tap <strong>Submit to Meta</strong> to prompt resubmission.
                    </p>
                  </div>
                )}
              </div>
            </Section>

            {/* Stepper bottom navigation footer row */}
            <div className="flex items-center justify-between pt-4 pb-8 border-t border-border/40 select-none">
              <button
                type="button"
                onClick={() => setStep(STEPS[currentStepIdx - 1]?.id ?? step)}
                disabled={!canGoPrev}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous Step
              </button>
              
              {canGoNext && (
                <button
                  type="button"
                  onClick={() => setStep(STEPS[currentStepIdx + 1]?.id ?? step)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
                >
                  Continue
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: STICKY LIVE MOCKUP PREVIEW (35%) */}
          <div
            className="hidden lg:flex flex-col border-l border-border bg-muted/20 overflow-y-auto p-5 custom-scrollbar"
            style={{ flex: '35', minWidth: 320 }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-1.5 select-none">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Smartphone Mockup
            </p>
            <WhatsAppPreview state={state} />
          </div>

        </div>
      </motion.div>
    </div>
  );
}

// ── Accordion Collapsible Panel Wrapper ────────
function Section({
  title,
  isActive,
  onClick,
  children,
}: {
  title: string;
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border transition-all ${isActive ? 'border-primary/30 bg-card shadow-sm' : 'border-border bg-card/40'}`}>
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center justify-between px-5 py-4 text-left select-none"
      >
        <span className={`text-xs font-bold uppercase tracking-wider ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
          {title}
        </span>
        <ChevronRight className={`w-4 h-4 transition-transform ${isActive ? 'rotate-90 text-primary' : 'text-muted-foreground/40'}`} />
      </button>
      <AnimatePresence initial={false}>
        {isActive && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Form State to payload mapping ─────────────
function stateToPayload(state: TemplateFormState) {
  return {
    name: state.name,
    normalizedName: state.normalizedName,
    category: state.category,
    subtype: state.subtype,
    language: state.language,
    headerType: state.headerType,
    headerText: state.headerText,
    headerMediaUrl: state.headerMediaUrl,
    bodyText: state.body,
    footer: state.footer,
    buttons: state.buttons,
    variableMap: state.variableMap,
    otpMode: state.otpMode,
    securityRecommendation: state.securityRecommendation,
    validityPeriod: state.validityPeriod,
  };
}
