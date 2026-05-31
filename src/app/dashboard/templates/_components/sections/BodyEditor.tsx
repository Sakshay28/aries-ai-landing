'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { VARIABLE_CHIPS, type VariableChip } from '../constants';
import type { TemplateFormState } from '../types';
import {
  ToggleLeft,
  ToggleRight,
  Database,
  Smile,
  Info,
  ChevronDown,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Strikethrough as StrikethroughIcon,
  Code as CodeIcon
} from 'lucide-react';

interface Props {
  state: TemplateFormState;
  onChange: (updates: Partial<TemplateFormState>) => void;
}

// Group chips by their group property for category popovers
const CHIP_GROUPS = VARIABLE_CHIPS.reduce<Record<string, VariableChip[]>>((acc, chip) => {
  if (!acc[chip.group]) acc[chip.group] = [];
  acc[chip.group].push(chip);
  return acc;
}, {});

export function parseBodyBrackets(bodyText: string) {
  const variableMap: Record<string, number> = {};
  let idx = 1;

  const matches = [...bodyText.matchAll(/\[([^\]]+)\]/g)];
  for (const match of matches) {
    const rawTag = match[1];
    const normalizedName = rawTag.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    if (normalizedName && !(normalizedName in variableMap)) {
      variableMap[normalizedName] = idx;
      idx++;
    }
  }

  let replaced = bodyText;
  for (const [name, index] of Object.entries(variableMap)) {
    const friendlyNameRegex = name.replace(/_/g, '\\s*');
    const regex = new RegExp(`\\[(${friendlyNameRegex}|${name.replace(/_/g, '-')}|${name})\\]`, 'gi');
    replaced = replaced.replace(regex, `{{${index}}}`);
  }

  return { metaBody: replaced, variableMap };
}

export function getActiveVariables(
  bodyText: string,
  variableMode: 'NORMAL' | 'ADVANCED',
  variableMap: Record<string, number>
) {
  if (variableMode === 'NORMAL') {
    const matches = [...bodyText.matchAll(/\[([^\]]+)\]/g)];
    const uniqueTags = [...new Set(matches.map((m) => m[1]))];
    return uniqueTags.map((tag) => {
      const normalizedName = tag.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const chip = VARIABLE_CHIPS.find((c) => c.name === normalizedName);
      return {
        key: normalizedName,
        label: chip ? chip.display : tag,
        defaultSample: chip ? chip.previewValue : 'Sample Value',
      };
    });
  } else {
    const matches = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)];
    const uniqueIndices = [...new Set(matches.map((m) => m[1]))].sort((a, b) => parseInt(a) - parseInt(b));
    return uniqueIndices.map((idxStr) => {
      const idx = parseInt(idxStr);
      const inverted = Object.entries(variableMap).find(([_, val]) => val === idx);
      const friendlyName = inverted ? inverted[0] : null;
      const chip = friendlyName ? VARIABLE_CHIPS.find((c) => c.name === friendlyName) : null;
      return {
        key: idxStr,
        label: chip ? `Variable {{${idx}}} (${chip.display})` : `Variable {{${idx}}}`,
        defaultSample: chip ? chip.previewValue : `Value ${idx}`,
      };
    });
  }
}

export default function BodyEditor({ state, onChange }: Props) {
  const { body, variableMap, variableMode, sampleValues = {} } = state;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const [showVarDropdown, setShowVarDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const maxChars = 1024;
  const isOverLimit = body.length > maxChars;

  // Click outside close popover dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowVarDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync active variables in state
  const activeVars = useMemo(() => {
    return getActiveVariables(body, variableMode, variableMap);
  }, [body, variableMode, variableMap]);

  // Dynamic sample state synchronizer loop
  useEffect(() => {
    const nextSamples = { ...sampleValues };
    let changed = false;

    activeVars.forEach((v) => {
      if (nextSamples[v.key] === undefined) {
        nextSamples[v.key] = v.defaultSample;
        changed = true;
      }
    });

    Object.keys(nextSamples).forEach((key) => {
      const isActive = activeVars.some((v) => v.key === key);
      if (!isActive) {
        delete nextSamples[key];
        changed = true;
      }
    });

    if (changed) {
      onChange({ sampleValues: nextSamples });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVars]);

  // Insert variable token dynamically at cursor
  const insertVariable = (chip: VariableChip) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;

    let token = `[${chip.display}]`;
    let nextMap = { ...variableMap };

    if (variableMode === 'ADVANCED') {
      const usedIndices = new Set(Object.values(variableMap));
      let idx = 1;
      while (usedIndices.has(idx)) idx++;
      token = `{{${idx}}}`;
      nextMap[chip.name] = idx;
    }

    const newBody = body.slice(0, start) + token + body.slice(end);
    onChange({ body: newBody, variableMap: nextMap });
    setShowVarDropdown(false);

    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  };

  // Switch modes
  const toggleVariableMode = () => {
    if (variableMode === 'NORMAL') {
      const parsed = parseBodyBrackets(body);
      onChange({
        variableMode: 'ADVANCED',
        body: parsed.metaBody,
        variableMap: parsed.variableMap,
      });
    } else {
      let converted = body;
      const inverted = Object.entries(variableMap).reduce<Record<number, string>>((acc, [name, idx]) => {
        acc[idx] = name;
        return acc;
      }, {});

      converted = converted.replace(/\{\{(\d+)\}\}/g, (_, n) => {
        const idx = parseInt(n);
        const friendlyName = inverted[idx] || `variable_${idx}`;
        const chip = VARIABLE_CHIPS.find((c) => c.name === friendlyName);
        return `[${chip ? chip.display : friendlyName.replace(/_/g, ' ')}]`;
      });

      onChange({
        variableMode: 'NORMAL',
        body: converted,
      });
    }
  };

  // Add bold / italics formatting
  const applyFormat = (prefix: string, suffix: string = prefix) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = body.slice(start, end);
    const newBody = body.slice(0, start) + prefix + selected + suffix + body.slice(end);
    onChange({ body: newBody });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  };

  const compiledBodyRepr = useMemo(() => {
    if (variableMode === 'NORMAL') {
      return parseBodyBrackets(body).metaBody;
    }
    return body;
  }, [body, variableMode]);

  return (
    <div className="space-y-4">
      {/* Mode selection row */}
      <div className="flex items-center justify-between select-none">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Body Copy Editor <span className="text-red-500">*</span>
        </label>
        <button
          type="button"
          onClick={toggleVariableMode}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-all focus:outline-none"
        >
          {variableMode === 'NORMAL' ? (
            <>
              <ToggleLeft className="w-4 h-4 text-muted-foreground/60" />
              <span className="font-semibold text-muted-foreground/80">Smart Mode</span>
            </>
          ) : (
            <>
              <ToggleRight className="w-4 h-4 text-primary" />
              <span className="font-semibold text-primary">Advanced Mode</span>
            </>
          )}
        </button>
      </div>

      {/* Editor Frame */}
      <div className="space-y-2 relative">
        {/* Production-Grade Formatting Toolbar (with dropdown) */}
        <div className="flex items-center justify-between p-1 bg-muted/50 rounded-xl border border-border/80 w-full relative z-20">
          <div className="flex items-center gap-0.5">
            {/* Emoji and styling icons */}
            <button
              type="button"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-background transition-all"
              title="Add Emoji"
              onClick={() => applyFormat('😊')}
            >
              <Smile className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-4 bg-border/80 mx-1" />

            <button
              type="button"
              onClick={() => applyFormat('*')}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-background transition-all"
              title="Bold"
            >
              <BoldIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('_')}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-background transition-all"
              title="Italic"
            >
              <ItalicIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('~')}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-background transition-all"
              title="Strikethrough"
            >
              <StrikethroughIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applyFormat('```')}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/60 hover:text-foreground hover:bg-background transition-all"
              title="Monospace Code"
            >
              <CodeIcon className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-border/80 mx-1" />

            {/* Variable Insertion Dropdown Popover */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setShowVarDropdown(!showVarDropdown)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-foreground/75 hover:text-foreground hover:bg-background transition-all text-xs font-semibold select-none border border-transparent hover:border-border/40"
              >
                <span>+ Add variable</span>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </button>

              {/* Absolute Dropdown list */}
              {showVarDropdown && (
                <div className="absolute left-0 mt-1.5 w-64 bg-card border border-border shadow-2xl rounded-xl p-2 z-50 max-h-[300px] overflow-y-auto custom-scrollbar select-none animate-fade-in">
                  <div className="px-2 py-1 border-b border-border/40 mb-1.5 flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Select variable</span>
                    <span className="text-[8px] bg-primary/10 text-primary px-1 rounded font-bold uppercase">Aries Engine</span>
                  </div>
                  {Object.entries(CHIP_GROUPS).map(([groupName, groupChips]) => (
                    <div key={groupName} className="space-y-0.5 mb-2 last:mb-0">
                      <span className="text-[8.5px] font-bold uppercase tracking-widest text-muted-foreground/60 px-2 block select-none">
                        {groupName}
                      </span>
                      {groupChips.map((chip) => (
                        <button
                          key={chip.name}
                          type="button"
                          onClick={() => insertVariable(chip)}
                          className="w-full text-left px-2.5 py-1 text-xs font-semibold text-foreground/80 hover:text-foreground hover:bg-muted/65 rounded-lg transition-colors flex items-center justify-between"
                        >
                          <span>{chip.display}</span>
                          <code className="text-[9.5px] font-mono text-muted-foreground/60 group-hover:text-primary">
                            {variableMode === 'NORMAL' ? `[${chip.display}]` : '{{index}}'}
                          </code>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2 select-none">
            <span className="cursor-help text-muted-foreground/45 hover:text-muted-foreground/80 transition-colors" title="Meta requires double curly bracket tags sequentially for dynamic send-time parameters.">
              <Info className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>

        {/* Text Area */}
        <div className="relative z-10">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => onChange({ body: e.target.value })}
            placeholder={
              variableMode === 'NORMAL'
                ? 'Hi [Customer Name], your booking for [Guest Count] is confirmed for [Booking Date] at [Booking Time].'
                : 'Hi {{1}}, your booking for {{2}} is confirmed for {{3}} at {{4}}.'
            }
            rows={5}
            maxLength={maxChars + 100}
            className={`w-full bg-background border rounded-2xl px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 transition-all resize-none ${
              isOverLimit
                ? 'border-red-500 focus:ring-red-500/25'
                : 'border-border focus:ring-primary/25 focus:border-primary/50'
            }`}
          />
          <div className={`absolute bottom-3 right-4 text-[9px] font-mono ${isOverLimit ? 'text-red-500' : 'text-muted-foreground/50'}`}>
            {body.length}/{maxChars}
          </div>
        </div>
      </div>

      {/* ── Meta-Grade Variable Samples Editor Panel (Highest Priority) ── */}
      {activeVars.length > 0 && (
        <div className="space-y-4 p-5 bg-[#f8fafc] dark:bg-zinc-900 border border-border/80 rounded-2xl animate-fade-in relative z-10 shadow-sm">
          <div>
            <h4 className="text-sm font-bold text-foreground block">
              Variable samples
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1 select-none">
              Include samples of all variables in your message to help Meta review your template. Remember not to include any customer information to protect your customer's privacy.
            </p>
          </div>

          <div className="space-y-3.5">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground block select-none border-b border-border/40 pb-1.5">
              Body
            </span>
            <div className="space-y-2.5">
              {activeVars.map((v, i) => (
                <div key={v.key} className="flex items-center gap-3 w-full">
                  {/* Positional Label Tag Card (Vercel-like rectangular border) */}
                  <div className="bg-muted/40 border border-border/80 text-muted-foreground text-xs font-mono font-bold rounded-lg text-center select-none shrink-0 h-9 px-4 flex items-center justify-center min-w-[64px]">
                    {variableMode === 'NORMAL' ? `{{${i + 1}}}` : `{{${v.key}}}`}
                  </div>

                  {/* Labeled value input */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={sampleValues[v.key] ?? ''}
                      onChange={(e) => {
                        onChange({
                          sampleValues: {
                            ...sampleValues,
                            [v.key]: e.target.value,
                          },
                        });
                      }}
                      placeholder={`Enter content for ${variableMode === 'NORMAL' ? `{{${i + 1}}}` : `{{${v.key}}}`}`}
                      className="w-full bg-background border border-border rounded-lg h-9 px-3.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary/50 transition-all font-semibold"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Meta Payload Inspector ── */}
      <details className="group border border-border/60 rounded-2xl bg-muted/15 overflow-hidden transition-all duration-200">
        <summary className="flex items-center justify-between px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:bg-muted/30 outline-none">
          <span className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" />
            Meta JSON Payload Inspector
          </span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-background font-mono tracking-normal text-muted-foreground group-open:hidden transition-all">View compiled output</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-background font-mono tracking-normal text-muted-foreground hidden group-open:inline transition-all">Hide payload</span>
        </summary>
        <div className="p-4 bg-background border-t border-border font-mono text-[10.5px] text-foreground space-y-3 overflow-x-auto select-all leading-relaxed">
          <div>
            <span className="text-muted-foreground font-semibold">// Compiled Body string submitted to Meta Graph API:</span>
            <div className="mt-1 p-2.5 rounded-xl bg-muted/65 text-primary border border-border/40 whitespace-pre-wrap">{compiledBodyRepr}</div>
          </div>
          {Object.keys(variableMap).length > 0 && (
            <div>
              <span className="text-muted-foreground font-semibold">// Mapped variables indexing:</span>
              <pre className="mt-1 p-2.5 rounded-xl bg-muted/65 text-foreground border border-border/40">{JSON.stringify(variableMap, null, 2)}</pre>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
