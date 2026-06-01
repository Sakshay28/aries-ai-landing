"use client";

import React, { useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertTriangle, ChevronDown, Type } from 'lucide-react';

// ── Types & Constants ─────────────────────────────────────────────────────────

type SourceType = 'crm_field' | 'static' | 'custom';

const CRM_FIELDS = [
  { value: 'name',  label: 'First Name' },
  { value: 'phone', label: 'Phone'      },
  { value: 'email', label: 'Email'      },
  { value: 'notes', label: 'Notes'      },
] as const;

interface VariableConfig {
  index: string;
  sourceType: SourceType;
  crmField?: string;
  staticValue?: string;
}

interface VariableMapperProps {
  bodyText: string;
  variables: Record<string, VariableConfig>;
  onChange: (vars: Record<string, VariableConfig>) => void;
  previewValues: Record<string, string>;
}

// ── Source type options ────────────────────────────────────────────────────────

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: 'crm_field', label: 'CRM Field'    },
  { value: 'static',    label: 'Static Value' },
  { value: 'custom',    label: 'Custom Text'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectVariables(body: string): string[] {
  const regex = /\{\{(\d+)\}\}/g;
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found).sort((a, b) => Number(a) - Number(b));
}

function isConfigValid(config: VariableConfig): boolean {
  if (config.sourceType === 'crm_field') return !!config.crmField;
  if (config.sourceType === 'static')    return !!(config.staticValue?.trim());
  if (config.sourceType === 'custom')    return !!(config.staticValue?.trim());
  return false;
}

// ── Source Type Toggle ────────────────────────────────────────────────────────

function SourceTypeToggle({
  value,
  onChange,
}: {
  value: SourceType;
  onChange: (t: SourceType) => void;
}) {
  return (
    <div className="flex items-center bg-secondary/50 border border-border/60 rounded-lg p-0.5 gap-0.5">
      {SOURCE_TYPES.map(opt => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`relative px-2.5 py-1 text-[11px] font-medium rounded-[6px] transition-all duration-150 whitespace-nowrap ${
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="source-type-pill"
                className="absolute inset-0 bg-background border border-border/60 rounded-[6px] shadow-sm"
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Variable Row ──────────────────────────────────────────────────────────────

function VariableRow({
  index,
  config,
  previewValue,
  onUpdate,
}: {
  index: string;
  config: VariableConfig;
  previewValue: string;
  onUpdate: (patch: Partial<VariableConfig>) => void;
}) {
  const valid = isConfigValid(config);
  const hasAttempted = config.sourceType === 'crm_field'
    ? config.crmField !== undefined
    : config.staticValue !== undefined;

  const showError = hasAttempted && !valid;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-xl border transition-colors ${
        showError
          ? 'border-red-300 bg-red-50/30'
          : 'border-border/60 bg-background'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Variable chip */}
        <div className="shrink-0 mt-0.5">
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-indigo-500/8 border border-indigo-500/20 text-indigo-600 text-[12px] font-bold font-mono tracking-wide">
            {`{{${index}}}`}
          </span>
        </div>

        {/* Controls column */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Source type toggle */}
          <SourceTypeToggle
            value={config.sourceType}
            onChange={sourceType => {
              onUpdate({ sourceType, crmField: undefined, staticValue: undefined });
            }}
          />

          {/* Input based on source type */}
          <div>
            {config.sourceType === 'crm_field' && (
              <div className="relative">
                <select
                  value={config.crmField ?? ''}
                  onChange={e => onUpdate({ crmField: e.target.value })}
                  className={`w-full h-9 pl-3.5 pr-8 rounded-lg text-[13px] text-foreground outline-none transition-colors appearance-none cursor-pointer border ${
                    showError
                      ? 'border-red-400 bg-red-50/50 focus:border-red-500'
                      : 'bg-card border-border/70 hover:border-border focus:border-indigo-500/50'
                  }`}
                >
                  <option value="">— Select CRM field —</option>
                  {CRM_FIELDS.map(f => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
              </div>
            )}

            {config.sourceType === 'static' && (
              <input
                type="text"
                placeholder="Enter static value…"
                value={config.staticValue ?? ''}
                onChange={e => onUpdate({ staticValue: e.target.value })}
                className={`w-full h-9 px-3.5 rounded-lg text-[13px] text-foreground outline-none transition-colors border placeholder:text-muted-foreground/40 ${
                  showError
                    ? 'border-red-400 bg-red-50/50 focus:border-red-500'
                    : 'bg-card border-border/70 hover:border-border focus:border-indigo-500/50'
                }`}
              />
            )}

            {config.sourceType === 'custom' && (
              <textarea
                placeholder="Enter custom text…"
                value={config.staticValue ?? ''}
                onChange={e => onUpdate({ staticValue: e.target.value })}
                rows={2}
                className={`w-full px-3.5 py-2.5 rounded-lg text-[13px] text-foreground outline-none transition-colors border resize-none leading-relaxed placeholder:text-muted-foreground/40 ${
                  showError
                    ? 'border-red-400 bg-red-50/50 focus:border-red-500'
                    : 'bg-card border-border/70 hover:border-border focus:border-indigo-500/50'
                }`}
              />
            )}

            {/* Inline error */}
            <AnimatePresence>
              {showError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-[11px] text-red-500 mt-1.5 leading-tight"
                >
                  {config.sourceType === 'crm_field'
                    ? 'Please select a CRM field'
                    : 'This field cannot be empty'}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Preview value */}
        <div className="shrink-0 flex items-center gap-1.5 mt-1 min-w-[80px] max-w-[110px]">
          {previewValue ? (
            <>
              <span className="text-muted-foreground/50 text-[12px]">→</span>
              <span
                className="text-[12px] text-muted-foreground font-medium truncate"
                title={previewValue}
              >
                {previewValue}
              </span>
            </>
          ) : (
            <span className="text-[12px] text-muted-foreground/30 italic">preview</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function VariableMapper({
  bodyText,
  variables,
  onChange,
  previewValues,
}: VariableMapperProps) {
  const detectedIndices = useMemo(() => detectVariables(bodyText), [bodyText]);

  const allValid = useMemo(
    () => detectedIndices.every(idx => {
      const cfg = variables[idx];
      return cfg ? isConfigValid(cfg) : false;
    }),
    [detectedIndices, variables]
  );

  const invalidCount = useMemo(
    () => detectedIndices.filter(idx => {
      const cfg = variables[idx];
      return !cfg || !isConfigValid(cfg);
    }).length,
    [detectedIndices, variables]
  );

  const updateVariable = useCallback(
    (index: string, patch: Partial<VariableConfig>) => {
      const existing: VariableConfig = variables[index] ?? {
        index,
        sourceType: 'crm_field',
      };
      onChange({
        ...variables,
        [index]: { ...existing, ...patch },
      });
    },
    [variables, onChange]
  );

  // ── No variables in template ───────────────────────────────────────────────
  if (detectedIndices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-3 rounded-xl border border-dashed border-border/60">
        <div className="w-10 h-10 rounded-xl bg-secondary/60 flex items-center justify-center">
          <Type className="w-4 h-4 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-[13px] font-medium text-foreground">No variables detected</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Add <code className="text-[11px] bg-secondary px-1 py-0.5 rounded font-mono">{'{{1}}'}</code>,{' '}
            <code className="text-[11px] bg-secondary px-1 py-0.5 rounded font-mono">{'{{2}}'}</code>, etc.
            to your template body to map dynamic values.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Status header ──────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {allValid ? (
          <motion.div
            key="valid"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-50 border border-emerald-200/60 rounded-xl"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-[12px] font-medium text-emerald-700">
              All {detectedIndices.length} variable{detectedIndices.length > 1 ? 's' : ''} mapped successfully
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="invalid"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-amber-50 border border-amber-200/60 rounded-xl"
          >
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <p className="text-[12px] font-medium text-amber-700">
              {invalidCount} variable{invalidCount > 1 ? 's' : ''} still need
              {invalidCount === 1 ? 's' : ''} to be mapped
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Column headers ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4">
        <div className="w-[72px] shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Variable
          </span>
        </div>
        <div className="flex-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Mapping
          </span>
        </div>
        <div className="w-[110px] shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Preview
          </span>
        </div>
      </div>

      {/* ── Variable rows ──────────────────────────────────────────────────── */}
      <div className="space-y-2.5">
        {detectedIndices.map((idx, i) => {
          const existing = variables[idx];
          const config: VariableConfig = existing ?? {
            index: idx,
            sourceType: 'crm_field',
          };
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.04 }}
            >
              <VariableRow
                index={idx}
                config={config}
                previewValue={previewValues[idx] ?? ''}
                onUpdate={patch => updateVariable(idx, patch)}
              />
            </motion.div>
          );
        })}
      </div>

      {/* ── Footer hint ────────────────────────────────────────────────────── */}
      <p className="text-[11px] text-muted-foreground/60 text-center pt-1">
        Preview values are based on the selected contact profile
      </p>
    </div>
  );
}
