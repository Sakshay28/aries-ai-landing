"use client";

import React, { useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  RefreshCw,
  SendHorizontal,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Gauge,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type DeliveryMode = 'now' | 'scheduled' | 'recurring';

interface DeliveryConfig {
  mode: DeliveryMode;
  scheduledAt: string | null; // ISO datetime-local string
  timezone: string;
  quietHoursEnabled: boolean;
  throttleRate: number; // msgs per minute, 100-2000
  advancedOpen: boolean;
}

interface DeliverySettingsProps {
  config: DeliveryConfig;
  onChange: (c: DeliveryConfig) => void;
  estimatedDuration: number; // minutes
  audienceCount: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const TIMEZONES = [
  { value: 'Asia/Kolkata',   label: 'Asia/Kolkata (IST)' },
  { value: 'UTC',            label: 'UTC' },
  { value: 'US/Eastern',     label: 'US/Eastern (ET)' },
  { value: 'US/Pacific',     label: 'US/Pacific (PT)' },
  { value: 'Europe/London',  label: 'Europe/London (GMT/BST)' },
];

const MODES: { id: DeliveryMode; label: string; icon: React.ElementType }[] = [
  { id: 'now',       label: 'Send Now',  icon: SendHorizontal },
  { id: 'scheduled', label: 'Schedule',  icon: Clock          },
  { id: 'recurring', label: 'Recurring', icon: RefreshCw      },
];

// ── Sub-components ────────────────────────────────────────────────────────────

/** A tiny label rendered above form fields */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1.5">
      {children}
    </label>
  );
}

/** Shared input / select class string */
const inputCls =
  'w-full h-9 px-3 bg-background border border-border/70 hover:border-border focus:border-indigo-500/50 rounded-lg text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/50';

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex items-center justify-between gap-3 cursor-pointer select-none"
    >
      <span className="text-[13px] font-medium text-foreground">{label}</span>
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
    </label>
  );
}

// ── Throttle Slider ───────────────────────────────────────────────────────────
function ThrottleSlider({
  value,
  onChange,
  estimatedDuration,
}: {
  value: number;
  onChange: (v: number) => void;
  estimatedDuration: number;
}) {
  const MIN = 100;
  const MAX = 2000;
  const pct = ((value - MIN) / (MAX - MIN)) * 100;

  const safetyLabel =
    value > 1000
      ? { text: 'High Rate — Monitor Carefully', cls: 'text-amber-600 bg-amber-500/10 border-amber-500/20' }
      : value <= 500
      ? { text: 'Safe Rate', cls: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' }
      : { text: 'Moderate Rate', cls: 'text-blue-600 bg-blue-500/10 border-blue-500/20' };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <FieldLabel>Send Throttle</FieldLabel>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${safetyLabel.cls}`}
        >
          {safetyLabel.text}
        </span>
      </div>

      {/* Slider track */}
      <div className="relative pt-1">
        <div className="relative h-2 bg-secondary/70 rounded-full overflow-hidden">
          {/* Gradient fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-150"
            style={{
              width: `${pct}%`,
              background:
                'linear-gradient(90deg, #22c55e 0%, #eab308 50%, #f97316 80%, #ef4444 100%)',
              backgroundSize: '200px 100%',
            }}
          />
        </div>
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={50}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-2"
          aria-label="Throttle rate"
        />
      </div>

      {/* Labels below */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <Gauge className="w-3 h-3 text-indigo-500" />
          <span>
            <span className="font-semibold text-foreground tabular-nums">{value.toLocaleString()}</span> msgs/min
          </span>
        </div>
        <span>
          Est. duration:{' '}
          <span className="font-semibold text-foreground tabular-nums">
            {estimatedDuration > 0 ? `${estimatedDuration} min` : '—'}
          </span>
        </span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function DeliverySettings({
  config,
  onChange,
  estimatedDuration,
  audienceCount,
}: DeliverySettingsProps) {
  const update = (patch: Partial<DeliveryConfig>) => onChange({ ...config, ...patch });

  return (
    <div className="space-y-5">

      {/* ── Segmented Control ───────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-secondary/50 rounded-xl border border-border/50">
        {MODES.map(({ id, label, icon: Icon }) => {
          const active = config.mode === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => update({ mode: id })}
              className={`relative flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-semibold transition-all duration-200 ${
                active
                  ? 'bg-background text-foreground shadow-sm border border-border/60'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-indigo-500' : ''}`} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Mode Panels ─────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">

        {/* SEND NOW */}
        {config.mode === 'now' && (
          <motion.div
            key="now"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-3 px-4 py-3.5 bg-emerald-500/[0.05] border border-emerald-500/20 rounded-xl"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <p className="text-[13px] text-emerald-700 font-medium leading-snug">
              Campaign will start immediately when you launch.
            </p>
          </motion.div>
        )}

        {/* SCHEDULE */}
        {config.mode === 'scheduled' && (
          <motion.div
            key="scheduled"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            {/* Date + Time row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Date</FieldLabel>
                <input
                  type="date"
                  value={config.scheduledAt?.split('T')[0] ?? ''}
                  onChange={(e) => {
                    const timePart = config.scheduledAt?.split('T')[1] ?? '09:00';
                    update({ scheduledAt: `${e.target.value}T${timePart}` });
                  }}
                  className={inputCls}
                />
              </div>
              <div>
                <FieldLabel>Time</FieldLabel>
                <input
                  type="time"
                  value={config.scheduledAt?.split('T')[1] ?? '09:00'}
                  onChange={(e) => {
                    const datePart =
                      config.scheduledAt?.split('T')[0] ??
                      new Date().toISOString().split('T')[0];
                    update({ scheduledAt: `${datePart}T${e.target.value}` });
                  }}
                  className={inputCls}
                />
              </div>
            </div>

            {/* Timezone */}
            <div>
              <FieldLabel>Timezone</FieldLabel>
              <select
                value={config.timezone}
                onChange={(e) => update({ timezone: e.target.value })}
                className={inputCls}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Best Time Recommendation */}
            <div className="flex items-start gap-2.5 px-4 py-3 bg-indigo-500/[0.05] border border-indigo-500/15 rounded-xl">
              <Lightbulb className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
              <p className="text-[12px] text-indigo-700 leading-snug">
                <span className="font-semibold">Best time for Indian audiences:</span> 7–9 PM IST
                — highest open rates for WhatsApp broadcasts.
              </p>
            </div>

            {/* Quiet Hours Toggle */}
            <div
              className={`px-4 py-3.5 rounded-xl border transition-colors ${
                config.quietHoursEnabled
                  ? 'bg-indigo-500/[0.04] border-indigo-500/20'
                  : 'bg-background border-border/60'
              }`}
            >
              <ToggleSwitch
                checked={config.quietHoursEnabled}
                onChange={(v) => update({ quietHoursEnabled: v })}
                label="Quiet Hours Protection"
              />
              <AnimatePresence>
                {config.quietHoursEnabled && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-center gap-2 overflow-hidden"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="text-[12px] text-indigo-600 font-medium">
                      Protected 9 PM → 8 AM — no messages will be sent during these hours.
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* RECURRING */}
        {config.mode === 'recurring' && (
          <motion.div
            key="recurring"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-3 px-4 py-3.5 bg-secondary/40 border border-border/60 rounded-xl"
          >
            <RefreshCw className="w-4 h-4 text-indigo-500 shrink-0" />
            <p className="text-[13px] text-muted-foreground leading-snug">
              Recurring schedules can be configured via the{' '}
              <span className="font-semibold text-foreground">Automation</span> section below.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <div className="border-t border-border/50" />

      {/* ── Throttle Slider ─────────────────────────────────────────────────── */}
      <ThrottleSlider
        value={config.throttleRate}
        onChange={(v) => update({ throttleRate: v })}
        estimatedDuration={estimatedDuration}
      />

      {/* ── Advanced Controls ────────────────────────────────────────────────── */}
      <div className="border border-border/60 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => update({ advancedOpen: !config.advancedOpen })}
          className="w-full flex items-center justify-between px-4 py-3 text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-foreground/[0.02] transition-colors"
        >
          <span>Advanced Controls</span>
          {config.advancedOpen ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        <AnimatePresence>
          {config.advancedOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-1 border-t border-border/50 space-y-3">
                {(
                  [
                    { label: 'Retry failed messages',        key: 'retry'   },
                    { label: 'Pause on >20% failure rate',   key: 'pause'   },
                    { label: 'Daily send cap: 1,000 msgs',   key: 'cap'     },
                  ] as const
                ).map(({ label, key }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2.5 cursor-pointer select-none group"
                  >
                    <input
                      type="checkbox"
                      defaultChecked={key === 'retry'}
                      className="w-3.5 h-3.5 rounded border-border/70 text-indigo-500 accent-indigo-500 cursor-pointer"
                    />
                    <span className="text-[12px] text-muted-foreground group-hover:text-foreground transition-colors">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Audience hint ────────────────────────────────────────────────────── */}
      {audienceCount > 0 && (
        <p className="text-[11px] text-muted-foreground/70 text-center tabular-nums">
          {audienceCount.toLocaleString()} recipients ·{' '}
          {config.throttleRate.toLocaleString()} msgs/min ·{' '}
          est. {estimatedDuration} min to complete
        </p>
      )}
    </div>
  );
}
