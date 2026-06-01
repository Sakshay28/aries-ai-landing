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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
      {children}
    </label>
  );
}

const inputCls =
  'w-full h-9.5 px-3.5 bg-background border border-border/70 hover:border-border focus:border-indigo-500/50 rounded-lg text-[13px] text-foreground outline-none transition-all placeholder:text-muted-foreground/40';

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
      <span className="text-[12.5px] font-bold text-foreground">{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors duration-200 shrink-0 ${
          checked ? 'bg-indigo-600' : 'bg-border/70'
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
      ? { text: 'High Send Speed', cls: 'text-amber-600 bg-amber-500/10 border-amber-500/20' }
      : value <= 500
      ? { text: 'Optimal Safe Speed', cls: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' }
      : { text: 'Moderate Speed', cls: 'text-blue-600 bg-blue-500/10 border-blue-500/20' };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <FieldLabel>Delivery Speed</FieldLabel>
        <span
          className={`text-[9.5px] font-bold px-2.5 py-0.5 rounded-full border tracking-wide uppercase ${safetyLabel.cls}`}
        >
          {safetyLabel.text}
        </span>
      </div>

      {/* Slider track */}
      <div className="relative pt-1">
        <div className="relative h-2 bg-secondary/80 rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-150"
            style={{
              width: `${pct}%`,
              background:
                'linear-gradient(90deg, #22c55e 0%, #eab308 50%, #f97316 80%, #ef4444 100%)',
              backgroundSize: '220px 100%',
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

      {/* Speed Metrics */}
      <div className="flex items-center justify-between text-[11.5px] text-muted-foreground/80 font-medium">
        <div className="flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-indigo-500" />
          <span>
            Target rate:{' '}
            <span className="font-bold text-foreground tabular-nums">{value.toLocaleString()}</span> msgs/min
          </span>
        </div>
        <span>
          Est. completion:{' '}
          <span className="font-bold text-foreground tabular-nums">
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
    <div className="space-y-6">

      {/* ── Segmented Control (Elevated Sliding Tab Bar) ───────────────────── */}
      <div className="flex p-0.5 bg-secondary/35 rounded-xl border border-border/30 relative select-none">
        {MODES.map(({ id, label, icon: Icon }) => {
          const active = config.mode === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => update({ mode: id })}
              className={`relative flex-1 flex items-center justify-center gap-2 h-8.5 rounded-lg text-[12px] font-bold transition-all duration-200 ${
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="active-delivery-pill"
                  className="absolute inset-0 bg-white dark:bg-zinc-800 rounded-[10px] shadow-[0_3px_12px_rgba(0,0,0,0.08),_0_1px_3px_rgba(0,0,0,0.04)] border border-slate-200/50"
                  transition={{ type: 'spring', damping: 20, stiffness: 350 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                />
              )}
              <Icon className={`w-3.5 h-3.5 relative z-10 ${active ? 'text-indigo-600' : 'text-muted-foreground/50'}`} />
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Mode Panels ─────────────────────────────────────────────────────── */}
      <div className="min-h-[60px]">
        <AnimatePresence mode="wait">

          {/* SEND NOW */}
          {config.mode === 'now' && (
            <motion.div
              key="now"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3 px-4 py-3 bg-emerald-500/[0.04] border border-emerald-500/10 rounded-xl"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <p className="text-[12px] text-emerald-700 font-bold leading-none">
                Ready: This broadcast starts sending instantly upon launch.
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
              transition={{ duration: 0.15 }}
              className="space-y-4"
            >
              {/* Date + Time Row */}
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <FieldLabel>Target Date</FieldLabel>
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
                  <FieldLabel>Target Time</FieldLabel>
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
                <div className="relative">
                  <select
                    value={config.timezone}
                    onChange={(e) => update({ timezone: e.target.value })}
                    className={inputCls + " appearance-none cursor-pointer pr-9"}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
                </div>
              </div>

              {/* Quiet Hours Toggle block */}
              <div
                className={`px-4 py-3.5 rounded-xl border transition-colors ${
                  config.quietHoursEnabled
                    ? 'bg-indigo-500/[0.03] border-indigo-500/10'
                    : 'bg-transparent border-border/50'
                }`}
              >
                <ToggleSwitch
                  checked={config.quietHoursEnabled}
                  onChange={(v) => update({ quietHoursEnabled: v })}
                  label="Quiet Hours Smart Protection"
                />
                <AnimatePresence>
                  {config.quietHoursEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 10 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-2 overflow-hidden"
                    >
                      <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span className="text-[11.5px] text-indigo-600/90 font-medium leading-relaxed">
                        Messages are automatically paused between 9 PM and 8 AM to guarantee user compliance.
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
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3 px-4 py-3 bg-secondary/20 border border-border/40 rounded-xl"
            >
              <RefreshCw className="w-4 h-4 text-indigo-500 shrink-0 animate-spin-slow" />
              <p className="text-[12px] text-muted-foreground/80 leading-relaxed">
                Recurring frequencies are controlled and managed in the{' '}
                <span className="font-semibold text-foreground">Automation Rules</span> panel below.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Throttle Slider ─────────────────────────────────────────────────── */}
      <ThrottleSlider
        value={config.throttleRate}
        onChange={(v) => update({ throttleRate: v })}
        estimatedDuration={estimatedDuration}
      />

      {/* ── Borderless Advanced Controls ────────────────────────────────────── */}
      <div className="border border-border/40 rounded-xl overflow-hidden bg-transparent">
        <button
          type="button"
          onClick={() => update({ advancedOpen: !config.advancedOpen })}
          className="w-full flex items-center justify-between px-4 py-3.5 text-[12px] font-bold text-muted-foreground/80 hover:text-foreground transition-colors select-none"
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
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4.5 pt-1 border-t border-border/20 space-y-3">
                {(
                  [
                    { label: 'Auto-retry failed dispatch queues',        key: 'retry'   },
                    { label: 'Pause automatically on >20% failure spikes', key: 'pause'   },
                    { label: 'Apply default daily cap of 1,000 dispatches',   key: 'cap'     },
                  ] as const
                ).map(({ label, key }) => (
                  <label
                    key={key}
                    className="flex items-center gap-3 cursor-pointer select-none group"
                  >
                    <input
                      type="checkbox"
                      defaultChecked={key === 'retry'}
                      className="w-3.5 h-3.5 rounded border-border/70 text-indigo-600 accent-indigo-600 cursor-pointer"
                    />
                    <span className="text-[12px] text-muted-foreground group-hover:text-foreground transition-colors font-medium">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
