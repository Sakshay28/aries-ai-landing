'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Search, Check } from 'lucide-react';
import { LANGUAGES, normalizeName } from '../constants';
import type { TemplateFormState } from '../types';

interface Props {
  state: TemplateFormState;
  onChange: (updates: Partial<TemplateFormState>) => void;
  existingNames?: string[]; // passed down from parent for instant zero-latency validation
}

type NameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function BasicsStep({ state, onChange, existingNames = [] }: Props) {
  const [nameStatus, setNameStatus] = useState<NameStatus>('idle');
  const [langSearch, setLangSearch] = useState('');
  const { name, normalizedName, language } = state;

  // Instant local zero-latency name validation & uniqueness check
  useEffect(() => {
    if (!normalizedName) {
      setNameStatus('idle');
      return;
    }

    if (normalizedName.length < 3) {
      setNameStatus('invalid');
      return;
    }

    setNameStatus('checking');
    const timer = setTimeout(() => {
      const isTaken = existingNames.includes(normalizedName) && normalizedName !== state.metaTemplateId;
      setNameStatus(isTaken ? 'taken' : 'available');
    }, 150); // slight debounce for smooth UI feel

    return () => clearTimeout(timer);
  }, [normalizedName, existingNames, state.metaTemplateId]);

  const handleNameChange = (raw: string) => {
    // Only allow letters, numbers, spaces, underscores, hyphens in raw input,
    // which normalizes cleanly to lowercase + underscores
    const norm = normalizeName(raw);
    onChange({ name: raw, normalizedName: norm });
  };

  const pinnedLangs = useMemo(() => LANGUAGES.filter((l) => l.pinned), []);
  const otherLangs = useMemo(() => LANGUAGES.filter((l) => !l.pinned), []);

  const filteredOtherLangs = useMemo(() => {
    if (!langSearch) return otherLangs;
    return otherLangs.filter((l) =>
      l.label.toLowerCase().includes(langSearch.toLowerCase())
    );
  }, [langSearch, otherLangs]);

  return (
    <div className="space-y-6">
      {/* ── Template Name Section (Premium Input) ── */}
      <div className="space-y-3">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
          Template Name <span className="text-red-500">*</span>
        </label>
        
        <div className="relative">
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Reservation Confirmed"
            maxLength={120}
            className={`w-full bg-background border rounded-2xl px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/45 focus:outline-none focus:ring-1 transition-all ${
              nameStatus === 'invalid' || nameStatus === 'taken'
                ? 'border-red-500 focus:ring-red-500/25'
                : nameStatus === 'available'
                ? 'border-emerald-500/50 focus:ring-emerald-500/20'
                : 'border-border focus:ring-primary/25 focus:border-primary/50'
            }`}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center select-none text-xs font-semibold">
            {nameStatus === 'checking' && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/60" />
            )}
            {nameStatus === 'available' && (
              <span className="text-emerald-600 dark:text-emerald-500 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/10 text-[10px] uppercase tracking-wider font-bold">
                ✓ Valid format
              </span>
            )}
            {nameStatus === 'taken' && (
              <span className="text-red-600 dark:text-red-500 flex items-center gap-1 bg-red-500/10 px-2 py-0.5 rounded-lg border border-red-500/10 text-[10px] uppercase tracking-wider font-bold">
                ⚠ Name Taken
              </span>
            )}
            {nameStatus === 'invalid' && (
              <span className="text-amber-600 dark:text-amber-500 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/10 text-[10px] uppercase tracking-wider font-bold">
                Too Short
              </span>
            )}
          </div>
        </div>

        {/* Normalized auto-formatting mapping */}
        {normalizedName && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border/80 w-fit">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Submitted to Meta:</span>
            <code className="text-xs font-mono font-semibold text-foreground">{normalizedName}</code>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-snug">
          Lowercase letters, numbers, and underscores only. Name will be submitted to Meta exactly as formatted.
        </p>
      </div>

      {/* ── Language Section (Chips & Searchable drop panel) ── */}
      <div className="space-y-4 pt-2.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            Select Language <span className="text-red-500">*</span>
          </label>
          {language && (
            <span className="text-[11px] font-semibold text-muted-foreground bg-card border border-border px-2.5 py-0.5 rounded-lg">
              Active: <strong className="text-foreground">{LANGUAGES.find((l) => l.value === language)?.label ?? language}</strong>
            </span>
          )}
        </div>

        {/* Pinned main languages chips */}
        <div className="flex flex-wrap gap-1.5">
          {pinnedLangs.map((l) => {
            const isSelected = language === l.value;
            return (
              <button
                key={l.value}
                type="button"
                onClick={() => onChange({ language: l.value })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card border-border/60 text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
