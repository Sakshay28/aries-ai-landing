"use client";

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, CheckCircle, Ban, AlertOctagon, Copy, FileText, ExternalLink } from 'lucide-react';
import { FixedSizeList as List } from 'react-window';
import { RecipientRecord } from '@/lib/broadcast/services/broadcast-recipient.service';
import toast from 'react-hot-toast';

interface RecipientDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  recipients: RecipientRecord[];
  totalRecipients: number;
}

type FilterStatus = 'all' | 'eligible' | 'opted_out' | 'invalid' | 'duplicate_removed';

export function RecipientDrawer({ isOpen, onClose, recipients, totalRecipients }: RecipientDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');

  // Filter and search logic
  const filteredRecipients = useMemo(() => {
    return recipients.filter(r => {
      // 1. Apply tab filter
      if (activeFilter !== 'all' && r.status !== activeFilter) {
        return false;
      }
      // 2. Apply search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = (r.name || '').toLowerCase().includes(query);
        const phoneMatch = (r.phone_number || '').includes(query);
        const emailMatch = (r.email || '').toLowerCase().includes(query);
        const labelMatch = (r.source_label || '').toLowerCase().includes(query);
        return nameMatch || phoneMatch || emailMatch || labelMatch;
      }
      return true;
    });
  }, [recipients, activeFilter, searchQuery]);

  // Export to CSV helper
  const handleExportCSV = () => {
    if (filteredRecipients.length === 0) {
      toast.error('No recipients to export');
      return;
    }
    const headers = ['Name', 'Phone', 'Email', 'Source Type', 'Source Label', 'Status'];
    const rows = filteredRecipients.map(r => [
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
    toast.success(`Exported ${filteredRecipients.length} recipients to CSV!`);
  };

  // Custom row renderer for react-window virtualization
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = filteredRecipients[index];
    if (!item) return null;

    const initials = (item.name || 'T')
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    // Map source labels cleanly
    let statusIcon = <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
    let statusText = 'Opted-In';
    let statusClass = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';

    if (item.status === 'opted_out') {
      statusIcon = <Ban className="w-3.5 h-3.5 text-rose-500" />;
      statusText = 'Opted-Out';
      statusClass = 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    } else if (item.status === 'duplicate_removed') {
      statusIcon = <Copy className="w-3.5 h-3.5 text-amber-500" />;
      statusText = 'Duplicate';
      statusClass = 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    } else if (item.status === 'invalid') {
      statusIcon = <AlertOctagon className="w-3.5 h-3.5 text-red-500" />;
      statusText = 'Invalid';
      statusClass = 'bg-red-500/10 text-red-600 border-red-500/20';
    }

    return (
      <div
        style={style}
        className="flex items-center justify-between px-5 border-b border-border/30 hover:bg-secondary/15 transition-all text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-8.5 h-8.5 rounded-full bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-[11px] font-bold text-indigo-600 shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-semibold text-foreground truncate">
                {item.name || 'there'}
              </span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold border leading-none ${statusClass}`}>
                {statusIcon}
                {statusText}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground/75 truncate mt-0.5">
              {item.phone_number || 'No number'} {item.email ? `· ${item.email}` : ''}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0 min-w-[150px] pl-4">
          <span className="text-[11.5px] font-medium text-foreground block truncate">
            {item.source_label}
          </span>
          <span className="text-[9.5px] text-muted-foreground/60 block mt-0.5">
            Source: {item.source_type.toUpperCase()}
          </span>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-50 backdrop-blur-xs"
          />

          {/* Sliding Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-[640px] bg-background border-l border-border/80 shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-5 pt-5 pb-4 border-b border-border/40 flex items-center justify-between shrink-0">
              <div className="text-left">
                <h2 className="text-[17px] font-bold text-foreground tracking-tight">
                  Recipients List
                </h2>
                <p className="text-[12px] text-muted-foreground/80 mt-0.5">
                  {totalRecipients.toLocaleString()} contact{totalRecipients !== 1 ? 's' : ''} ready for dispatch
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 hover:bg-secondary/35 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-all"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg hover:bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
                  aria-label="Close panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="px-5 py-3 border-b border-border/20 bg-secondary/5 flex flex-wrap gap-1.5 shrink-0 select-none">
              {[
                { id: 'all', label: 'All' },
                { id: 'eligible', label: 'Eligible (Opted In)' },
                { id: 'opted_out', label: 'Excluded (Opted Out)' },
                { id: 'duplicate_removed', label: 'Duplicates' },
                { id: 'invalid', label: 'Invalid' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id as FilterStatus)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                    activeFilter === tab.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-transparent text-muted-foreground border-border/50 hover:bg-secondary/30'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Bar */}
            <div className="px-5 py-3 border-b border-border/20 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search recipients by name, phone, or tags..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-9.5 pl-9 pr-4 bg-secondary/10 border border-border/50 focus:border-indigo-500/50 rounded-lg text-[12.5px] text-foreground outline-none transition-all placeholder:text-muted-foreground/35"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Virtualized Recipient List */}
            <div className="flex-1 min-h-0 bg-background/50">
              {filteredRecipients.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                  <Search className="w-8 h-8 text-muted-foreground/20 mb-3" />
                  <p className="text-[13px] font-semibold text-muted-foreground">
                    No recipients match the filters or search
                  </p>
                  <p className="text-[11.5px] text-muted-foreground/60 mt-1">
                    Try clearing search criteria or changing filter tab.
                  </p>
                </div>
              ) : (
                <List
                  height={500}
                  itemCount={filteredRecipients.length}
                  itemSize={52}
                  width="100%"
                  className="custom-scrollbar"
                  style={{ height: '100%' }}
                >
                  {Row}
                </List>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
