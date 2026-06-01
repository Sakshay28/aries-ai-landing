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
    <div className="flex items-center bg-secondary/30 border border-border/50 rounded-lg p-0.5 gap-0.5">
      {SOURCE_TYPES.map(opt => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`relative px-2.5 py-1 text-[11px] font-semibold rounded-[6px] transition-all duration-[120ms] ease-out whitespace-nowrap ${
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground/70 hover:text-muted-foreground'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="source-type-pill"
                className="absolute inset-0 bg-background border border-border/50 rounded-[6px] shadow-sm"
                transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Semantic Label Detector ───────────────────────────────────────────────────

function getSemanticLabel(bodyText: string, index: string): string {
  const normalized = bodyText.toLowerCase();
  const indexStr = `{{${index}}}`;
  const pos = normalized.indexOf(indexStr);
  if (pos === -1) return `Variable ${index}`;
  
  // Look at preceding text
  const preText = normalized.substring(Math.max(0, pos - 20), pos);
  
  if (preText.includes("hi ") || preText.includes("hello ") || preText.includes("dear ") || preText.includes("name")) {
    return "Name";
  }
  if (preText.includes("date") || preText.includes("day") || preText.includes("on ")) {
    return "Date";
  }
  if (preText.includes("time") || preText.includes("at ")) {
    return "Time";
  }
  if (preText.includes("status") || preText.includes("is ")) {
    return "Status";
  }
  
  // Otherwise try post text
  const postText = normalized.substring(pos + indexStr.length, Math.min(normalized.length, pos + indexStr.length + 20));
  if (postText.includes("name")) return "Name";
  if (postText.includes("date")) return "Date";
  if (postText.includes("time")) return "Time";
  
  return `Var ${index}`;
}

// ── Variable Row ──────────────────────────────────────────────────────────────

function VariableRow({
  index,
  config,
  previewValue,
  onUpdate,
  bodyText,
}: {
  index: string;
  config: VariableConfig;
  previewValue: string;
  onUpdate: (patch: Partial<VariableConfig>) => void;
  bodyText: string;
}) {
  const semanticLabel = React.useMemo(() => getSemanticLabel(bodyText, index), [bodyText, index]);
  const valid = isConfigValid(config);
  const showError = !valid;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`rounded-xl border transition-colors ${
        showError
          ? 'border-amber-200 bg-amber-50/10'
          : 'border-slate-200/50 dark:border-zinc-800/50 bg-background hover:bg-secondary/5'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3">
        {/* Left Side: Semantic name & mapping direction */}
        <div className="flex items-center gap-2 min-w-[130px] w-[130px] select-none">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-indigo-500/8 border border-indigo-500/10 text-indigo-600 text-[10px] font-bold font-mono tracking-wide">
            {`{{${index}}}`}
          </span>
          <span className="text-[12.5px] font-semibold text-foreground tracking-tight truncate">
            {semanticLabel}
          </span>
        </div>

        {/* Center: Inline Tactile Chip Picker */}
        <div className="flex-1 flex flex-wrap items-center gap-1.5 select-none">
          {/* CRM Fields Chips */}
          {CRM_FIELDS.map(f => {
            const isSelected = config.sourceType === 'crm_field' && config.crmField === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => onUpdate({ sourceType: 'crm_field', crmField: f.value, staticValue: undefined })}
                className={`h-[26px] px-2.5 rounded-lg text-[10.5px] font-semibold transition-all duration-[120ms] ease-out select-none ${
                  isSelected
                    ? 'bg-indigo-600 border border-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.16)] dark:border-indigo-500'
                    : 'bg-secondary/25 text-muted-foreground/75 border border-border/15 hover:border-indigo-500/30 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 hover:text-indigo-600'
                }`}
              >
                {f.label}
              </button>
            );
          })}

          {/* Static Value Chip */}
          <button
            type="button"
            onClick={() => {
              if (config.sourceType !== 'static') {
                onUpdate({ sourceType: 'static', crmField: undefined, staticValue: '' });
              }
            }}
            className={`h-[26px] px-2.5 rounded-lg text-[10.5px] font-semibold transition-all duration-[120ms] ease-out select-none ${
              config.sourceType === 'static'
                ? 'bg-indigo-600 border border-indigo-600 text-white shadow-[0_2px_8px_rgba(99,102,241,0.16)] dark:border-indigo-500'
                : 'bg-secondary/25 text-muted-foreground/75 border border-border/15 hover:border-indigo-500/30 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 hover:text-indigo-600'
            }`}
          >
            Custom Text
          </button>
        </div>

        {/* Right: Inline Input (if Static selected) or Preview value */}
        <div className="w-[130px] shrink-0 flex items-center justify-end gap-2">
          {config.sourceType === 'static' ? (
            <input
              type="text"
              placeholder="Enter text…"
              value={config.staticValue ?? ''}
              onChange={e => onUpdate({ staticValue: e.target.value })}
              className={`h-[26px] w-[120px] px-2.5 rounded-lg text-[11px] text-foreground outline-none transition-colors border placeholder:text-muted-foreground/35 ${
                showError
                  ? 'border-amber-300 bg-amber-50/20 focus:border-amber-400'
                  : 'bg-card border-border/60 hover:border-border/80 focus:border-indigo-500/40 focus:ring-0 p-0 text-center'
              }`}
            />
          ) : (
            previewValue && (
              <div className="flex items-center gap-1.5 bg-secondary/35 border border-border/10 px-2 py-0.5 rounded-md max-w-[120px]">
                <span className="text-[10px] text-muted-foreground/70 font-semibold truncate" title={previewValue}>
                  {previewValue}
                </span>
              </div>
            )
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
      <div className="flex items-center gap-3 px-4 text-left">
        <div className="w-[130px] shrink-0">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/50">
            Variable
          </span>
        </div>
        <div className="flex-1">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/50">
            Mapping
          </span>
        </div>
        <div className="w-[130px] shrink-0 text-right pr-2">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/50">
            Preview
          </span>
        </div>
      </div>

      {/* ── Variable rows ──────────────────────────────────────────────────── */}
      <div className="space-y-2">
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
                bodyText={bodyText}
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
