"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Check, Filter, User, Tag, Star, Users } from 'lucide-react';
import { List, type RowComponentProps } from 'react-window';
import { useDebounceCallback } from '../hooks/useDebounce';
import { recipientDisplayName, contactInitials } from '@/lib/broadcast/recipient-name';

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  email?: string;
  tags?: string[];
  last_message_at?: string;
  converted_at?: string;
}

interface ContactPickerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: string[];
  onApply: (selectedIds: string[], contacts: Contact[]) => void;
}

interface ContactRowItemProps {
  contact: Contact;
  isChecked: boolean;
  onToggle: (id: string) => void;
  style?: React.CSSProperties;
}

const ContactRowItem = React.memo(function ContactRowItem({
  contact,
  isChecked,
  onToggle,
  style,
}: ContactRowItemProps) {
  return (
    <div
      style={style}
      onClick={() => onToggle(contact.id)}
      className={`flex items-center gap-3 px-6 py-2 border-b border-border/25 hover:bg-secondary/20 cursor-pointer transition-colors select-none ${
        isChecked ? 'bg-indigo-500/[0.02]' : ''
      }`}
    >
      {/* Checkbox */}
      <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${
        isChecked 
          ? 'bg-indigo-600 border-indigo-600 text-white' 
          : 'border-border/70 bg-background'
      }`}>
        {isChecked && <Check className="w-2.5 h-2.5 stroke-[3px]" />}
      </div>

      {/* Avatar */}
      <div className="w-8.5 h-8.5 rounded-full bg-secondary flex items-center justify-center text-[12px] font-bold text-muted-foreground uppercase shrink-0">
        {contactInitials(contact.name) || <User className="w-4 h-4 opacity-60" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[12.5px] font-semibold text-foreground leading-snug truncate">
          {recipientDisplayName(contact.name, contact.phone)}
        </p>
        <p className="text-[10.5px] text-muted-foreground/75 mt-0.5 tabular-nums">
          {contact.phone}
        </p>
      </div>

      {/* Tags */}
      {(contact.tags || []).length > 0 && (
        <div className="flex items-center gap-1 overflow-hidden shrink-0 max-w-[120px]">
          {contact.tags!.slice(0, 2).map(t => (
            <span key={t} className="px-1.5 py-0.5 rounded bg-secondary text-[9px] font-bold text-muted-foreground border border-border/40 uppercase">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

export function ContactPickerDrawer({
  isOpen,
  onClose,
  selectedIds,
  onApply,
}: ContactPickerDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set(selectedIds));
  
  // Filters
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('');
  const [vipFilter, setVipFilter] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Debounced search input handler
  const triggerSearchDebounce = useDebounceCallback((val: string) => {
    setDebouncedSearch(val);
  }, 350);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    triggerSearchDebounce(e.target.value);
  };

  // Sync initial selection ONLY when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTempSelected(new Set(selectedIds));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Load contacts based on search and filters
  useEffect(() => {
    if (!isOpen) return;

    const fetchContacts = async () => {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          q: debouncedSearch,
          limit: '1000', // Retrieve up to 1000 for local filtering and layout
        });
        if (selectedTagFilter) {
          queryParams.append('tag', selectedTagFilter);
        }

        const res = await fetch(`/api/broadcast/contacts/search?${queryParams.toString()}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.contacts)) {
          let list: Contact[] = data.contacts;

          // Locally filter VIP if checked (assume leads with score > 80 are VIP)
          if (vipFilter) {
            list = list.filter(c => (c.tags || []).some(t => t.toLowerCase() === 'vip' || t.toLowerCase() === 'hot'));
          }

          setContacts(list);
        }
      } catch (err) {
        console.error('Failed to load search contacts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, [isOpen, debouncedSearch, selectedTagFilter, vipFilter]);

  // Extract all distinct tags from contacts list to populate filter
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    contacts.forEach(c => (c.tags || []).forEach(t => tags.add(t)));
    return Array.from(tags).slice(0, 15);
  }, [contacts]);

  const toggleSelect = useCallback((id: string) => {
    setTempSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setTempSelected(prev => {
      const next = new Set(prev);
      const allFilteredIds = contacts.map(c => c.id);
      const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => next.has(id));

      if (areAllSelected) {
        allFilteredIds.forEach(id => next.delete(id));
      } else {
        allFilteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, [contacts]);

  const handleSelectNewest50 = useCallback(() => {
    setTempSelected(prev => {
      const next = new Set(prev);
      const top50 = contacts.slice(0, 50).map(c => c.id);
      top50.forEach(id => next.add(id));
      return next;
    });
  }, [contacts]);

  const handleApply = useCallback(() => {
    const selectedList = contacts.filter(c => tempSelected.has(c.id));
    onApply(Array.from(tempSelected), selectedList);
    onClose();
  }, [contacts, tempSelected, onApply, onClose]);

  // Virtual Row wrapper for > 200 items
  const VirtualRow = ({ index, style }: RowComponentProps) => {
    const contact = contacts[index];
    if (!contact) return null;
    return (
      <ContactRowItem
        contact={contact}
        isChecked={tempSelected.has(contact.id)}
        onToggle={toggleSelect}
        style={style}
      />
    );
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/50 backdrop-blur-[2.5px] z-[70]"
          />

          {/* Drawer Sliding Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 260 }}
            className="fixed inset-y-0 right-0 w-full sm:w-[520px] bg-white dark:bg-card border-l border-border shadow-2xl z-[70] flex flex-col overflow-hidden will-change-transform"
          >
            {/* Drawer Header */}
            <div className="px-6 py-4.5 border-b border-border/45 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8.5 h-8.5 rounded-lg bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center">
                  <Users className="w-4.5 h-4.5 text-indigo-500" />
                </div>
                <div className="text-left">
                  <h2 className="text-[14.5px] font-bold text-foreground tracking-tight leading-snug">Select Contacts</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Choose recipients manually for manual outreach</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Filter Search Header */}
            <div className="p-4 border-b border-border/30 bg-secondary/5 space-y-3 shrink-0">
              {/* Search Bar */}
              <div className="relative flex items-center">
                <Search className="absolute left-3 w-4 h-4 text-muted-foreground/45 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, phone number, email, or tags…"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full h-9.5 pl-9.5 pr-4 bg-background border border-border/60 hover:border-border/90 focus:border-indigo-500/40 rounded-xl text-[12.5px] text-foreground outline-none transition-all placeholder:text-muted-foreground/35"
                />
                {searchTerm && (
                  <button type="button" onClick={() => { setSearchTerm(''); setDebouncedSearch(''); }} className="absolute right-3 text-muted-foreground/40 hover:text-muted-foreground cursor-pointer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filters Chips row */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 scrollbar-none">
                {/* VIP filter */}
                <button
                  type="button"
                  onClick={() => setVipFilter(!vipFilter)}
                  className={`h-7 px-2.5 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 transition-all select-none cursor-pointer ${
                    vipFilter
                      ? 'bg-amber-500/10 border-amber-500/35 text-amber-600'
                      : 'bg-background border-border/70 text-muted-foreground hover:border-border'
                  }`}
                >
                  <Star className={`w-3 h-3 ${vipFilter ? 'fill-amber-500 text-amber-500' : ''}`} />
                  VIP Status
                </button>

                {/* Tags Filter list */}
                {allTags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? '' : tag)}
                    className={`h-7 px-2.5 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 transition-all select-none cursor-pointer ${
                      selectedTagFilter === tag
                        ? 'bg-indigo-500/10 border-indigo-500/35 text-indigo-600'
                        : 'bg-background border-border/70 text-muted-foreground hover:border-border'
                    }`}
                  >
                    <Tag className="w-3 h-3" />
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* List Operations */}
            <div className="px-6 py-2.5 bg-secondary/10 border-b border-border/25 flex items-center justify-between shrink-0 select-none text-[11.5px]">
              <span className="font-semibold text-muted-foreground/80">
                Showing {contacts.length} match{contacts.length !== 1 ? 'es' : ''}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSelectNewest50}
                  className="font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                >
                  ⚡ Select Newest 50
                </button>
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                >
                  {contacts.length > 0 && contacts.every(c => tempSelected.has(c.id))
                    ? 'Deselect All on Page'
                    : 'Select All on Page'}
                </button>
              </div>
            </div>

            {/* Contacts list */}
            <div className="flex-1 min-h-0 bg-background/5">
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-600 rounded-full animate-spin" />
                    <span className="text-[12px] font-semibold mt-1">Filtering contacts…</span>
                  </div>
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center px-6">
                  <User className="w-8 h-8 text-muted-foreground/30 mb-2.5" />
                  <p className="text-[13px] font-semibold text-foreground/80">No matching contacts found</p>
                  <p className="text-[11.5px] text-muted-foreground/60 max-w-[240px] mt-1 leading-relaxed">
                    Try refining your search term or selecting a different status filter chip.
                  </p>
                </div>
              ) : contacts.length <= 200 ? (
                <div className="overflow-y-auto h-full custom-scrollbar">
                  {contacts.map(contact => (
                    <ContactRowItem
                      key={contact.id}
                      contact={contact}
                      isChecked={tempSelected.has(contact.id)}
                      onToggle={toggleSelect}
                    />
                  ))}
                </div>
              ) : (
                <List
                  rowComponent={VirtualRow}
                  rowCount={contacts.length}
                  rowHeight={54}
                  rowProps={{}}
                  className="custom-scrollbar"
                  style={{ height: '100%', outline: 'none' }}
                />
              )}
            </div>

            {/* Sticky Selection control Footer */}
            <div className="p-4 border-t border-border/45 bg-card shrink-0 flex items-center justify-between shadow-[0_-8px_32px_rgba(0,0,0,0.02)] select-none">
              <div className="text-left">
                <span className="text-[12.5px] font-bold text-foreground block">
                  {tempSelected.size} contact{tempSelected.size !== 1 ? 's' : ''}
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5 inline-block">
                  Selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8.5 px-4 text-[11.5px] font-semibold border border-border/70 bg-background hover:bg-secondary/40 rounded-xl text-muted-foreground transition-all duration-[120ms] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="h-8.5 px-4.5 text-[11.5px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-500/10 rounded-xl transition-all duration-[120ms] active:scale-[0.98] cursor-pointer"
                >
                  Apply Selection
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

