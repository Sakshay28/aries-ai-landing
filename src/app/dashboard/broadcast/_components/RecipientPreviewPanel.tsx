"use client";

import React, { useMemo } from 'react';
import { Users, Eye, ShieldCheck, User, Save, Zap } from 'lucide-react';
import { RecipientRecord } from '@/lib/broadcast/services/broadcast-recipient.service';
import { hasRealName } from '@/lib/broadcast/recipient-name';

interface RecipientPreviewPanelProps {
  recipients: RecipientRecord[];
  totalRecipients: number;
  excluded: number;
  duplicatesRemoved: number;
  invalidNumbers: number;
  normalizationCount: number;
  onOpenDrawer: () => void;
  isLoading: boolean;
}

export function RecipientPreviewPanel({
  recipients,
  totalRecipients,
  excluded,
  duplicatesRemoved,
  invalidNumbers,
  normalizationCount,
  onOpenDrawer,
  isLoading
}: RecipientPreviewPanelProps) {

  // Real data calculations
  const baseContacts = useMemo(() => recipients.filter(r => r.status === 'eligible' || r.status === 'excluded'), [recipients]);
  
  const knownCount = useMemo(() =>
    baseContacts.filter(r => hasRealName(r.name)).length,
    [baseContacts]
  );
  
  const savedCount = useMemo(() => 
    baseContacts.filter(r => r.source_type !== 'csv').length,
    [baseContacts]
  );
  
  const leadsCount = useMemo(() => 
    baseContacts.filter(r => r.source_type === 'manual' || r.source_type === 'tag' || r.source_type === 'custom' || r.source_type === 'segment').length,
    [baseContacts]
  );

  // Loading state skeleton
  if (isLoading) {
    return (
      <div className="border border-zinc-200/60 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-950/40 rounded-3xl p-6 shadow-sm animate-pulse space-y-4">
        <div className="h-4 w-32 bg-secondary rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 bg-secondary rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // Elegant empty state
  if (totalRecipients === 0) {
    return (
      <div className="border border-dashed border-zinc-300 dark:border-zinc-800 rounded-3xl p-8 text-center bg-zinc-50/50 dark:bg-zinc-950/20 select-none">
        <Users className="w-9 h-9 text-zinc-400/60 mx-auto mb-3" />
        <p className="text-[14.5px] font-bold text-zinc-900 dark:text-zinc-100">No recipients selected yet</p>
        <p className="text-[12px] text-zinc-505 mt-1 max-w-[300px] mx-auto">
          Choose a targeting strategy to preview recipients.
        </p>
        <button
          type="button"
          onClick={() => {
            document.getElementById('section-audience')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="mt-3.5 px-4 py-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900 rounded-xl hover:bg-indigo-100/70 transition-all"
        >
          Select recipients
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header section with View Recipients button aligned right */}
      <div className="flex items-center justify-between select-none">
        <p className="text-[12px] text-muted-foreground/80 font-bold uppercase tracking-widest text-left">
          Recipients Summary
        </p>
        <button
          type="button"
          onClick={onOpenDrawer}
          className="h-11 px-5 text-[12.5px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/50 dark:border-indigo-900/60 hover:bg-indigo-100/80 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0"
        >
          <Eye className="w-4 h-4" />
          View recipients
        </button>
      </div>
      
      {/* 4-column grid of stat tiles */}
      <div className="grid w-full" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "24px" }}>
        {/* Tile 1: Known Contacts */}
        <div 
          className="rounded-2xl border border-zinc-200/40 dark:border-zinc-800/40 bg-zinc-500/[0.02] dark:bg-zinc-900/10 p-4 flex flex-col justify-between select-none hover:bg-zinc-500/[0.05] dark:hover:bg-zinc-900/20 hover:-translate-y-[2px] transition-all duration-200 group"
          style={{ minHeight: "116px" }}
        >
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 dark:bg-blue-900/20 border border-blue-500/15 dark:border-blue-900/35 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <User className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 text-left mt-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-none block">
              Known Contacts
            </span>
            <span className="text-[28px] font-extrabold tracking-tight text-foreground leading-none mt-1.5 block tabular-nums">
              {knownCount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Tile 2: Saved Contacts */}
        <div 
          className="rounded-2xl border border-zinc-200/40 dark:border-zinc-800/40 bg-zinc-500/[0.02] dark:bg-zinc-900/10 p-4 flex flex-col justify-between select-none hover:bg-zinc-500/[0.05] dark:hover:bg-zinc-900/20 hover:-translate-y-[2px] transition-all duration-200 group"
          style={{ minHeight: "116px" }}
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 dark:bg-emerald-900/20 border border-emerald-500/15 dark:border-emerald-900/35 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <Save className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 text-left mt-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-none block">
              Saved Contacts
            </span>
            <span className="text-[28px] font-extrabold tracking-tight text-foreground leading-none mt-1.5 block tabular-nums">
              {savedCount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Tile 3: Leads */}
        <div 
          className="rounded-2xl border border-zinc-200/40 dark:border-zinc-800/40 bg-zinc-500/[0.02] dark:bg-zinc-900/10 p-4 flex flex-col justify-between select-none hover:bg-zinc-500/[0.05] dark:hover:bg-zinc-900/20 hover:-translate-y-[2px] transition-all duration-200 group"
          style={{ minHeight: "116px" }}
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 dark:bg-indigo-900/20 border border-indigo-500/15 dark:border-indigo-900/35 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 text-left mt-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground leading-none block">
              Leads
            </span>
            <span className="text-[28px] font-extrabold tracking-tight text-foreground leading-none mt-1.5 block tabular-nums">
              {leadsCount.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Tile 4: Total Recipients */}
        <div 
          className="rounded-2xl border border-indigo-500/25 dark:border-indigo-500/35 bg-indigo-500/[0.015] dark:bg-indigo-950/10 p-4 flex flex-col justify-between select-none hover:bg-indigo-550/[0.04] dark:hover:bg-indigo-950/20 hover:-translate-y-[2px] transition-all duration-200 group"
          style={{ minHeight: "116px" }}
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 dark:bg-indigo-950/20 border border-indigo-500/15 dark:border-indigo-950/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <Users className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 text-left mt-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-indigo-650 dark:text-indigo-405 leading-none block">
              Total Recipients
            </span>
            <span className="text-[28px] font-extrabold tracking-tight text-indigo-700 dark:text-indigo-300 leading-none mt-1.5 block tabular-nums">
              {totalRecipients.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Compliance Exclusions Footer info */}
      {(excluded > 0 || duplicatesRemoved > 0 || invalidNumbers > 0) && (
        <div className="px-5 py-2.5 bg-zinc-50/50 dark:bg-zinc-900/10 border border-zinc-200/50 dark:border-zinc-800 rounded-2xl flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-semibold select-none text-left">
          <span className="text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Compliance exclusions applied:
          </span>
          {excluded > 0 && <span>• {excluded} opted-out</span>}
          {duplicatesRemoved > 0 && <span>• {duplicatesRemoved} duplicates</span>}
          {invalidNumbers > 0 && <span>• {invalidNumbers} invalid numbers</span>}
        </div>
      )}
    </div>
  );
}
