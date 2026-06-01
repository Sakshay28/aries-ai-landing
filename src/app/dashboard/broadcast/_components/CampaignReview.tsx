"use client";

import React from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  FileText,
  Copy,
  FlaskConical,
  Loader2,
  Clock,
  Users,
  LayoutTemplate,
  Gauge,
} from 'lucide-react';

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

// ── Validation Check Row ──────────────────────────────────────────────────────
function CheckRow({
  check,
  index,
}: {
  check: ValidationCheck;
  index: number;
}) {
  const cfg = {
    pass: {
      icon:    CheckCircle2,
      iconCls: 'text-emerald-500',
      textCls: 'text-muted-foreground',
      msgCls:  'text-muted-foreground/70',
    },
    fail: {
      icon:    XCircle,
      iconCls: 'text-red-500',
      textCls: 'text-red-600 font-semibold',
      msgCls:  'text-red-500/80',
    },
    warn: {
      icon:    AlertTriangle,
      iconCls: 'text-amber-500',
      textCls: 'text-amber-700',
      msgCls:  'text-amber-600/80',
    },
  }[check.status];

  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
      className="flex items-start gap-2.5 py-2"
    >
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${cfg.iconCls}`} />
      <div className="flex-1 min-w-0">
        <span className={`text-[12px] ${cfg.textCls}`}>{check.label}</span>
        {check.message && (
          <p className={`text-[11px] mt-0.5 leading-snug ${cfg.msgCls}`}>
            {check.message}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Summary Row ───────────────────────────────────────────────────────────────
function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2 text-muted-foreground min-w-0">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[12px]">{label}</span>
      </div>
      <div className="text-[12px] font-semibold text-foreground text-right">{value}</div>
    </div>
  );
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
      className="flex-1 flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold border border-border/70 bg-background text-muted-foreground hover:text-foreground hover:border-border hover:bg-foreground/[0.02] transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none"
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function CampaignReview({
  campaignName,
  templateName,
  audienceCount,
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

  return (
    <div className="border-l-4 border-indigo-500 bg-card rounded-2xl border border-border/60 overflow-hidden shadow-sm">

      {/* ── Card Header ─────────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 border-b border-border/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
              Campaign Review
            </h3>
            {campaignName && (
              <p className="text-[12px] text-muted-foreground mt-0.5 truncate max-w-[260px]">
                {campaignName}
              </p>
            )}
          </div>
          {/* Progress pill */}
          <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/60 border border-border/50">
            <span
              className={`text-[11px] font-bold tabular-nums ${
                hasBlocker ? 'text-red-500' : 'text-emerald-600'
              }`}
            >
              {passCount}/{validationChecks.length}
            </span>
            <span className="text-[10px] text-muted-foreground">checks</span>
          </div>
        </div>
      </div>

      {/* ── Compliance Checklist ─────────────────────────────────────────────── */}
      {validationChecks.length > 0 && (
        <div className="px-5 py-4 border-b border-border/50">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2">
            Pre-launch Checks
          </p>
          <div className="divide-y divide-border/30">
            {validationChecks.map((check, i) => (
              <CheckRow key={check.id} check={check} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── Campaign Summary ─────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-border/50">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2">
          Summary
        </p>
        <div>
          <SummaryRow
            icon={LayoutTemplate}
            label="Template"
            value={
              templateName ? (
                <span className="truncate max-w-[180px] inline-block">{templateName}</span>
              ) : (
                <span className="text-red-500 font-medium">Not selected</span>
              )
            }
          />
          <SummaryRow
            icon={Users}
            label="Audience"
            value={
              audienceCount > 0 ? (
                <span className="tabular-nums">{audienceCount.toLocaleString()} contacts</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            }
          />
          <SummaryRow
            icon={Clock}
            label="Schedule"
            value={formatScheduledAt(scheduledAt)}
          />
          <SummaryRow
            icon={Gauge}
            label="Est. duration"
            value={
              estimatedDuration > 0 ? (
                <span className="tabular-nums">{estimatedDuration} min</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            }
          />
        </div>
      </div>

      {/* ── Action Buttons ───────────────────────────────────────────────────── */}
      <div className="px-5 py-4 space-y-3">

        {/* Primary: Launch */}
        <motion.button
          type="button"
          onClick={onLaunch}
          disabled={hasBlocker || isLaunching}
          whileTap={!hasBlocker && !isLaunching ? { scale: 0.98 } : {}}
          className={`w-full flex items-center justify-center gap-2 h-11 rounded-xl text-[14px] font-semibold transition-all duration-200 ${
            hasBlocker
              ? 'bg-muted text-muted-foreground/40 cursor-not-allowed border border-border/60'
              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/30'
          }`}
        >
          {isLaunching ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Launching...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Launch Campaign
            </>
          )}
        </motion.button>

        {/* Blocker hint */}
        {hasBlocker && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[11px] text-red-500 text-center font-medium"
          >
            Fix all failed checks before launching.
          </motion.p>
        )}

        {/* Secondary row */}
        <div className="flex items-center gap-2">
          <OutlinedButton
            onClick={onSaveDraft}
            disabled={isSaving}
            icon={isSaving ? Loader2 : FileText}
          >
            {isSaving ? 'Saving...' : 'Save Draft'}
          </OutlinedButton>

          <OutlinedButton
            onClick={onTestSend}
            disabled={isLaunching}
            icon={FlaskConical}
          >
            Test Send
          </OutlinedButton>

          <OutlinedButton
            onClick={onDuplicate}
            disabled={isLaunching}
            icon={Copy}
          >
            Duplicate
          </OutlinedButton>
        </div>
      </div>
    </div>
  );
}
