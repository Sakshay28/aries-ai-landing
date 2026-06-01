"use client";

import React, { useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  UserCheck,
  MessageSquarePlus,
  BellRing,
  UserMinus,
  RotateCcw,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type TriggerType = 'replied' | 'no_reply' | 'cta_clicked' | 'stop_received' | 'failed';
type ActionType =
  | 'assign_human'
  | 'trigger_flow'
  | 'send_followup'
  | 'notify_email'
  | 'auto_optout'
  | 'retry';

interface AutomationRule {
  id: string;
  trigger: TriggerType;
  action: ActionType;
  delay?: number; // hours
  enabled: boolean;
}

interface AutomationRulesProps {
  rules: AutomationRule[];
  onChange: (rules: AutomationRule[]) => void;
}

// ── Default rules seeded if none provided ─────────────────────────────────────
export const DEFAULT_AUTOMATION_RULES: AutomationRule[] = [
  {
    id: 'rule-replied',
    trigger: 'replied',
    action: 'assign_human',
    enabled: false,
  },
  {
    id: 'rule-no-reply',
    trigger: 'no_reply',
    action: 'send_followup',
    delay: 24,
    enabled: false,
  },
  {
    id: 'rule-cta-clicked',
    trigger: 'cta_clicked',
    action: 'notify_email',
    enabled: false,
  },
  {
    id: 'rule-stop',
    trigger: 'stop_received',
    action: 'auto_optout',
    enabled: true,
  },
];

// ── Label maps ────────────────────────────────────────────────────────────────
const TRIGGER_LABELS: Record<TriggerType, { text: string; icon: React.ElementType }> = {
  replied:       { text: 'If replied',             icon: MessageSquarePlus },
  no_reply:      { text: 'If no reply in 24h',     icon: RotateCcw         },
  cta_clicked:   { text: 'If CTA clicked',          icon: Zap               },
  stop_received: { text: 'If STOP received',        icon: UserMinus         },
  failed:        { text: 'If delivery failed',      icon: BellRing          },
};

const ACTION_LABELS: Record<ActionType, string> = {
  assign_human:  'Assign to human agent',
  trigger_flow:  'Trigger automation flow',
  send_followup: 'Send follow-up message',
  notify_email:  'Notify sales team by email',
  auto_optout:   'Auto opt-out contact',
  retry:         'Retry delivery',
};

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function RuleToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 shrink-0 ${
        checked ? 'bg-indigo-500' : 'bg-border'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Single Rule Card ──────────────────────────────────────────────────────────
function RuleRow({
  rule,
  onToggle,
  isLast,
}: {
  rule: AutomationRule;
  onToggle: (id: string, enabled: boolean) => void;
  isLast: boolean;
}) {
  const triggerDef = TRIGGER_LABELS[rule.trigger];
  const TriggerIcon = triggerDef.icon;
  const actionLabel = ACTION_LABELS[rule.action];

  return (
    <div
      className={`flex items-center gap-4 py-3.5 px-4 transition-colors ${
        rule.enabled ? 'bg-indigo-500/[0.025]' : ''
      } ${!isLast ? 'border-b border-border/50' : ''}`}
    >
      {/* Trigger + Action */}
      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <TriggerIcon
            className={`w-3.5 h-3.5 shrink-0 ${
              rule.enabled ? 'text-indigo-500' : 'text-muted-foreground/50'
            }`}
          />
          <span
            className={`text-[13px] font-semibold ${
              rule.enabled ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {triggerDef.text}
          </span>
        </div>

        <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />

        <div className="flex items-center gap-1.5">
          <UserCheck
            className={`w-3.5 h-3.5 shrink-0 ${
              rule.enabled ? 'text-foreground/60' : 'text-muted-foreground/40'
            }`}
          />
          <span
            className={`text-[13px] ${
              rule.enabled ? 'text-foreground/80' : 'text-muted-foreground/60'
            }`}
          >
            {actionLabel}
          </span>
        </div>

        {rule.delay !== undefined && rule.delay > 0 && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-secondary/80 text-muted-foreground rounded-md border border-border/50 whitespace-nowrap">
            after {rule.delay}h
          </span>
        )}
      </div>

      {/* Toggle */}
      <RuleToggle
        checked={rule.enabled}
        onChange={(v) => onToggle(rule.id, v)}
      />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function AutomationRules({ rules, onChange }: AutomationRulesProps) {
  const [open, setOpen] = React.useState(false);

  const enabledCount = rules.filter((r) => r.enabled).length;

  const handleToggle = (id: string, enabled: boolean) => {
    onChange(rules.map((r) => (r.id === id ? { ...r, enabled } : r)));
  };

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden bg-card">

      {/* ── Section Header ──────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-foreground/[0.02] transition-colors group"
      >
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
            <Zap className="w-3.5 h-3.5 text-indigo-500" />
          </div>

          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-foreground">
                Post-Broadcast Automation
              </span>
              {/* Optional badge */}
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-secondary/80 text-muted-foreground border border-border/60">
                Optional
              </span>
            </div>
            {/* Active count hint */}
            {enabledCount > 0 && (
              <p className="text-[11px] text-indigo-600 font-medium mt-0.5">
                {enabledCount} rule{enabledCount > 1 ? 's' : ''} active
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {enabledCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">
              {enabledCount}
            </span>
          )}
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground/60" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground/60" />
          )}
        </div>
      </button>

      {/* ── Expandable Content ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="automation-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/50">
              {/* Hint row */}
              <div className="px-4 py-2.5 bg-secondary/20 border-b border-border/40">
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Enable rules to automatically respond to contact behaviour after the broadcast is sent.
                </p>
              </div>

              {/* Rules list */}
              <div>
                {rules.map((rule, i) => (
                  <motion.div
                    key={rule.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.18, delay: i * 0.04 }}
                  >
                    <RuleRow
                      rule={rule}
                      onToggle={handleToggle}
                      isLast={i === rules.length - 1}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
