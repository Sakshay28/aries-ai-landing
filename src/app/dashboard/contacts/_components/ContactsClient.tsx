"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, Filter, Plus, Users, Zap, BrainCircuit, Activity, 
  MessageSquare, UserCircle2, ArrowLeft, ArrowRight, MoreHorizontal, 
  Sparkles, CheckCircle2, AlertCircle, Phone, Mail, Clock, 
  Download, UploadCloud, FileSpreadsheet, Database, X, 
  CheckSquare, Square, ChevronRight, Edit2, Trash2, Calendar
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { SkeletonRow } from '@/components/ui/skeleton';
import { useContactsStore, CSVPreviewRow } from '@/lib/store/contactsStore';
import { normalizePhone, isValidPhone, formatPhoneDisplay } from '@/lib/utils/phone';
import { toast } from 'sonner';

// --- TYPES ---
interface Contact {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  email: string;
  channel: string;
  lead_status: string;
  lead_score: number;
  lastActive: string;
  created_at: string;
  notes: string;
}

interface TimelineEvent {
  sender?: 'user' | 'ai' | 'human';
  time: string;
  content: string;
}

// --- HELPERS ---
function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'Yesterday';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatChannel(channel: string): string {
  switch (channel) {
    case 'whatsapp': return 'WhatsApp';
    case 'manual': return 'Manual';
    case 'imported': return 'Imported';
    case 'shopify': return 'Shopify';
    case 'website': return 'Website';
    default: return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
}

function getAvatarInitials(name: string, phone: string): string {
  const cleanName = (name && name !== phone) ? name : 'Unnamed';
  const parts = cleanName.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return cleanName.slice(0, 2).toUpperCase();
}

// Sidebar Filter Definitions
const FILTER_TABS = [
  { id: 'all', label: 'All Contacts', icon: Users },
  { id: 'recent', label: 'Recent', icon: Activity },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { id: 'manual', label: 'Manual', icon: UserCircle2 },
  { id: 'imported', label: 'Imported', icon: FileSpreadsheet },
];

export function ContactsClient() {
  const router = useRouter();
  
  // Connect Zustand Store for Centralized UI State & Query Invalidation
  const {
    activeFilter, setActiveFilter,
    searchQuery, setSearchQuery,
    selectedContactId, setSelectedContactId,
    drawerOpen, setDrawerOpen,
    addContactModalOpen, setAddContactModalOpen,
    csvImportStep, setCsvImportStep,
    csvFile, setCsvFile,
    csvPreviewRows, setCsvPreviewRows,
    csvImportResult, setCsvImportResult,
    csvError, setCsvError,
    csvUploading, setCsvUploading,
    workspaceDefaultCountryCode,
    queryTrigger, invalidateQueries
  } = useContactsStore();

  // Local State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({
    all: 0, recent: 0, whatsapp: 0, manual: 0, imported: 0
  });

  // Timeline & Drawer specific state
  const [profileTimeline, setProfileTimeline] = useState<TimelineEvent[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileConvId, setProfileConvId] = useState<string | null>(null);

  // Add Contact Form State
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addFormError, setAddFormError] = useState<string | null>(null);
  const [duplicateCheckedId, setDuplicateCheckedId] = useState<string | null>(null);
  const [isDuplicateChecking, setIsDuplicateChecking] = useState(false);

  // Edit Form State (Inside Drawer)
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Deletion State
  const [isDeleting, setIsDeleting] = useState(false);

  // CSV Import mapping options
  const [mergeDuplicates, setMergeDuplicates] = useState(true);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duplicateCheckDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = createBrowserSupabaseClient();

  // ── DATA FETCHING (SERVER TRUTH) ──────────────────────────
  const fetchContactsData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '50');
      params.append('offset', '0');
      params.append('cc', workspaceDefaultCountryCode);
      if (activeFilter !== 'all') {
        params.append('filter', activeFilter);
      }
      if (searchQuery.trim()) {
        params.append('q', searchQuery.trim());
      }

      const res = await fetch(`/api/dashboard/contacts?${params.toString()}`);
      const json = await res.json();
      if (res.ok && json.success) {
        setContacts((json.data || []).map((lead: any) => {
          const formattedPhone = formatPhoneDisplay(lead.phone);
          const name = lead.name && lead.name.trim() ? lead.name : formattedPhone;
          return {
            id: lead.id,
            name,
            avatar: getAvatarInitials(lead.name || '', lead.phone),
            phone: lead.phone,
            email: lead.email || '—',
            channel: (lead.channel === 'manual' && lead.source_detail === 'csv_import') ? 'imported' : (lead.channel || 'manual'),
            lead_status: lead.lead_status || 'new',
            lead_score: lead.lead_score || 0,
            lastActive: timeAgo(lead.last_message_at || lead.created_at),
            created_at: lead.created_at,
            notes: lead.notes || '',
          };
        }));
        
        if (json.counts) {
          setFilterCounts(json.counts);
        }
      } else {
        toast.error(json.message || 'Failed to fetch contacts.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load contacts due to a network error.');
    } finally {
      setLoading(false);
    }
  }, [activeFilter, searchQuery, workspaceDefaultCountryCode]);

  // Trigger fetch when parameters or manual invalidations happen
  useEffect(() => {
    fetchContactsData();
  }, [fetchContactsData, queryTrigger]);

  // Load selected contact timeline / conversation preview
  const loadProfileTimeline = useCallback(async (contactId: string) => {
    setProfileLoading(true);
    setProfileTimeline([]);
    setProfileConvId(null);
    try {
      // Find the latest conversation linked to this lead/contact
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('lead_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!conv) {
        setProfileLoading(false);
        return;
      }
      setProfileConvId(conv.id);

      // Load the last 3 messages for instant context preview
      const { data: msgs } = await supabase
        .from('messages')
        .select('content, direction, ai_generated, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(3);

      const events: TimelineEvent[] = (msgs || []).map((m: any) => ({
        sender: (m.direction === 'inbound' ? 'user' : (m.ai_generated ? 'ai' : 'human')) as 'user' | 'ai' | 'human',
        time: new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        content: m.content,
      })).reverse(); // Sort chronologically for preview
      
      setProfileTimeline(events);
    } catch (err) {
      console.error('Timeline fetch error:', err);
    } finally {
      setProfileLoading(false);
    }
  }, [supabase]);

  // Load timeline when contact is selected
  useEffect(() => {
    if (selectedContactId) {
      loadProfileTimeline(selectedContactId);
      setIsEditing(false);
    }
  }, [selectedContactId, loadProfileTimeline]);

  // ── SEARCH DEBOUNCER ──────────────────────────────────────
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      invalidateQueries();
    }, 250);
  };

  // ── ADD CONTACT FORM + DUPLICATE PRE-CHECKS ─────────────────
  const triggerDuplicateCheck = (rawPhone: string) => {
    setDuplicateCheckedId(null);
    setAddFormError(null);
    const phone = normalizePhone(rawPhone, workspaceDefaultCountryCode);
    if (!phone || !isValidPhone(phone)) return;

    setIsDuplicateChecking(true);
    if (duplicateCheckDebounceRef.current) clearTimeout(duplicateCheckDebounceRef.current);
    
    duplicateCheckDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/dashboard/contacts/import/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phones: [phone], defaultCountryCode: workspaceDefaultCountryCode }),
        });
        const json = await res.json();
        if (res.ok && json.success && json.leads && json.leads.length > 0) {
          setDuplicateCheckedId(json.leads[0].id || 'unknown');
          setAddFormError('Contact with this phone number already exists.');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsDuplicateChecking(false);
      }
    }, 400);
  };

  const handleAddPhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAddForm({ ...addForm, phone: val });
    triggerDuplicateCheck(val);
  };

  const handleAddContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddFormError(null);

    const phone = normalizePhone(addForm.phone, workspaceDefaultCountryCode);
    if (!phone || !isValidPhone(phone)) {
      setAddFormError('Please enter a valid phone number.');
      return;
    }

    if (duplicateCheckedId) {
      setAddFormError('Cannot save: contact already exists.');
      return;
    }

    setAddSubmitting(true);
    try {
      const res = await fetch('/api/dashboard/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name.trim() || null,
          phone: addForm.phone.trim(),
          email: addForm.email.trim() || null,
          notes: addForm.notes.trim() || null,
          channel: 'manual',
          defaultCountryCode: workspaceDefaultCountryCode
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setAddFormError(json.message || 'Failed to save contact.');
        return;
      }
      toast.success(json.message || 'Contact added successfully.');
      setAddContactModalOpen(false);
      setAddForm({ name: '', phone: '', email: '', notes: '' });
      invalidateQueries();
    } catch (err) {
      console.error(err);
      setAddFormError('A network error occurred. Please try again.');
    } finally {
      setAddSubmitting(false);
    }
  };

  // ── IN-DRAWER EDIT CONTACT ────────────────────────────────
  const handleStartEditing = (contact: Contact) => {
    setEditForm({
      name: contact.name !== 'Unnamed Contact' ? contact.name : '',
      phone: contact.phone,
      email: contact.email !== '—' ? contact.email : '',
      notes: contact.notes,
    });
    setIsEditing(true);
  };

  const handleEditContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContactId) return;

    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/dashboard/contacts/${selectedContactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim() || null,
          phone: editForm.phone.trim(),
          email: editForm.email.trim() || null,
          notes: editForm.notes.trim() || null,
          defaultCountryCode: workspaceDefaultCountryCode
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Failed to update contact.');
        return;
      }
      toast.success('Contact details updated.');
      setIsEditing(false);
      invalidateQueries();
    } catch (err) {
      console.error(err);
      toast.error('Network error updating contact.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ── IN-DRAWER DELETE CONTACT ──────────────────────────────
  const handleDeleteContact = async () => {
    if (!selectedContactId || isDeleting) return;
    
    if (!confirm('Are you absolutely sure you want to delete this contact? This will remove all their CRM profile parameters.')) {
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/dashboard/contacts/${selectedContactId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Failed to delete contact.');
        return;
      }
      toast.success('Contact deleted successfully.');
      setDrawerOpen(false);
      setSelectedContactId(null);
      invalidateQueries();
    } catch (err) {
      console.error(err);
      toast.error('Network error deleting contact.');
    } finally {
      setIsDeleting(false);
    }
  };

  // --- CSV BULK IMPORT CONTROLLER ---
  const handleCsvFileDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setCsvError('Please select a valid CSV file (.csv).');
      return;
    }

    setCsvError(null);
    setCsvFile(file);
    setCsvUploading(true);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) {
        setCsvError('CSV must contain a header and at least 1 data row.');
        setCsvFile(null);
        setCsvUploading(false);
        return;
      }

      // Parse headers
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
      const phoneIndex = headers.findIndex(h => ['phone', 'mobile', 'whatsapp', 'phone_number', 'mobile number'].includes(h));
      const nameIndex = headers.findIndex(h => ['name', 'full name', 'full_name', 'contact'].includes(h));
      const emailIndex = headers.findIndex(h => ['email', 'email address', 'email_address'].includes(h));
      const notesIndex = headers.findIndex(h => ['notes', 'note', 'comment'].includes(h));

      if (phoneIndex === -1) {
        setCsvError('CSV must contain a phone column (e.g. "phone", "mobile").');
        setCsvFile(null);
        setCsvUploading(false);
        return;
      }

      // Extract up to 10 rows for preview mapping
      const previewRows: CSVPreviewRow[] = [];
      const checkPhones: string[] = [];

      for (let i = 1; i < Math.min(lines.length, 11); i++) {
        const cells = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        if (cells.length === 0 || !cells[phoneIndex]) continue;

        const phone = normalizePhone(cells[phoneIndex], workspaceDefaultCountryCode);
        const name = nameIndex !== -1 ? cells[nameIndex] || null : null;
        const email = emailIndex !== -1 ? cells[emailIndex] || null : null;
        const notes = notesIndex !== -1 ? cells[notesIndex] || null : null;

        const isValid = isValidPhone(phone);
        previewRows.push({
          name,
          phone: cells[phoneIndex], // Store raw phone in preview
          email,
          notes,
          status: isValid ? 'Ready' : 'Invalid',
          reason: isValid ? undefined : 'Malformed format',
        });

        if (isValid) {
          checkPhones.push(phone);
        }
      }

      // Check duplicates for preview rows in a single batch API call
      if (checkPhones.length > 0) {
        const dupRes = await fetch('/api/dashboard/contacts/import/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phones: checkPhones, defaultCountryCode: workspaceDefaultCountryCode }),
        });
        const dupJson = await dupRes.json();
        if (dupRes.ok && dupJson.success) {
          const duplicateSet = new Set(dupJson.duplicates);
          previewRows.forEach(row => {
            if (row.status === 'Ready') {
              const norm = normalizePhone(row.phone, workspaceDefaultCountryCode);
              if (duplicateSet.has(norm)) {
                row.status = 'Duplicate';
                row.reason = 'Exists in database';
              }
            }
          });
        }
      }

      setCsvPreviewRows(previewRows);
      setCsvImportStep('mapping');
    } catch (err) {
      console.error(err);
      setCsvError('Failed to parse CSV file.');
    } finally {
      setCsvUploading(false);
    }
  };

  const handleStartImportSubmit = async () => {
    if (!csvFile) return;

    setCsvUploading(true);
    setCsvImportStep('progress');
    setCsvError(null);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);

      const params = new URLSearchParams();
      params.append('cc', workspaceDefaultCountryCode);
      params.append('merge', mergeDuplicates ? 'true' : 'false');

      const res = await fetch(`/api/dashboard/contacts/import?${params.toString()}`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setCsvError(json.message || 'Import failed.');
        setCsvImportStep('csv');
        return;
      }

      setCsvImportResult(json.data);
      setCsvImportStep('done');
      invalidateQueries();
      toast.success('Contacts import completed.');
    } catch (err) {
      console.error(err);
      setCsvError('A network error occurred. Please try again.');
      setCsvImportStep('csv');
    } finally {
      setCsvUploading(false);
    }
  };

  const closeImportModal = () => {
    setCsvImportStep('hidden');
    setCsvFile(null);
    setCsvPreviewRows([]);
    setCsvImportResult(null);
    setCsvError(null);
    setCsvUploading(false);
  };

  // --- SUB-RENDERERS ---

  // Sliding Side Drawer Component
  const renderDetailDrawer = () => {
    const contact = contacts.find(c => c.id === selectedContactId);
    if (!contact || !drawerOpen) return null;

    return (
      <AnimatePresence>
        <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
          {/* Drawer backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-background/50 backdrop-blur-sm"
          />

          {/* Drawer sliding panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="relative w-full max-w-md bg-card border-l border-border h-full shadow-2xl flex flex-col z-50"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-background/50 backdrop-blur-md">
              <div className="flex items-center gap-2">
                <UserCircle2 className="w-5 h-5 text-indigo-500" />
                <h2 className="text-md font-bold tracking-tight text-foreground">Contact Profile</h2>
              </div>
              <button 
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 text-muted-foreground hover:bg-secondary rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              
              {/* Identity Header */}
              <div className="flex flex-col items-center text-center pb-4 border-b border-border/40">
                <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center text-xl font-bold border border-border mb-3 shadow-inner">
                  {contact.avatar}
                </div>
                <h3 className="text-md font-semibold text-foreground tracking-tight">{contact.name}</h3>
                <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <span>{formatChannel(contact.channel)}</span>
                  <span>•</span>
                  <span>Score {contact.lead_score}</span>
                </div>
              </div>

              {isEditing ? (
                // Drawer Edit Form
                <form onSubmit={handleEditContactSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full h-10 px-3 bg-background border border-border rounded-lg text-[13px] focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Phone Number</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +919876543210"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full h-10 px-3 bg-background border border-border rounded-lg text-[13px] focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. rahul@example.com"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full h-10 px-3 bg-background border border-border rounded-lg text-[13px] focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Notes</label>
                    <textarea
                      rows={3}
                      placeholder="Context about this contact..."
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-[13px] focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10 resize-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={editSubmitting}
                      className="flex-1 h-9 text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm"
                    >
                      {editSubmitting ? 'Updating...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="flex-1 h-9 text-[13px] font-semibold text-foreground bg-secondary hover:bg-secondary/80 rounded-lg border border-border"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                // Drawer View Panel
                <div className="space-y-5">
                  <div className="space-y-3">
                    <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">CRM Parameters</div>
                    <div className="flex items-center gap-3 text-[13px] font-medium text-foreground bg-background p-2.5 rounded-lg border border-border/80">
                      <Phone className="w-4 h-4 text-muted-foreground/60" />
                      <span>{formatPhoneDisplay(contact.phone)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[13px] font-medium text-foreground bg-background p-2.5 rounded-lg border border-border/80">
                      <Mail className="w-4 h-4 text-muted-foreground/60" />
                      <span>{contact.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[13px] font-medium text-foreground bg-background p-2.5 rounded-lg border border-border/80">
                      <Calendar className="w-4 h-4 text-muted-foreground/60" />
                      <span className="text-muted-foreground">Saved: </span>
                      <span>{new Date(contact.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>

                  {contact.notes && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Context Notes</div>
                      <div className="p-3 bg-secondary/30 border border-border rounded-lg text-[13px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
                        {contact.notes}
                      </div>
                    </div>
                  )}

                  {/* WhatsApp Conversation Preview */}
                  <div className="space-y-3 pt-2">
                    <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" /> Recent Messages
                    </div>
                    {profileLoading ? (
                      <div className="flex justify-center py-4">
                        <div className="w-4 h-4 border border-border border-t-indigo-500 rounded-full animate-spin" />
                      </div>
                    ) : profileTimeline.length === 0 ? (
                      <div className="p-3 bg-secondary/20 rounded-lg text-center text-[12.5px] text-muted-foreground italic border border-border/40">
                        No recent messages recorded.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {profileTimeline.map((msg, i) => (
                          <div 
                            key={i} 
                            className={`flex flex-col max-w-[85%] p-2.5 rounded-xl text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.02)] border ${
                              msg.sender === 'user' 
                                ? 'bg-background border-border/80 text-foreground self-start rounded-tl-none' 
                                : 'bg-indigo-50/50 dark:bg-indigo-500/10 border-indigo-100/50 dark:border-indigo-500/20 text-foreground self-end rounded-tr-none'
                            }`}
                          >
                            <span className="text-[10px] text-muted-foreground/60 mb-0.5">{msg.sender === 'user' ? 'Customer' : 'Aries AI'}</span>
                            <p className="leading-relaxed">{msg.content}</p>
                            <span className="text-[9px] text-muted-foreground/40 text-right mt-1">{msg.time}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            {!isEditing && (
              <div className="p-4 border-t border-border bg-background/50 backdrop-blur-md flex gap-2 shrink-0">
                <button
                  onClick={() => {
                    if (profileConvId) {
                      router.push(`/dashboard/chat?conversationId=${profileConvId}`);
                    } else {
                      router.push('/dashboard/chat');
                    }
                  }}
                  className="flex-1 h-10 text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" /> Message
                </button>
                <button
                  onClick={() => handleStartEditing(contact)}
                  className="h-10 px-3.5 text-[13px] font-semibold text-foreground bg-secondary hover:bg-secondary/80 rounded-lg border border-border flex items-center justify-center cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDeleteContact}
                  disabled={isDeleting}
                  className="h-10 px-3.5 text-[13px] font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 rounded-lg border border-red-200/50 dark:border-red-500/20 flex items-center justify-center cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </motion.div>
        </div>
      </AnimatePresence>
    );
  };

  // CSV Import Modal Component
  const renderImportModal = () => {
    if (csvImportStep === 'hidden') return null;

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
        {/* Modal Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !csvUploading && closeImportModal()}
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        />

        {/* Modal Body */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-2xl bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/50 backdrop-blur-md shrink-0">
            <div>
              <h2 className="text-md font-bold tracking-tight text-foreground">Import Contacts</h2>
              <p className="text-[13px] text-muted-foreground mt-0.5 font-medium">Overhaul and populate your lightweight CRM native directory.</p>
            </div>
            <button 
              disabled={csvUploading}
              onClick={closeImportModal} 
              className="p-1.5 text-muted-foreground hover:bg-secondary rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 md:p-8 overflow-y-auto flex-1 custom-scrollbar">
            
            {csvImportStep === 'source' && (
              <div className="space-y-5">
                <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">Select Sync Target</h3>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setCsvImportStep('csv')}
                    className="flex flex-col items-center text-center p-6 rounded-xl border border-indigo-500/30 bg-indigo-500/[0.02] hover:bg-indigo-500/[0.04] transition-all group cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <span className="text-[14px] font-bold text-foreground">Upload CSV File</span>
                    <span className="text-[12px] text-muted-foreground mt-1 leading-normal">Clean list parsing, validations, and custom mapping.</span>
                  </button>

                  <div className="flex flex-col items-center text-center p-6 rounded-xl border border-border bg-secondary/30 opacity-60 relative group select-none">
                    <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4 text-muted-foreground">
                      <Database className="w-6 h-6" />
                    </div>
                    <span className="text-[14px] font-bold text-foreground">Salesforce × HubSpot</span>
                    <span className="text-[12px] text-muted-foreground mt-1 leading-normal">Production-hardened direct integrations.</span>
                    <span className="absolute top-2 right-2 text-[9px] uppercase font-bold tracking-widest bg-secondary text-muted-foreground border border-border px-1.5 py-0.5 rounded">Soon</span>
                  </div>
                </div>
              </div>
            )}

            {csvImportStep === 'csv' && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Upload CSV Spreadsheet</h3>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    Required header: <span className="font-mono text-foreground bg-secondary px-1 py-0.5 rounded text-[12px]">phone</span>. Supported optional columns: <span className="font-mono text-foreground bg-secondary px-1 py-0.5 rounded text-[12px]">name</span>, <span className="font-mono text-foreground bg-secondary px-1 py-0.5 rounded text-[12px]">email</span>, <span className="font-mono text-foreground bg-secondary px-1 py-0.5 rounded text-[12px]">notes</span>.
                  </p>
                </div>

                <label
                  htmlFor="contacts-csv-input"
                  className="flex flex-col items-center justify-center w-full p-10 rounded-xl border-2 border-dashed border-border/80 hover:border-indigo-500/50 bg-background/50 hover:bg-indigo-500/[0.01] cursor-pointer transition-colors text-center shadow-inner"
                >
                  <UploadCloud className="w-10 h-10 text-muted-foreground/50 mb-3" />
                  <span className="text-[14px] font-bold text-foreground">
                    {csvFile ? csvFile.name : 'Choose contact list CSV'}
                  </span>
                  <span className="text-[12px] text-muted-foreground mt-1">
                    {csvFile ? `${(csvFile.size / 1024).toFixed(1)} KB — click to replace` : 'or drag and drop spreadsheet here'}
                  </span>
                  <input
                    id="contacts-csv-input"
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleCsvFileDrop}
                  />
                </label>

                {csvError && (
                  <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-200/50 dark:border-red-500/10 text-[13px] text-red-700 dark:text-red-400 flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <span>{csvError}</span>
                  </div>
                )}
              </div>
            )}

            {csvImportStep === 'mapping' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <h3 className="text-sm font-semibold text-foreground">Import Live Preview (First 10 rows)</h3>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={mergeDuplicates}
                      onChange={(e) => setMergeDuplicates(e.target.checked)}
                      className="rounded border-border text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                    />
                    <span className="text-[13px] font-medium text-foreground">Merge duplicates on conflict</span>
                  </label>
                </div>

                <div className="border border-border rounded-xl overflow-hidden shadow-sm">
                  <div className="grid grid-cols-4 text-[10.5px] uppercase tracking-wider font-bold text-muted-foreground bg-secondary/50 p-3 border-b border-border">
                    <div>Name</div>
                    <div>Phone</div>
                    <div>Email</div>
                    <div className="text-right">Status</div>
                  </div>
                  <div className="divide-y divide-border/60 max-h-60 overflow-y-auto custom-scrollbar">
                    {csvPreviewRows.map((row, i) => (
                      <div key={i} className="grid grid-cols-4 items-center p-3 text-[13px] bg-background hover:bg-secondary/10 transition-colors">
                        <div className="font-medium text-foreground truncate">{row.name || '—'}</div>
                        <div className="text-muted-foreground truncate">{formatPhoneDisplay(row.phone)}</div>
                        <div className="truncate text-muted-foreground">{row.email || '—'}</div>
                        <div className="text-right">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            row.status === 'Ready' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                            row.status === 'Duplicate' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' :
                            'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                          }`}>
                            {row.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {csvImportStep === 'progress' && (
              <div className="space-y-5 py-8 text-center flex flex-col items-center">
                <div className="w-12 h-12 rounded-full border-2 border-indigo-100 border-t-indigo-600 animate-spin mb-2"></div>
                <h3 className="text-[16px] font-bold text-foreground">Preparing your contacts</h3>
                <p className="text-[13px] text-muted-foreground max-w-sm leading-relaxed">
                  Checking duplicates, organizing phone numbers, and adding contacts safely.
                </p>
              </div>
            )}

            {csvImportStep === 'done' && csvImportResult && (
              <div className="space-y-6">
                <div className="flex flex-col items-center text-center py-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/50 dark:border-emerald-500/10 flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-md font-bold text-foreground">CSV Import Complete</h3>
                  <p className="text-[13px] text-muted-foreground mt-0.5">
                    Your contact database has been successfully populated.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 bg-emerald-50/40 dark:bg-emerald-500/5 border border-emerald-200/50 dark:border-emerald-500/10 rounded-xl">
                    <span className="text-[9.5px] font-bold tracking-wider uppercase text-emerald-700 dark:text-emerald-400">Imported</span>
                    <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100 mt-1">{csvImportResult.imported}</p>
                  </div>
                  <div className="p-4 bg-amber-50/40 dark:bg-amber-500/5 border border-amber-200/50 dark:border-amber-500/10 rounded-xl">
                    <span className="text-[9.5px] font-bold tracking-wider uppercase text-amber-700 dark:text-amber-400">Merged</span>
                    <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 mt-1">{csvImportResult.merged}</p>
                  </div>
                  <div className="p-4 bg-secondary/20 border border-border rounded-xl">
                    <span className="text-[9.5px] font-bold tracking-wider uppercase text-muted-foreground">Skipped</span>
                    <p className="text-2xl font-bold text-foreground mt-1">{csvImportResult.skipped}</p>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Footer controls */}
          <div className="p-5 border-t border-border bg-background/50 backdrop-blur-md flex justify-between items-center shrink-0">
            <button 
              disabled={csvUploading}
              onClick={closeImportModal} 
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
            >
              {csvImportStep === 'done' ? 'Done' : 'Cancel'}
            </button>
            
            <div className="flex gap-2">
              {csvImportStep === 'csv' && (
                <button 
                  onClick={() => setCsvImportStep('source')}
                  className="h-9 px-4 text-[13px] font-semibold text-foreground bg-secondary hover:bg-secondary/80 rounded-lg border border-border cursor-pointer"
                >
                  Back
                </button>
              )}
              {csvImportStep === 'mapping' && (
                <button 
                  onClick={() => setCsvImportStep('csv')}
                  className="h-9 px-4 text-[13px] font-semibold text-foreground bg-secondary hover:bg-secondary/80 rounded-lg border border-border cursor-pointer"
                >
                  Back
                </button>
              )}

              {csvImportStep === 'csv' && (
                <button
                  onClick={handleStartImportSubmit}
                  disabled={!csvFile || csvUploading}
                  className="h-9 px-5 text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg shadow-sm cursor-pointer"
                >
                  Next Step
                </button>
              )}
              {csvImportStep === 'mapping' && (
                <button
                  onClick={handleStartImportSubmit}
                  disabled={csvUploading}
                  className="h-9 px-5 text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm cursor-pointer animate-pulse"
                >
                  Start Import
                </button>
              )}
              {csvImportStep === 'done' && (
                <button
                  onClick={closeImportModal}
                  className="h-9 px-6 text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm cursor-pointer"
                >
                  Close
                </button>
              )}
            </div>
          </div>

        </motion.div>
      </div>
    );
  };

  // --- CRM LIST VIEW ---
  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-background relative z-10 text-foreground overflow-hidden">
      
      {/* Muted background ambient glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/[0.015] rounded-full blur-[100px] pointer-events-none"></div>

      {/* Left Panel - CRM Filter Sidebar */}
      <div className="w-64 border-r border-border/60 p-5 hidden md:flex flex-col gap-6 bg-card/30 shrink-0">
        <div className="space-y-4">
          <h2 className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase px-2">contacts</h2>
          <div className="space-y-0.5">
            {FILTER_TABS.map((tab) => {
              const count = filterCounts[tab.id] ?? 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveFilter(tab.id);
                    invalidateQueries();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-[13px] rounded-lg transition-all duration-200 cursor-pointer ${
                    activeFilter === tab.id 
                      ? 'bg-foreground/5 text-foreground font-semibold shadow-sm' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <tab.icon className={`w-4 h-4 ${activeFilter === tab.id ? 'text-indigo-500' : 'text-muted-foreground/60'}`} />
                    {tab.label}
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                    activeFilter === tab.id ? 'bg-background shadow-sm text-foreground/80' : 'bg-transparent text-muted-foreground/60'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Center CRM Stream Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-transparent">
        
        {/* Premium Header */}
        <header className="border-b border-border/60 shrink-0 bg-background/80 backdrop-blur-md z-20">
          <div className="h-[60px] md:h-[72px] flex items-center justify-between px-4 md:px-6">
            
            {/* Search Input with debouncing */}
            <div className="flex-1 max-w-md relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground/50 group-focus-within:text-indigo-500 transition-colors" />
              </div>
              <input 
                type="text" 
                placeholder="Search name, phone, or email..." 
                className="w-full h-10 pl-10 pr-4 bg-card border border-border/80 hover:border-border focus:border-indigo-500/30 focus:ring-4 focus:ring-indigo-500/10 rounded-lg text-[13px] placeholder:text-muted-foreground/50 transition-all outline-none"
                value={searchQuery}
                onChange={handleSearchChange}
              />
            </div>

            {/* Actions Area */}
            <div className="flex items-center gap-2 pl-4 shrink-0">
              <button 
                onClick={() => window.open('/api/dashboard/leads/export', '_blank')}
                className="h-9 px-3 md:px-4 text-[13px] font-semibold bg-card text-foreground hover:bg-secondary border border-border/80 rounded-lg transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4 text-muted-foreground" />
                <span className="hidden sm:inline">Export</span>
              </button>
              <button 
                onClick={() => setCsvImportStep('source')}
                className="h-9 px-3 md:px-4 text-[13px] font-semibold bg-card text-foreground hover:bg-secondary border border-border/80 rounded-lg transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-muted-foreground" />
                <span className="hidden sm:inline">Import</span>
              </button>
              <button
                onClick={() => {
                  setAddForm({ name: '', phone: '', email: '', notes: '' });
                  setAddFormError(null);
                  setDuplicateCheckedId(null);
                  setAddContactModalOpen(true);
                }}
                className="h-9 px-3.5 md:px-4 text-[13px] font-semibold bg-primary text-primary-foreground hover:bg-primary/95 rounded-lg shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Contact</span>
              </button>
            </div>

          </div>

          {/* Mobile Filter Tabs */}
          <div className="md:hidden flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-none">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveFilter(tab.id);
                  invalidateQueries();
                }}
                className={`shrink-0 h-8 px-3 rounded-full text-[12px] font-semibold border transition-all cursor-pointer ${
                  activeFilter === tab.id
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
                }`}
              >
                {tab.label} {filterCounts[tab.id] ? `(${filterCounts[tab.id]})` : ''}
              </button>
            ))}
          </div>
        </header>

        {/* Contacts Table / Stream Grid */}
        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 z-10 custom-scrollbar">
          <div className="max-w-[1200px] mx-auto pb-16">
            
            <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-[0_4px_24px_-8px_rgba(0,0,0,0.02)]">
              {/* Header Row */}
              <div className="grid grid-cols-1 md:grid-cols-4 items-center p-4 border-b border-border/60 bg-secondary/30 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                <div className="pl-2">Contact</div>
                <div className="hidden md:block">Last Interaction</div>
                <div className="hidden md:block">Source</div>
                <div className="hidden md:block text-right pr-4">Actions</div>
              </div>

              {/* Data Row list */}
              {loading ? (
                <div className="divide-y divide-border/40">
                  {[...Array(5)].map((_, i) => <SkeletonRow key={i} className="px-6" />)}
                </div>
              ) : contacts.length === 0 ? (
                // Overhauled Empty State
                <div className="py-20 text-center flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-muted-foreground/45 mb-4">
                    <Users className="w-6 h-6" />
                  </div>
                  <h3 className="text-[15px] font-bold text-foreground mb-1">No contacts yet</h3>
                  <p className="text-[13px] text-muted-foreground max-w-sm leading-relaxed px-4">
                    Saved WhatsApp contacts and manually added customers will appear here automatically. Contacts from chats sync instantly.
                  </p>
                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={() => setAddContactModalOpen(true)}
                      className="h-9 px-4 text-[13px] font-semibold bg-primary text-primary-foreground hover:bg-primary/95 rounded-lg transition-colors cursor-pointer"
                    >
                      Add Contact
                    </button>
                    <button
                      onClick={() => setCsvImportStep('source')}
                      className="h-9 px-4 text-[13px] font-semibold bg-secondary text-foreground hover:bg-secondary/80 rounded-lg border border-border transition-colors cursor-pointer"
                    >
                      Import CSV
                    </button>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {contacts.map((contact, i) => (
                    <motion.div
                      key={contact.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.3) }}
                      onClick={() => {
                        setSelectedContactId(contact.id);
                        setDrawerOpen(true);
                      }}
                      className={`grid grid-cols-1 md:grid-cols-4 items-center p-4 cursor-pointer hover:bg-secondary/35 transition-all group ${
                        selectedContactId === contact.id ? 'bg-indigo-500/[0.02] border-l-2 border-l-indigo-500' : ''
                      }`}
                    >
                      {/* Contact identity */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-2xl bg-secondary flex items-center justify-center text-[12.5px] font-bold border border-border group-hover:scale-105 transition-transform shrink-0 shadow-inner">
                          {contact.avatar}
                        </div>
                        <div className="min-w-0 flex flex-col justify-center">
                          <h4 className="text-[13.5px] font-semibold text-foreground truncate leading-tight">{contact.name}</h4>
                          {contact.name !== formatPhoneDisplay(contact.phone) && (
                            <p className="text-[11.5px] text-muted-foreground/60 truncate mt-0.5 leading-tight">{formatPhoneDisplay(contact.phone)}</p>
                          )}
                        </div>
                      </div>

                      {/* Last Interaction snippet */}
                      <div className="hidden md:block min-w-0">
                        <span className="text-[11.5px] font-semibold text-foreground/75 block">{contact.lastActive}</span>
                        <span className="text-[12.5px] text-muted-foreground truncate block mt-0.5 max-w-[200px]">
                          {contact.notes || 'No notes added.'}
                        </span>
                      </div>

                      {/* Source */}
                      <div className="hidden md:block">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10.5px] font-bold uppercase tracking-wider bg-secondary text-muted-foreground border border-border/60">
                          {formatChannel(contact.channel)}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="hidden md:flex justify-end items-center gap-2 pr-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedContactId(contact.id);
                            setDrawerOpen(true);
                          }}
                          className="h-8 px-3 text-[12px] font-semibold text-foreground bg-secondary hover:bg-secondary/80 rounded-md border border-border transition-colors cursor-pointer"
                        >
                          View Profile
                        </button>
                      </div>

                    </motion.div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* Sliding Side Profile Drawer */}
      {renderDetailDrawer()}

      {/* CSV Bulk Import Wizard Modal */}
      <AnimatePresence>
        {csvImportStep !== 'hidden' && renderImportModal()}
      </AnimatePresence>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {addContactModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            {/* Modal Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !addSubmitting && setAddContactModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            
            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background/50 backdrop-blur-md shrink-0">
                <div>
                  <h2 className="text-md font-bold tracking-tight text-foreground">Add Contact</h2>
                  <p className="text-[13px] text-muted-foreground mt-0.5 font-medium">Create a single new profile row scoped to the tenant.</p>
                </div>
                <button
                  type="button"
                  disabled={addSubmitting}
                  onClick={() => setAddContactModalOpen(false)}
                  className="p-1.5 text-muted-foreground hover:bg-secondary rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddContactSubmit} className="flex flex-col">
                <div className="p-6 space-y-4">
                  
                  {/* Phone input with E.164 and duplicate pre-checks */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Phone Number *</label>
                      {isDuplicateChecking && <span className="text-[11px] text-indigo-500 animate-pulse font-medium">Checking duplicates...</span>}
                    </div>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. +91 98765 43210"
                      value={addForm.phone}
                      onChange={handleAddPhoneChange}
                      className={`w-full h-10 px-3 bg-background border rounded-lg text-[13px] focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all ${
                        duplicateCheckedId ? 'border-red-400 focus:border-red-500' : 'border-border focus:border-indigo-500/40'
                      }`}
                    />
                    <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">Format normalizes dynamically to canonical E.164 (+919876543210).</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={addForm.name}
                      onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                      className="w-full h-10 px-3 bg-background border border-border rounded-lg text-[13px] focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. rahul@example.com"
                      value={addForm.email}
                      onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                      className="w-full h-10 px-3 bg-background border border-border rounded-lg text-[13px] focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Context Notes</label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Lead details, company details, etc."
                      value={addForm.notes}
                      onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                      className="w-full px-3 py-2 bg-background border border-border rounded-lg text-[13px] focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10 resize-none"
                    />
                  </div>

                  {addFormError && (
                    <div className={`p-3 rounded-xl border text-[13px] flex items-center justify-between gap-2.5 ${
                      duplicateCheckedId 
                        ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/5 dark:border-amber-500/20 dark:text-amber-400' 
                        : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-500/5 dark:border-red-500/20 dark:text-red-400'
                    }`}>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{addFormError}</span>
                      </div>
                      {duplicateCheckedId && duplicateCheckedId !== 'unknown' && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedContactId(duplicateCheckedId);
                            setDrawerOpen(true);
                            setAddContactModalOpen(false);
                          }}
                          className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors underline whitespace-nowrap"
                        >
                          Open Contact
                        </button>
                      )}
                    </div>
                  )}

                </div>

                <div className="p-5 border-t border-border bg-background/50 backdrop-blur-md flex justify-between items-center shrink-0">
                  <button
                    type="button"
                    disabled={addSubmitting}
                    onClick={() => setAddContactModalOpen(false)}
                    className="text-[13px] font-medium text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addSubmitting || !!duplicateCheckedId}
                    className="h-9 px-5 text-[13.5px] font-semibold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    {addSubmitting ? 'Saving...' : 'Save Contact'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
