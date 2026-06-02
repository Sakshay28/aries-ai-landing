"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Users, FileSpreadsheet, Tag, Search, ArrowRight, Eye, Sparkles, CheckCircle2, Ban, Copy, AlertOctagon } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Filter preview contacts in real-time
  const filteredPreview = useMemo(() => {
    const query = debouncedQuery.trim().toLowerCase();
    if (!query) return recipients;

    return recipients.filter(r => {
      const nameMatch = (r.name || '').toLowerCase().includes(query);
      const phoneMatch = (r.phone_number || '').includes(query);
      const emailMatch = (r.email || '').toLowerCase().includes(query);
      const labelMatch = (r.source_label || '').toLowerCase().includes(query);
      return nameMatch || phoneMatch || emailMatch || labelMatch;
    });
  }, [recipients, debouncedQuery]);

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

  // Limit preview list to 5 contacts
  const visiblePreview = filteredPreview.slice(0, 5);
  const remainingCount = Math.max(0, filteredPreview.length - 5);

  return (
    <div className="space-y-5">
      {/* ── Audience Breakdown Card ── */}
      <div className="border border-border/30 bg-card rounded-2xl p-4.5 shadow-sm text-left">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-3">
          Audience Breakdown
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
          {[
            { label: 'Eligible recipients', val: totalRecipients, color: 'text-indigo-600' },
            { label: 'Opted-out removed', val: excluded, color: 'text-rose-600' },
            { label: 'Duplicates removed', val: duplicatesRemoved, color: 'text-amber-600' },
            { label: 'Invalid numbers', val: invalidNumbers, color: 'text-red-500' },
            { label: 'Normalized E.164', val: normalizationCount, color: 'text-emerald-600' }
          ].map((stat, idx) => (
            <div key={idx} className="p-3 bg-secondary/15 rounded-xl border border-border/20 flex flex-col justify-between">
              <span className="text-[9.5px] font-semibold text-muted-foreground/75 leading-tight block">
                {stat.label}
              </span>
              <span className={`text-[19px] font-extrabold tracking-tight mt-2.5 block tabular-nums ${stat.color}`}>
                {isLoading ? '...' : stat.val.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recipients Preview Card ── */}
      <div className="border border-border/30 bg-[#fbfcfd] dark:bg-card/40 rounded-2xl overflow-hidden shadow-sm pt-4.5 pb-2 text-left">
        {/* Card Header */}
        <div className="px-5 pb-3 border-b border-border/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
              Recipients Preview
            </p>
            <p className="text-[12px] text-muted-foreground/85 mt-0.5 font-medium">
              {totalRecipients.toLocaleString()} contact{totalRecipients !== 1 ? 's' : ''} selected
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 select-none">
            <button
              type="button"
              onClick={onOpenDrawer}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 hover:bg-secondary/35 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-all"
            >
              <Eye className="w-3.5 h-3.5" />
              View All
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 hover:bg-secondary/35 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-all"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-5 py-3 border-b border-border/25">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 pointer-events-none" />
            <input
              type="text"
              placeholder="Search recipients..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-4 bg-background border border-border/60 focus:border-indigo-500/50 rounded-lg text-[12px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/35"
            />
          </div>
        </div>

        {/* Recipients Rows List */}
        <div className="divide-y divide-border/20 px-5">
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground text-[12px] flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              Resolving recipients list...
            </div>
          ) : recipients.length === 0 ? (
            <div className="py-8 text-center select-none">
              <Users className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-[12.5px] font-semibold text-muted-foreground">No recipients selected yet</p>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5">Choose an option in the targeting grid above to begin.</p>
            </div>
          ) : visiblePreview.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[12px] text-muted-foreground">No matching recipients found</p>
            </div>
          ) : (
            visiblePreview.map((item, idx) => {
              const initials = (item.name || 'T')
                .split(' ')
                .map(n => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              let badgeIcon = <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />;
              let badgeText = 'Opted-in';
              let badgeStyle = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';

              if (item.status === 'opted_out') {
                badgeIcon = <Ban className="w-3 h-3 text-rose-500 shrink-0" />;
                badgeText = 'Opted-out';
                badgeStyle = 'bg-rose-500/10 text-rose-600 border-rose-500/20';
              } else if (item.status === 'duplicate_removed') {
                badgeIcon = <Copy className="w-3 h-3 text-amber-500 shrink-0" />;
                badgeText = 'Duplicate';
                badgeStyle = 'bg-amber-500/10 text-amber-600 border-amber-500/20';
              } else if (item.status === 'invalid') {
                badgeIcon = <AlertOctagon className="w-3 h-3 text-red-500 shrink-0" />;
                badgeText = 'Invalid';
                badgeStyle = 'bg-red-500/10 text-red-600 border-red-500/20';
              }

              return (
                <div key={idx} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8.5 h-8.5 rounded-full bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-[11px] font-bold text-indigo-600 shrink-0 select-none">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-foreground truncate">
                          {item.name || 'there'}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${badgeStyle}`}>
                          {badgeIcon}
                          {badgeText}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground/75 truncate mt-0.5">
                        {item.phone_number || 'No number'} {item.email ? `· ${item.email}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[11.5px] font-medium text-foreground block">
                      {item.source_label}
                    </span>
                    <span className="text-[9.5px] text-muted-foreground/60 block mt-0.5">
                      Source: {item.source_type.toUpperCase()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer remaining count link */}
        {remainingCount > 0 && !isLoading && (
          <div className="px-5 py-3.5 bg-secondary/5 border-t border-border/20 flex items-center justify-between text-[12px] font-medium select-none">
            <span className="text-muted-foreground/75">
              +{remainingCount.toLocaleString()} more recipient{remainingCount !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={onOpenDrawer}
              className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-bold group"
            >
              View All
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
