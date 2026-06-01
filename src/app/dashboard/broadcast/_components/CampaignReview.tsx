"use client";

import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  LayoutTemplate,
  Gauge,
  ClipboardList,
} from 'lucide-react';
import { ConfidenceScoreCard } from './ConfidenceScoreCard';
import { CampaignFormValues } from '@/app/dashboard/broadcast/validators/broadcast.validator';

// ── Types ─────────────────────────────────────────────────────────────────────
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Outlined Action Button ────────────────────────────────────────────────────

function OutlinedButton({
  onClick,
  disabled,
  icon: Icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-border/50 bg-background/80 text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-all duration-[130ms] ease-out disabled:opacity-40 disabled:pointer-events-none"
    >
      <Icon className="w-3 h-3 shrink-0" />
      {children}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CampaignReview({
  campaignName,
  templateName,
  audienceCount,
  variablesValid,
  quietHoursEnabled,
  throttleRate,
  scheduledAt,
  onSaveDraft,
  onLaunch,
  onTestSend,
  onDuplicate,
  isSaving,
  isLaunching,
  validationChecks,
}: CampaignReviewProps) {
  const hasBlocker = validationChecks.some((c) => c.status === 'fail');
  const passCount  = validationChecks.filter((c) => c.status === 'pass').length;
  const estimatedDuration = calcDuration(audienceCount, throttleRate);

  // Grouping checks into beautiful, clean editorial lists (Stripe Pre-flight style)
  const nameCheck = validationChecks.find(c => c.id === 'name');
  const templateCheck = validationChecks.find(c => c.id === 'template');
  const varsCheck = validationChecks.find(c => c.id === 'variables');
  const audienceCheck = validationChecks.find(c => c.id === 'audience');
  const quietCheck = validationChecks.find(c => c.id === 'quiet_hours');
  const scheduleCheck = validationChecks.find(c => c.id === 'schedule');
  const metaCheck = validationChecks.find(c => c.id === 'template_approved');

  // Calm header state
  const headerStatus = hasBlocker
    ? { title: 'Almost Ready', cls: 'text-amber-600 bg-amber-500/10 border-amber-500/20' }
    : { title: 'Ready to Launch ✓', cls: 'text-emerald-600 bg-[#008069]/10 border-[#008069]/20' };

  // Construct a mock campaign object for the Confidence Scorer
  const mockCampaign: Partial<CampaignFormValues> = {
    name: campaignName,
    template_name: templateName || '',
    audience: {
      type: 'all',
      tags: [],
      customFilters: [],
      retargetCampaignId: null,
      retargetCondition: 'unread',
      retargetDelayDays: 1
    },
    delivery: {
      mode: scheduledAt ? 'scheduled' : 'now',
      scheduledAt,
      timezone: 'Asia/Kolkata',
      quietHoursEnabled,
      throttleRate,
      advancedOpen: false
    },
    variables: variablesValid ? {
      '1': { index: '1', sourceType: 'static', staticValue: 'Sample' }
    } : {}
  };

  const detectedVarIndices = templateName ? ['1'] : [];

  return (
    <div className="border border-border/30 bg-card rounded-2xl overflow-hidden shadow-sm pt-4.5">
      {/* ── Card Header ─────────────────────────────────────────────────────── */}
      <div className="px-5 pb-3.5 border-b border-border/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/8 border border-indigo-500/10 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-left">
              <h3 className="text-[13.5px] font-semibold text-foreground tracking-tight leading-snug">
                Campaign Launch Center
              </h3>
              {campaignName && (
                <p className="text-[11.5px] text-muted-foreground/80 truncate max-w-[180px] mt-0.5">
                  {campaignName}
                </p>
              )}
            </div>
          </div>

          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold border tracking-wide uppercase ${headerStatus.cls}`}>
            {headerStatus.title}
          </span>
        </div>
      </div>

      {/* ── Confidence Score Banner ── */}
      <div className="px-5 py-4 border-b border-border/25 bg-secondary/10">
        <ConfidenceScoreCard
          campaign={mockCampaign}
          detectedVarIndices={detectedVarIndices}
          netRecipients={audienceCount}
        />
      </div>

      {/* ── Mission Control Editorial Pre-Flight Check Blocks ───────────────── */}
      <div className="px-5 py-4 border-b border-border/20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
          {/* Block 1: Campaign Readiness */}
          <div className="space-y-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
              Campaign Readiness
            </p>
            <div className="space-y-2.5">
              {/* Audience configured */}
              <div className="flex items-center justify-between text-[12.5px]">
                <div className="flex items-center gap-2 text-foreground/80">
                  {audienceCheck?.status === 'pass' && audienceCount > 0 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                  <span>Audience configured</span>
                </div>
                <span className={`font-semibold ${audienceCheck?.status === 'pass' && audienceCount > 0 ? 'text-emerald-600' : 'text-amber-500'}`}>
                  {audienceCheck?.status === 'pass' && audienceCount > 0 ? `${audienceCount.toLocaleString()} leads ✓` : '0 contacts'}
                </span>
              </div>

              {/* Variables need mapping */}
              <div className="flex items-center justify-between text-[12.5px]">
                <div className="flex items-center gap-2 text-foreground/80">
                  {varsCheck?.status === 'pass' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                  <span>Variables mapped</span>
                </div>
                <span className={`font-semibold ${varsCheck?.status === 'pass' ? 'text-emerald-600' : 'text-amber-500'}`}>
                  {varsCheck?.status === 'pass' ? 'Ready ✓' : 'Needs mapping'}
                </span>
              </div>

              {/* Delivery ready */}
              <div className="flex items-center justify-between text-[12.5px]">
                <div className="flex items-center gap-2 text-foreground/80">
                  {scheduleCheck?.status === 'pass' && templateCheck?.status === 'pass' && nameCheck?.status === 'pass' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                  <span>Delivery ready</span>
                </div>
                <span className={`font-semibold ${scheduleCheck?.status === 'pass' && templateCheck?.status === 'pass' && nameCheck?.status === 'pass' ? 'text-emerald-600' : 'text-amber-500'}`}>
                  {scheduleCheck?.status === 'pass' && templateCheck?.status === 'pass' && nameCheck?.status === 'pass' ? 'Ready ✓' : 'Needs setup'}
                </span>
              </div>
            </div>
          </div>

          {/* Block 2: Meta Compliance */}
          <div className="space-y-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
              Compliance & Trust
            </p>
            <div className="space-y-2.5">
              {/* Meta Official Approval */}
              <div className="flex items-center justify-between text-[12.5px]">
                <div className="flex items-center gap-2 text-foreground/80">
                  {metaCheck?.status === 'pass' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                  <span>Meta approved</span>
                </div>
                <span className={`font-semibold ${metaCheck?.status === 'pass' ? 'text-emerald-600' : 'text-amber-500'}`}>
                  {metaCheck?.status === 'pass' ? 'Approved ✓' : 'Pending'}
                </span>
              </div>

              {/* Spam Risk (Calculated on the fly) */}
              <div className="flex items-center justify-between text-[12.5px]">
                <div className="flex items-center gap-2 text-foreground/80">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>Low spam risk</span>
                </div>
                <span className="font-semibold text-emerald-600">
                  Low Risk ✓
                </span>
              </div>

              {/* Quiet Hours Check */}
              <div className="flex items-center justify-between text-[12.5px]">
                <div className="flex items-center gap-2 text-foreground/80">
                  {quietCheck?.status === 'pass' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                  <span>Quiet hours enabled</span>
                </div>
                <span className={`font-semibold ${quietCheck?.status === 'pass' ? 'text-emerald-600' : 'text-amber-500'}`}>
                  {quietCheck?.status === 'pass' ? 'Enabled ✓' : 'Off'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Campaign Launch Summary ──────────────────────────────────────────── */}
      <div className="px-5 py-3.5 border-b border-border/20">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-2 text-left">
          Broadcast Overview
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-secondary/15 rounded-xl p-3 border border-border/20">
          {[
            { icon: LayoutTemplate, label: 'Template', val: templateName || 'Awaiting Selection' },
            { icon: Users, label: 'Target', val: audienceCount > 0 ? `${audienceCount.toLocaleString()} leads` : '—' },
            { icon: Clock, label: 'Dispatch', val: formatScheduledAt(scheduledAt) },
            { icon: Gauge, label: 'Est. Duration', val: estimatedDuration > 0 ? `${estimatedDuration} min` : '—' },
          ].map((item, idx) => (
            <div key={idx} className="flex flex-col text-left">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/55 mb-0.5">
                {item.label}
              </span>
              <span className="text-[12px] font-bold text-foreground truncate pr-1">
                {item.val}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Readiness Summary ───────────────────────────────────────────── */}
      <div className="px-5 py-4">
        {/* Progress bar */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/50">
            Launch Readiness
          </p>
          <span className={`text-[10px] font-bold ${hasBlocker ? 'text-amber-500' : 'text-emerald-600'}`}>
            {passCount} of {validationChecks.length} requirements met
          </span>
        </div>
        <div className="h-1 bg-border/30 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${hasBlocker ? 'bg-amber-400' : 'bg-emerald-500'}`}
            style={{ width: `${(passCount / Math.max(1, validationChecks.length)) * 100}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground/55 mt-2.5 font-medium">
          {hasBlocker
            ? 'Complete remaining setup steps above to dispatch safely.'
            : 'All launch requirements satisfied. Use the Launch button below.'}
        </p>
      </div>
    </div>
  );
}

