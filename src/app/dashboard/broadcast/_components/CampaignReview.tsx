"use client";

import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  LayoutTemplate,
  Gauge,
} from 'lucide-react';
import { ConfidenceScoreCard } from './ConfidenceScoreCard';

interface ValidationCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
}

interface CampaignReviewProps {
  campaignName: string;
  templateName: string | null;
  audienceCount: number;
  variablesValid: boolean;
  quietHoursEnabled: boolean;
  throttleRate: number;
  scheduledAt: string | null;
  onSaveDraft: () => void;
  onLaunch: () => void;
  onTestSend: () => void;
  onDuplicate: () => void;
  isSaving: boolean;
  isLaunching: boolean;
  validationChecks: ValidationCheck[];
  audience: any;
  variables: any;
  detectedVarIndices: string[];
}

function formatScheduledAt(iso: string | null): string {
  if (!iso) return 'Immediately';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', {
    weekday: 'short',
    month:   'short',
    day:     'numeric',
    hour:    'numeric',
    minute:  '2-digit',
    hour12:  true,
  });
}

function calcDuration(audienceCount: number, throttleRate: number): number {
  if (throttleRate <= 0) return 0;
  return Math.ceil(audienceCount / throttleRate);
}

export function CampaignReview({
  campaignName,
  templateName,
  audienceCount,
  variablesValid,
  quietHoursEnabled,
  throttleRate,
  scheduledAt,
  validationChecks,
  audience,
  variables,
  detectedVarIndices
}: CampaignReviewProps) {
  const hasBlocker = validationChecks.some((c) => c.status === 'fail');
  const passCount  = validationChecks.filter((c) => c.status === 'pass').length;
  const estimatedDuration = calcDuration(audienceCount, throttleRate);

  // Grouping checks into beautiful, clean editorial lists (Stripe Pre-flight style)
  const audienceCheck = validationChecks.find(c => c.id === 'audience');
  const varsCheck = validationChecks.find(c => c.id === 'variables');
  const quietCheck = validationChecks.find(c => c.id === 'quiet_hours');
  const scheduleCheck = validationChecks.find(c => c.id === 'schedule');
  const metaCheck = validationChecks.find(c => c.id === 'template_approved');

  // Real campaign object for the Confidence Scorer
  const realCampaign = {
    name: campaignName,
    template_name: templateName || '',
    audience: {
      type: audience?.type || 'all',
      tags: audience?.tags || [],
      customFilters: audience?.customFilters || [],
      retargetCampaignId: audience?.retargetCampaignId || null,
      retargetCondition: audience?.retargetCondition || 'unread',
      retargetDelayDays: audience?.retargetDelayDays || 1,
      manualContactIds: audience?.manualContactIds || [],
      csvFile: audience?.csvFile || null
    },
    delivery: {
      mode: (scheduledAt ? 'scheduled' : 'now') as 'scheduled' | 'now' | 'recurring',
      scheduledAt,
      timezone: 'Asia/Kolkata',
      quietHoursEnabled,
      throttleRate,
      advancedOpen: false
    },
    variables: variables || {}
  };

  // Determine reliability rating
  const reliabilityScore = Math.round(
    ((passCount) / Math.max(1, validationChecks.length)) * 100
  );

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted-foreground/80 font-bold uppercase tracking-widest select-none text-left">
        Campaign Readiness
      </p>

      <div className="border border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-xl rounded-3xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.015)] p-6 space-y-6">
        
        {/* Header Block: Validation State Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-100 dark:border-zinc-850">
          <div className="flex items-start gap-3.5 text-left">
            {hasBlocker ? (
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            )}
            
            <div className="space-y-0.5">
              <h3 className={`text-[16px] font-extrabold tracking-tight ${hasBlocker ? 'text-amber-700 dark:text-amber-500' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {hasBlocker ? '⚠️ Validation required' : '✅ Ready to launch'}
              </h3>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 leading-normal max-w-md">
                {hasBlocker 
                  ? (validationChecks.find(c => c.status === 'fail')?.message || 'Resolve remaining pre-flight blockers to launch.')
                  : 'Campaign passed all pre-flight verification checks.'}
              </p>
            </div>
          </div>

          {/* Reliability Score Badge */}
          <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl p-3 shrink-0 select-none">
            <div className="w-8.5 h-8.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Gauge className="w-4.5 h-4.5" />
            </div>
            <div className="text-left">
              <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-505">
                Reliability Score
              </span>
              <p className="text-[14px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight leading-none mt-0.5">
                {reliabilityScore}% Quality
              </p>
            </div>
          </div>
        </div>

        {/* Simple 4-indicator Checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left border border-border/45 bg-zinc-500/[0.015] dark:bg-zinc-900/10 rounded-2xl p-4 select-none">
          {/* 1. Audience Ready */}
          <div className="flex items-center gap-2.5">
            {audienceCheck?.status === 'pass' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <div className="text-left leading-none">
              <span className="text-[12.5px] font-bold text-foreground block">Audience Ready</span>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                {audienceCheck?.status === 'pass' ? `${audienceCount.toLocaleString()} targets selected` : 'No recipients selected'}
              </span>
            </div>
          </div>

          {/* 2. Template Approved */}
          <div className="flex items-center gap-2.5">
            {metaCheck?.status === 'pass' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <div className="text-left leading-none">
              <span className="text-[12.5px] font-bold text-foreground block">Template Approved</span>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                {metaCheck?.status === 'pass' ? 'WhatsApp template verified' : 'Awaiting verification'}
              </span>
            </div>
          </div>

          {/* 3. Variables Mapped */}
          <div className="flex items-center gap-2.5">
            {varsCheck?.status === 'pass' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <div className="text-left leading-none">
              <span className="text-[12.5px] font-bold text-foreground block">Variables Mapped</span>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                {varsCheck?.status === 'pass' ? 'Variables valid' : 'Variables incomplete'}
              </span>
            </div>
          </div>

          {/* 4. Ready To Launch */}
          <div className="flex items-center gap-2.5">
            {!hasBlocker ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <div className="text-left leading-none">
              <span className="text-[12.5px] font-bold text-foreground block">Ready To Launch</span>
              <span className="text-[10px] text-muted-foreground mt-0.5 block">
                {!hasBlocker ? 'Pre-flight checks passed' : 'Blockers remaining'}
              </span>
            </div>
          </div>
        </div>

        {/* Collapsible Technical Checks */}
        <details className="group border border-border/40 rounded-2xl bg-transparent transition-all select-none">
          <summary className="flex items-center justify-between p-3 text-[12px] font-bold text-muted-foreground hover:text-foreground cursor-pointer outline-none">
            <span>View Technical Checks</span>
            <span className="text-[10px] text-muted-foreground/60 transition-transform duration-200 group-open:rotate-180">▼</span>
          </summary>
          <div className="p-4 pt-0 border-t border-border/30 space-y-4">
            {/* Dynamic Scorer Card */}
            <div className="pt-4">
              <ConfidenceScoreCard
                campaign={realCampaign}
                detectedVarIndices={detectedVarIndices}
                netRecipients={audienceCount}
              />
            </div>

            {/* Checklist requirements grid + compliance metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div className="space-y-2.5">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">Compliance Metrics</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-muted-foreground">Quiet Hours</span>
                    <span className="font-semibold">{quietCheck?.status === 'pass' ? 'Active & Enforced' : 'Disabled'}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-muted-foreground">Throttle Limit</span>
                    <span className="font-semibold">{scheduleCheck?.status === 'pass' ? 'Active & Enforced' : 'Disabled'}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2.5">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">Dispatch Volume</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-muted-foreground">Volume Risk</span>
                    <span className="font-semibold">{audienceCount > 5000 ? 'High Volume' : 'Standard Volume'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </details>

        {/* ── Campaign Launch Summary ── */}
        <div className="pt-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 rounded-2xl p-4 select-none">
            {[
              { icon: LayoutTemplate, label: 'Template name', val: templateName || 'Awaiting template' },
              { icon: Users, label: 'Recipient targets', val: audienceCount > 0 ? `${audienceCount.toLocaleString()} leads` : '—' },
              { icon: Clock, label: 'Scheduled mode', val: formatScheduledAt(scheduledAt) },
              { icon: Gauge, label: 'Estimated duration', val: estimatedDuration > 0 ? `${estimatedDuration} min` : 'Sends immediately' },
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col text-left">
                <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-505 mb-0.5">
                  {item.label}
                </span>
                <span className="text-[12px] font-bold text-zinc-900 dark:text-zinc-100 truncate pr-1">
                  {item.val}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
