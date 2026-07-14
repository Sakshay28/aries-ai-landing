"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Check, FileText, RotateCcw, AlertTriangle, Users, User } from 'lucide-react';
import { List, type RowComponentProps } from 'react-window';
import { RecipientRecord } from '@/lib/broadcast/services/broadcast-recipient.service';
import { cleanContactName, recipientDisplayName, contactInitials } from '@/lib/broadcast/recipient-name';
import toast from 'react-hot-toast';

interface RecipientDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  recipients: RecipientRecord[];
  totalRecipients: number;
  manualContactIds?: string[];
  excludedContactIds?: string[];
  onAudienceChange?: (patch: { manualContactIds: string[]; excludedContactIds: string[] }) => void;
}

type FilterStatus = 'all' | 'selected' | 'excluded' | 'compliance';

export function RecipientDrawer({
  isOpen,
  onClose,
  recipients,
  totalRecipients,
  manualContactIds = [],
  excludedContactIds = [],
  onAudienceChange,
}: RecipientDrawerProps) {
  // Use passed props instead of global store
  const audience = { manualContactIds, excludedContactIds };
  const updateAudience = (patch: { manualContactIds?: string[]; excludedContactIds?: string[] }) => {
    onAudienceChange?.({
      manualContactIds:  patch.manualContactIds  ?? manualContactIds,
      excludedContactIds: patch.excludedContactIds ?? excludedContactIds,
    });
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterStatus>('all');
  const [tempManualContactIds, setTempManualContactIds] = useState<Set<string>>(new Set());
  const [tempExcludedContactIds, setTempExcludedContactIds] = useState<Set<string>>(new Set());

  const [crmSearchResults, setCrmSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Sync state on open
  useEffect(() => {
    if (isOpen) {
      setTempManualContactIds(new Set(audience.manualContactIds || []));
      setTempExcludedContactIds(new Set(audience.excludedContactIds || []));
      setSearchQuery('');
      setCrmSearchResults([]);
    }
  }, [isOpen, audience.manualContactIds, audience.excludedContactIds]);

  // CRM Search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setCrmSearchResults([]);
      return;
    }

    const searchCRM = async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/broadcast/contacts/search?q=${encodeURIComponent(searchQuery)}&limit=15`);
        const data = await res.json();
        if (data.success && Array.isArray(data.contacts)) {
          // Exclude contacts already in the resolved list
          const existingIds = new Set(recipients.map(r => r.contact_id || (r as any).id));
          const newContacts = data.contacts.filter((c: any) => !existingIds.has(c.id));
          setCrmSearchResults(newContacts);
        }
      } catch (err) {
        console.error('Failed to search CRM contacts:', err);
      } finally {
        setSearchLoading(false);
      }
    };

    const timer = setTimeout(searchCRM, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, recipients]);

  // Toggle selection
  const toggleContact = (contactId: string, isManual: boolean) => {
    const nextExcluded = new Set(tempExcludedContactIds);
    const nextManual = new Set(tempManualContactIds);

    if (isManual) {
      if (nextManual.has(contactId)) {
        nextManual.delete(contactId);
      } else {
        nextManual.add(contactId);
      }
    } else {
      if (nextExcluded.has(contactId)) {
        nextExcluded.delete(contactId);
      } else {
        nextExcluded.add(contactId);
      }
    }

    setTempManualContactIds(nextManual);
    setTempExcludedContactIds(nextExcluded);
  };

  // Filter in-memory recipients
  const filteredRecipients = useMemo(() => {
    return recipients.filter(r => {
      const id = r.contact_id || (r as any).id;
      const isManual = r.source_type === 'manual';
      const isSelected = isManual ? tempManualContactIds.has(id) : !tempExcludedContactIds.has(id);

      if (activeFilter === 'selected') {
        if (!isSelected || r.status !== 'eligible') return false;
      } else if (activeFilter === 'excluded') {
        if (r.status === 'excluded' || tempExcludedContactIds.has(id)) {
          // manually excluded
        } else {
          return false;
        }
      } else if (activeFilter === 'compliance') {
        if (r.status === 'eligible' || r.status === 'excluded') return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = (cleanContactName(r.name) || '').toLowerCase().includes(query);
        const phoneMatch = (r.phone_number || '').replace(/\D/g, '').includes(query.replace(/\D/g, '')) && query.replace(/\D/g, '') !== '';
        const rawPhoneMatch = (r.phone_number || '').toLowerCase().includes(query);
        const emailMatch = (r.email || '').toLowerCase().includes(query);
        const labelMatch = (r.source_label || '').toLowerCase().includes(query);
        return nameMatch || phoneMatch || rawPhoneMatch || emailMatch || labelMatch;
      }
      return true;
    });
  }, [recipients, activeFilter, searchQuery, tempManualContactIds, tempExcludedContactIds]);

  // Combined List Items
  const allListItems = useMemo(() => {
    const items = filteredRecipients.map(r => {
      const id = r.contact_id || (r as any).id;
      const isManual = r.source_type === 'manual';
      const isSelected = isManual ? tempManualContactIds.has(id) : !tempExcludedContactIds.has(id);
      return {
        id,
        name: cleanContactName(r.name),                        // real name or null
        displayName: recipientDisplayName(r.name, r.phone_number), // never a placeholder
        phone: r.phone_number,
        email: r.email,
        source_type: r.source_type,
        source_label: r.source_label,
        status: r.status,
        isManual,
        isSelected,
        tags: [] as string[]
      };
    });

    // Append CRM search results if search is active
    if (searchQuery.trim() && activeFilter === 'all') {
      crmSearchResults.forEach(c => {
        const id = c.id;
        const isSelected = tempManualContactIds.has(id);
        items.push({
          id,
          name: cleanContactName(c.name),
          displayName: recipientDisplayName(c.name, c.phone),
          phone: c.phone,
          email: c.email || '',
          source_type: 'manual',
          source_label: 'CRM Search',
          status: 'eligible',
          isManual: true,
          isSelected,
          tags: c.tags || []
        });
      });
    }

    return items;
  }, [filteredRecipients, crmSearchResults, searchQuery, activeFilter, tempManualContactIds, tempExcludedContactIds]);

  // Bulk Actions
  const handleSelectAll = () => {
    const nextExcluded = new Set(tempExcludedContactIds);
    const nextManual = new Set(tempManualContactIds);

    allListItems.forEach(item => {
      if (item.status === 'eligible') {
        if (item.isManual) {
          nextManual.add(item.id);
        } else {
          nextExcluded.delete(item.id);
        }
      }
    });

    setTempExcludedContactIds(nextExcluded);
    setTempManualContactIds(nextManual);
    toast.success('Selected all visible eligible contacts');
  };

  const handleDeselectAll = () => {
    const nextExcluded = new Set(tempExcludedContactIds);
    const nextManual = new Set(tempManualContactIds);

    allListItems.forEach(item => {
      if (item.isManual) {
        nextManual.delete(item.id);
      } else {
        nextExcluded.add(item.id);
      }
    });

    setTempExcludedContactIds(nextExcluded);
    setTempManualContactIds(nextManual);
    toast.success('Deselected all visible contacts');
  };

  const handleResetAudience = () => {
    setTempExcludedContactIds(new Set());
    setTempManualContactIds(new Set());
    toast.success('Restored audience targeting defaults');
  };

  const handleApply = () => {
    updateAudience({
      manualContactIds: Array.from(tempManualContactIds),
      excludedContactIds: Array.from(tempExcludedContactIds)
    });
    onClose();
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (allListItems.length === 0) {
      toast.error('No recipients to export');
      return;
    }
    const headers = ['Name', 'Phone', 'Email', 'Source Type', 'Source Label', 'Status'];
    const rows = allListItems.map(r => [
      r.displayName,
      r.phone || '',
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
    toast.success(`Exported ${allListItems.length} recipients to CSV!`);
  };

  // Computed Selected Count (For sticky bottom dock)
  const selectedCount = useMemo(() => {
    let count = 0;
    recipients.forEach(r => {
      const id = r.contact_id || (r as any).id;
      const isManual = r.source_type === 'manual';
      if (isManual) {
        if (tempManualContactIds.has(id)) count++;
      } else {
        if (r.status === 'eligible' && !tempExcludedContactIds.has(id)) {
          count++;
        }
      }
    });

    // Count CRM search results that are checked
    const resolvedIds = new Set(recipients.map(r => r.contact_id || (r as any).id));
    tempManualContactIds.forEach(id => {
      if (!resolvedIds.has(id)) {
        count++;
      }
    });

    return count;
  }, [recipients, tempExcludedContactIds, tempManualContactIds]);

  // Determine if virtualization is needed
  const shouldVirtualize = allListItems.length > 300;

  // Single Row Renderer Component
  const ContactRow = ({ item }: { item: typeof allListItems[0] }) => {
    const isChecked = item.isSelected && item.status === 'eligible';
    const isExcluded = !item.isSelected || item.status === 'excluded';
    const isComplianceExcluded = item.status !== 'eligible' && item.status !== 'excluded';

    // Badges array
    const badges: string[] = [];
    if (item.source_label && item.source_label !== 'Manual Selection' && item.source_label !== 'CRM Search') {
      badges.push(item.source_label);
    }
    if (item.isManual) {
      badges.push('Manual override');
    }

    const initials = contactInitials(item.name);

    let complianceLabel = '';
    let complianceClass = '';
    if (isComplianceExcluded) {
      if (item.status === 'opted_out') {
        complianceLabel = 'Opted-Out';
        complianceClass = 'bg-rose-500/10 text-rose-600 border-rose-500/20';
      } else if (item.status === 'no_consent') {
        complianceLabel = 'No Consent';
        complianceClass = 'bg-rose-500/10 text-rose-600 border-rose-500/20';
      } else if (item.status === 'duplicate_removed') {
        complianceLabel = 'Duplicate';
        complianceClass = 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      } else if (item.status === 'invalid') {
        complianceLabel = 'Invalid';
        complianceClass = 'bg-red-500/10 text-red-600 border-red-500/20';
      }
    }

    return (
      <div
        onClick={() => {
          if (isComplianceExcluded) {
            toast.error(`Cannot select contact: compliance status is ${item.status}`);
            return;
          }
          toggleContact(item.id, item.isManual);
        }}
        className={`flex items-center justify-between px-5 py-3 border-b border-border/30 cursor-pointer select-none transition-all duration-[120ms] ${
          isChecked
            ? 'border-indigo-500/20 bg-indigo-500/[0.04] dark:bg-indigo-550/[0.02]'
            : 'hover:bg-zinc-500/[0.04]'
        } ${isExcluded && !isComplianceExcluded ? 'opacity-70 bg-zinc-50/40 dark:bg-zinc-900/10' : ''}`}
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1 text-left">
          {/* Checkbox */}
          <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${
            isChecked
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'border-border/80 bg-background'
          } ${isComplianceExcluded ? 'opacity-40 cursor-not-allowed' : ''}`}>
            {isChecked && <Check className="w-2.5 h-2.5 stroke-[3px]" />}
          </div>

          {/* Avatar */}
          <div className={`w-8.5 h-8.5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
            isChecked
              ? 'bg-indigo-500/10 border border-indigo-500/15 text-indigo-600'
              : 'bg-zinc-100 dark:bg-zinc-900 border border-border/40 text-muted-foreground'
          }`}>
            {initials || <User className="w-4 h-4 opacity-60" />}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-foreground truncate">
                {item.displayName}
              </span>
              {complianceLabel && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border leading-none shrink-0 ${complianceClass}`}>
                  {complianceLabel}
                </span>
              )}
            </div>
            <p className="text-[11.5px] text-muted-foreground/75 truncate mt-0.5">
              {item.phone || 'No number'} {item.email ? `· ${item.email}` : ''}
            </p>
            {badges.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {badges.map((b, idx) => (
                  <span key={idx} className="inline-flex items-center text-[10px] font-semibold text-muted-foreground bg-zinc-100 dark:bg-zinc-900 border border-border/30 rounded-md px-1.5 py-0.5 uppercase tracking-wide leading-none">
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Virtual Row wrapper
  const VirtualRow = ({ index, style }: RowComponentProps) => {
    const item = allListItems[index];
    if (!item) return null;
    return (
      <div style={style}>
        <ContactRow item={item} />
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

          {/* HubSpot style Audience selector Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-[500px] bg-background border-l border-border/80 shadow-2xl z-50 flex flex-col overflow-hidden text-left"
          >
            {/* 1. Header (Sticky) */}
            <div className="px-5 pt-5 pb-4 border-b border-border/40 shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-[17px] font-bold text-foreground tracking-tight">
                    Recipients
                  </h2>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Manage who receives this broadcast
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg hover:bg-secondary/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
                  aria-label="Close drawer"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              </div>

              {/* 2. Search */}
              <div className="mt-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search recipients, or find anyone in CRM to add..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-9.5 pr-8 bg-secondary/15 border border-border/50 focus:border-indigo-500/50 rounded-xl text-[12.5px] text-foreground outline-none transition-all placeholder:text-muted-foreground/35"
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

              {/* 3. Filter Chips */}
              <div className="mt-3.5 flex flex-wrap gap-1.5 select-none">
                {[
                  { id: 'all', label: 'All Contacts' },
                  { id: 'selected', label: 'Ready to send' },
                  { id: 'excluded', label: 'Excluded' },
                  { id: 'compliance', label: 'Blocked' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveFilter(tab.id as FilterStatus)}
                    className={`h-7 px-3 rounded-full text-[11px] font-semibold border transition-all ${
                      activeFilter === tab.id
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/10'
                        : 'bg-transparent text-muted-foreground border-border/55 hover:bg-secondary/30'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* 4. Bulk Actions */}
              <div className="mt-4.5 flex items-center justify-between border-t border-border/20 pt-3 text-[11px] font-semibold text-muted-foreground select-none">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSelectAll}
                    className="hover:text-indigo-600 transition-all"
                  >
                    Select All
                  </button>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <button
                    onClick={handleDeselectAll}
                    className="hover:text-rose-600 transition-all"
                  >
                    Deselect All
                  </button>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <button
                    onClick={handleResetAudience}
                    className="hover:text-zinc-950 dark:hover:text-white flex items-center gap-1 transition-all"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Audience
                  </button>
                </div>
                <div>
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-1 hover:text-indigo-650 transition-all"
                  >
                    <FileText className="w-3 h-3" />
                    Export CSV
                  </button>
                </div>
              </div>
            </div>

            {/* 5. Scrollable Contacts */}
            <div className="flex-1 min-h-0 bg-background">
              {searchLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-650 rounded-full animate-spin" />
                  <span className="text-[12px] text-muted-foreground">Searching database...</span>
                </div>
              ) : allListItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
                  <Users className="w-8 h-8 text-muted-foreground/30 mb-2.5" />
                  <p className="text-[13px] font-semibold text-foreground/80">No contacts match</p>
                  <p className="text-[11.5px] text-muted-foreground/60 max-w-[240px] mt-1 leading-relaxed">
                    Refine search query, change filter tab, or reset targeting rules.
                  </p>
                </div>
              ) : shouldVirtualize ? (
                <List
                  rowComponent={VirtualRow}
                  rowCount={allListItems.length}
                  rowHeight={82}
                  rowProps={{}}
                  className="custom-scrollbar"
                  style={{ height: '100%' }}
                />
              ) : (
                <div className="divide-y divide-border/30 overflow-y-auto h-full custom-scrollbar">
                  {allListItems.map(item => (
                    <ContactRow key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>

            {/* 6. Bottom Sticky Dock Summary */}
            <div className="px-5 py-4 border-t border-border/40 bg-zinc-50 dark:bg-zinc-950/70 shrink-0 flex items-center justify-between shadow-[0_-8px_32px_rgba(0,0,0,0.02)]">
              <div className="text-left select-none">
                <span className="text-[15px] font-extrabold text-foreground block">
                  {selectedCount.toLocaleString()} selected
                </span>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5 inline-block">
                  Receiving broadcast
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-4.5 text-[12px] font-semibold border border-border/70 hover:bg-secondary/40 rounded-xl text-muted-foreground transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="h-9 px-5 text-[12.5px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-500/10 rounded-xl transition-all active:scale-[0.98]"
                >
                  Apply changes
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
