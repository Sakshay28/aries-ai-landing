"use client";

import React from 'react';
import { Users, FileSpreadsheet, Eye, ArrowRight, ShieldCheck } from 'lucide-react';
import { RecipientRecord } from '@/lib/broadcast/services/broadcast-recipient.service';
import toast from 'react-hot-toast';

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

  // Export to CSV helper
  const handleExportCSV = () => {
    if (recipients.length === 0) {
      toast.error('No recipients to export');
      return;
    }
    const headers = ['Name', 'Phone', 'Email', 'Source Type', 'Source Label', 'Status'];
    const rows = recipients.map(r => [
      r.name || '',
      r.phone_number || '',
      r.email || '',
      r.source_type,
      r.source_label,
      r.status
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `broadcast_recipients_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${recipients.length} recipients to CSV!`);
  };

  // Limit preview list to first 3 eligible contacts as per premium requirement
  const eligibleRecipients = recipients.filter(r => r.status === 'eligible');
  const visiblePreview = eligibleRecipients.slice(0, 3);
  const remainingCount = Math.max(0, eligibleRecipients.length - 3);

  // Loading skeleton state
  if (isLoading) {
    return (
      <div className="border border-border/50 bg-[#fbfcfd] dark:bg-card/40 rounded-2xl p-6 space-y-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8.5 h-8.5 rounded-lg bg-secondary" />
            <div className="space-y-1.5">
              <div className="h-4 w-32 bg-secondary rounded" />
              <div className="h-3.5 w-24 bg-secondary rounded" />
            </div>
          </div>
          <div className="h-8 w-24 bg-secondary rounded-lg" />
        </div>
        <div className="space-y-3 pt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between py-2 border-t border-border/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-secondary" />
                <div className="space-y-1.5">
                  <div className="h-3.5 w-24 bg-secondary rounded" />
                  <div className="h-3 w-32 bg-secondary rounded" />
                </div>
              </div>
              <div className="h-5 w-16 bg-secondary rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Elegant empty state
  if (totalRecipients === 0) {
    return (
      <div className="border border-dashed border-border/70 rounded-2xl p-8 text-center bg-secondary/5 select-none">
        <Users className="w-8 h-8 text-muted-foreground/35 mx-auto mb-3" />
        <p className="text-[14px] font-bold text-foreground/90">No recipients selected yet</p>
        <p className="text-[12px] text-muted-foreground/60 mt-1 max-w-[280px] mx-auto">
          Choose an option in the targeting grid above to begin selecting contacts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Premium Recipients Selected Card */}
      <div className="border border-border/50 bg-[#fbfcfd] dark:bg-card/40 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.015)] text-left flex flex-col">
        {/* Card Header */}
        <div className="px-5 py-4 border-b border-border/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-secondary/5">
          <div className="flex items-center gap-3">
            <div className="w-8.5 h-8.5 rounded-lg bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Users className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-foreground/90">Recipients Selected</h3>
              <p className="text-[12px] text-muted-foreground/80 mt-0.5 font-semibold">
                {totalRecipients.toLocaleString()} Contact{totalRecipients !== 1 ? 's' : ''} Selected
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3.5 self-end sm:self-auto select-none">
            {/* Real initials avatar stack */}
            <div className="flex -space-x-2 overflow-hidden shrink-0">
              {eligibleRecipients.slice(0, 3).map((r, idx) => {
                const initials = (r.name || 'T')
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <div
                    key={idx}
                    className="inline-block h-7 w-7 rounded-full border-2 border-background bg-indigo-500/10 text-[9.5px] font-bold text-indigo-600 flex items-center justify-center ring-1 ring-border/10"
                    title={r.name}
                  >
                    {initials}
                  </div>
                );
              })}
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenDrawer}
                className="h-8 px-3 rounded-lg border border-border/60 hover:bg-secondary/35 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-all flex items-center gap-1.5 shadow-sm bg-background"
              >
                <Eye className="w-3.5 h-3.5" />
                View Recipients
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="h-8 px-2.5 rounded-lg border border-border/60 hover:bg-secondary/35 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-all flex items-center justify-center bg-background"
                title="Export CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Recipients Rows list */}
        <div className="divide-y divide-border/15 bg-background/30 px-5">
          {visiblePreview.map((item, idx) => {
            const initials = (item.name || 'T')
              .split(' ')
              .map(n => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            // Segment label resolver
            const segment = item.source_label || (item.source_type === 'all' ? 'All Contacts' : item.source_type);

            return (
              <div key={idx} className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0 select-none">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground/90 truncate">
                      {item.name || 'Unnamed Contact'}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
                      {item.phone_number}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-secondary text-muted-foreground border border-border/50">
                    {segment}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* View all footer banner if remaining */}
        {remainingCount > 0 && (
          <div className="px-5 py-3 bg-secondary/5 border-t border-border/15 flex items-center justify-between text-[11.5px] font-bold select-none">
            <span className="text-muted-foreground/75 font-semibold">
              +{remainingCount.toLocaleString()} more contact{remainingCount !== 1 ? 's' : ''} in cohort
            </span>
            <button
              type="button"
              onClick={onOpenDrawer}
              className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5 group"
            >
              View all recipients
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}

        {/* Validation exclusions info line */}
        {(excluded > 0 || duplicatesRemoved > 0 || invalidNumbers > 0) && (
          <div className="px-5 py-2.5 bg-secondary/15 border-t border-border/15 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10.5px] text-muted-foreground/75 font-semibold select-none">
            <span className="text-muted-foreground/80 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Compliance filters active:
            </span>
            {excluded > 0 && <span>• {excluded} opted-out excluded</span>}
            {duplicatesRemoved > 0 && <span>• {duplicatesRemoved} duplicates removed</span>}
            {invalidNumbers > 0 && <span>• {invalidNumbers} invalid numbers filtered</span>}
          </div>
        )}
      </div>
    </div>
  );
}
