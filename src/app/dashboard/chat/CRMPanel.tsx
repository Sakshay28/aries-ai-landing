"use client";

import { useState, useEffect, useRef } from "react";
import {
  Phone, Tag, Bot, User,
  MessageSquare, ChevronDown, Plus, Trash2,
  UserPlus, StickyNote, Workflow, Loader2, Check,
  Mail, Clock, Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { Message } from "@/lib/types";
import type { SharedConversationMeta } from "./page";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useContactsStore } from "@/lib/store/contactsStore";

// ── helpers ────────────────────────────────────────────────────────
// Same palette & hash as ChatSidebar / ChatArea — ensures avatar color is identical everywhere
const CRM_AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
];
function crmAvatarGradient(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return CRM_AVATAR_GRADIENTS[h % CRM_AVATAR_GRADIENTS.length];
}

import { formatPhoneDisplay } from "@/lib/utils/phone";
import { contactDisplayName, hasRealName } from "@/lib/utils/contact-name";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatNoteTime(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

const STATUS_COLORS: Record<string, string> = {
  hot:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  warm: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  cold: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  new:  "bg-muted text-muted-foreground",
};

// ── accordion ────────────────────────────────────────────────────────
function Section({
  title, icon: Icon, defaultOpen = true, children,
}: {
  title: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [animating, setAnimating] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  return (
    <div className="mb-1">
      <button
        onClick={() => { setOpen(o => !o); setAnimating(true); }}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors rounded-lg"
      >
        <div className="flex items-center gap-1.5">
          <Icon className="w-3 h-3 text-muted-foreground/60" />
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">{title}</span>
        </div>
        <ChevronDown className={cn("w-3 h-3 text-muted-foreground/40 transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            onAnimationComplete={() => { if (openRef.current) setAnimating(false); }}
            className={animating ? "overflow-hidden" : ""}
          >
            <div className="px-4 pb-3 space-y-2.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[9.5px] font-semibold text-muted-foreground/50 uppercase tracking-wider">{label}</p>
      <p className="text-[12.5px] text-foreground/85 font-medium">{value || "—"}</p>
    </div>
  );
}


// ── note type ────────────────────────────────────────────────────────
interface Note {
  id: string;
  text: string;
  createdAt: string;
  createdBy?: string;
  status?: 'saved' | 'saving' | 'failed';
  error?: string | null;
  idempotencyKey?: string;
}

// ── main component ──────────────────────────────────────────────────
interface CRMPanelProps {
  meta: SharedConversationMeta | null;
  messages: Message[];
}

export default function CRMPanel({ meta, messages }: CRMPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoadStatus, setNotesLoadStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [notesLoadError, setNotesLoadError] = useState<string | null>(null);
  const [notesRetryTick, setNotesRetryTick] = useState(0);
  const [noteInput, setNoteInput] = useState("");
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [localLead, setLocalLead] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const { setSaveContactModalOpen, setSaveContactPhone, invalidateQueries, getContactByPhone, addOrUpdateContact } = useContactsStore();
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [isEditingInModal, setIsEditingInModal] = useState(false);
  const [modalEditName, setModalEditName] = useState("");
  const [modalEditEmail, setModalEditEmail] = useState("");
  const [modalEditNotes, setModalEditNotes] = useState("");
  const [modalSaving, setModalSaving] = useState(false);

  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const agentSelectRef = useRef<HTMLSelectElement>(null);
  const notesSectionRef = useRef<HTMLDivElement>(null);
  // Guards against an in-flight (slow) fetch response landing after a newer
  // one and clobbering fresher state — the classic "old websocket/HTTP data
  // replacing new state" race.
  const notesFetchSeqRef = useRef(0);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
  // Outside-click for tags inline panel
  useEffect(() => {
    if (!tagsOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      const inPanel = !!target.closest?.('[data-tags-panel]');
      const inTrigger = !!(target as Element).closest?.('[data-tag-trigger]');
      if (!inPanel && !inTrigger) setTagsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tagsOpen]);

  const PREDEFINED_TAGS = ['VIP', 'Follow-up', 'Complaint', 'Booking', 'Pricing', 'Interested', 'Not interested', 'Spam'];

  const toggleTag = async (tag: string) => {
    if (!localLead?.id) { toast.error("No lead linked to this conversation"); return; }
    const current: string[] = localLead.tags || [];
    const updated = current.includes(tag) ? current.filter((t: string) => t !== tag) : [...current, tag];
    setLocalLead((prev: any) => prev ? { ...prev, tags: updated } : null);
    const supabase = createBrowserSupabaseClient();
    await supabase.from('leads').update({ tags: updated }).eq('id', localLead.id);
  };

  useEffect(() => {
    setLocalLead(meta?.leads || null);
    setIsEditingName(false);
    setIsEditingEmail(false);
    setIsEditingPhone(false);
  }, [meta]);

  useEffect(() => {
    setLoadingTeam(true);
    fetch("/api/dashboard/team")
      .then(r => r.json())
      .then(data => {
        if (data.success) setTeam(data.users || []);
      })
      .catch(err => console.error("Error fetching team:", err))
      .finally(() => setLoadingTeam(false));
  }, []);

  const updateLeadStatus = async (status: string) => {
    if (!localLead?.id) { toast.error("No lead linked to this conversation"); return; }
    const originalStatus = localLead.lead_status;
    setLocalLead((prev: any) => prev ? { ...prev, lead_status: status } : null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from('leads')
      .update({ lead_status: status })
      .eq('id', localLead.id);
    if (error) {
      toast.error("Failed to update status");
      setLocalLead((prev: any) => prev ? { ...prev, lead_status: originalStatus } : null);
    } else {
      toast.success("Lead status updated to " + status);
    }
  };

  const updateLeadScore = async (score: number) => {
    if (!localLead?.id) return;
    const originalScore = localLead.lead_score;
    setLocalLead((prev: any) => prev ? { ...prev, lead_score: score } : null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from('leads')
      .update({ lead_score: score })
      .eq('id', localLead.id);
    if (error) {
      toast.error("Failed to update lead score");
      setLocalLead((prev: any) => prev ? { ...prev, lead_score: originalScore } : null);
    } else {
      toast.success("Lead score updated to " + score);
    }
  };

  const assignAgent = async (userId: string | null) => {
    if (!localLead?.id) { toast.error("No lead linked to this conversation"); return; }
    const originalAgent = localLead.assigned_to;
    setLocalLead((prev: any) => prev ? { ...prev, assigned_to: userId } : null);
    try {
      const res = await fetch(`/api/dashboard/leads/${localLead.id}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: userId })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to assign');
      }
      toast.success(userId ? "Lead assigned to agent" : "Lead unassigned");
    } catch (err: any) {
      toast.error(err.message || "Failed to assign agent");
      setLocalLead((prev: any) => prev ? { ...prev, assigned_to: originalAgent } : null);
    }
  };

  const saveField = async (field: 'name' | 'email' | 'phone', value: string) => {
    if (!localLead?.id) return;
    const originalVal = localLead[field];
    setLocalLead((prev: any) => prev ? { ...prev, [field]: value || null } : null);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase
      .from('leads')
      .update({ [field]: value || null })
      .eq('id', localLead.id);
    if (error) {
      toast.error(`Failed to update ${field}`);
      setLocalLead((prev: any) => prev ? { ...prev, [field]: originalVal } : null);
    } else {
      toast.success(`Lead ${field} updated`);
    }
  };

  const handleModalSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localLead?.id) return;
    if (!modalEditName.trim()) {
      toast.error("Name is required");
      return;
    }

    setModalSaving(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase
        .from('leads')
        .update({
          name: modalEditName.trim(),
          email: modalEditEmail.trim() || null,
          notes: modalEditNotes.trim() || null,
        })
        .eq('id', localLead.id);

      if (error) {
        toast.error("Failed to update contact details");
      } else {
        toast.success("Contact details updated successfully");
        const updatedContact = {
          ...localLead,
          name: modalEditName.trim(),
          email: modalEditEmail.trim() || null,
          notes: modalEditNotes.trim() || null,
        };
        addOrUpdateContact(updatedContact);

        setLocalLead((prev: any) => prev ? {
          ...prev,
          name: modalEditName.trim(),
          email: modalEditEmail.trim() || null,
          notes: modalEditNotes.trim() || null,
        } : null);
        setIsEditingInModal(false);
        invalidateQueries();
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while saving");
    } finally {
      setModalSaving(false);
    }
  };

  // Notes are scoped by contact whenever a contact is linked — a contact can
  // span multiple conversation threads (new WhatsApp session, 24h-window
  // reset), so scoping strictly to conversation_id makes historical notes
  // vanish the moment a new thread opens for the same customer. Falls back
  // to the conversation when no contact is linked yet.
  const notesContactId = meta?.leads?.id || null;
  const notesScopeKey = meta?.id ? (notesContactId ? `c:${notesContactId}` : `v:${meta.id}`) : null;

  // Helper to read offline queue from localStorage
  const getOfflineQueue = (scopeKey: string): any[] => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`crm-notes-queue-${scopeKey}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  // Helper to save offline queue to localStorage
  const saveOfflineQueue = (scopeKey: string, queue: any[]) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`crm-notes-queue-${scopeKey}`, JSON.stringify(queue));
    } catch (err) {
      console.error('[Notes] Failed to persist offline queue:', err);
    }
  };

  // Online/Offline status window listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [notesScopeKey]);

  // Sync offline queue to server. Also called (silently) right after the
  // initial notes fetch so a note left "saving" from a page reload/crash
  // mid-request actually resumes instead of sitting stuck forever.
  const syncOfflineQueue = (announce = false) => {
    if (!notesScopeKey || !navigator.onLine) return;
    const queue = getOfflineQueue(notesScopeKey).filter((q: any) => q.retryCount < 3);
    if (queue.length === 0) return;

    if (announce) toast.success("Connection restored! Syncing queued notes...");
    console.log('[Notes] Resuming pending queue items', { scopeKey: notesScopeKey, count: queue.length });
    queue.forEach((item: any) => {
      saveNoteToServer(item);
    });
  };

  // Load notes from DB & listen to realtime updates via Supabase Channel
  useEffect(() => {
    if (!meta?.id) { setNotes([]); setNotesLoadStatus('idle'); setNotesLoadError(null); return; }

    let active = true;
    const scopeKey = notesScopeKey as string;

    const fetchNotes = async () => {
      const seq = ++notesFetchSeqRef.current;
      setNotesLoadStatus('loading');
      setNotesLoadError(null);
      console.log('[Notes] Fetch started', { scopeKey, contactId: notesContactId, conversationId: meta.id });

      try {
        const params = notesContactId
          ? `contactId=${notesContactId}`
          : `conversationId=${meta.id}`;
        const res = await fetch(`/api/dashboard/notes?${params}`);
        const data = await res.json();

        // A newer fetch (contact/conversation switch, or a second call that
        // raced ahead) has already landed — this response is stale, drop it
        // rather than let it clobber fresher state.
        if (!active || seq !== notesFetchSeqRef.current) return;

        if (!res.ok || !data.success) {
          throw new Error(data.error || `Request failed (${res.status})`);
        }

        const apiNotes = data.notes.map((n: any) => ({ ...n, status: 'saved' as const }));

        // Get any locally queued notes not yet confirmed by the server
        const queue = getOfflineQueue(scopeKey);
        const queueNotes = queue.map((qn: any) => ({
          id: qn.id,
          text: qn.text,
          createdAt: qn.createdAt,
          createdBy: 'You',
          status: qn.retryCount >= 3 ? 'failed' as const : 'saving' as const,
          error: qn.retryCount >= 3 ? "Couldn't save note. Please try again." : `Saving (Retry ${qn.retryCount}/3)...`,
          idempotencyKey: qn.idempotencyKey
        }));

        const filteredQueueNotes = queueNotes.filter(
          (qn: any) => !apiNotes.some((an: any) => (qn.idempotencyKey && an.idempotencyKey === qn.idempotencyKey) || an.text === qn.text)
        );

        setNotes([...apiNotes, ...filteredQueueNotes]);
        setNotesLoadStatus('loaded');
        console.log('[Notes] Fetch succeeded', { scopeKey, dbCount: apiNotes.length, pendingCount: filteredQueueNotes.length });

        // Resume anything still marked "saving" from a prior session (e.g. the
        // tab was closed/refreshed mid-request) — it would otherwise sit
        // stuck forever since only a fresh addNote() or the online event used
        // to trigger a retry.
        syncOfflineQueue(false);
      } catch (err: any) {
        if (!active || seq !== notesFetchSeqRef.current) return;
        console.error('[Notes] Fetch failed', { scopeKey, error: err.message });
        setNotesLoadStatus('error');
        setNotesLoadError(err.message || 'Failed to load notes');
      }
    };

    fetchNotes();

    const supabase = createBrowserSupabaseClient();
    const channelName = `realtime-notes-${scopeKey}-${Date.now()}`;
    const filter = notesContactId ? `contact_id=eq.${notesContactId}` : `conversation_id=eq.${meta.id}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notes',
        filter,
      }, (payload) => {
        if (!active) return;

        if (payload.eventType === 'INSERT') {
          const incoming = payload.new as any;
          if (incoming.deleted_at) return;
          console.log('[Notes] Realtime INSERT', { noteId: incoming.id });
          setNotes(prev => {
            const matchIndex = prev.findIndex(n => n.id === incoming.id || (incoming.idempotency_key && n.idempotencyKey === incoming.idempotency_key));
            if (matchIndex !== -1) {
              return prev.map((n, idx) =>
                idx === matchIndex
                  ? { ...n, id: incoming.id, status: 'saved', createdAt: incoming.created_at, createdBy: incoming.created_by_name, idempotencyKey: incoming.idempotency_key }
                  : n
              );
            }
            return [...prev, {
              id: incoming.id,
              text: incoming.text,
              createdAt: incoming.created_at,
              createdBy: incoming.created_by_name,
              status: 'saved',
              idempotencyKey: incoming.idempotency_key,
            }];
          });
        } else if (payload.eventType === 'UPDATE') {
          const incoming = payload.new as any;
          console.log('[Notes] Realtime UPDATE', { noteId: incoming.id, deleted: !!incoming.deleted_at });
          if (incoming.deleted_at) {
            // Soft-deleted elsewhere (another tab/user) — remove from view.
            setNotes(prev => prev.filter(n => n.id !== incoming.id));
          } else {
            setNotes(prev => prev.map(n =>
              n.id === incoming.id
                ? { ...n, text: incoming.text, createdAt: incoming.created_at, createdBy: incoming.created_by_name, status: 'saved' }
                : n
            ));
          }
        } else if (payload.eventType === 'DELETE') {
          const deletedId = payload.old.id;
          console.log('[Notes] Realtime DELETE', { noteId: deletedId });
          setNotes(prev => prev.filter(n => n.id !== deletedId));
        }
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Notes] Realtime channel error/timeout', { scopeKey, status });
        }
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesScopeKey, notesRetryTick]);

  // POST note saving implementation
  const saveNoteToServer = async (item: any) => {
    if (!navigator.onLine) {
      return; // Offline: item remains in queue, UI already displays Saving/Retry
    }

    console.log('[Notes] POST dispatched', { id: item.id, scopeKey: item.scopeKey, retryCount: item.retryCount });

    try {
      const res = await fetch('/api/dashboard/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: item.conversationId,
          contactId: item.contactId,
          text: item.text,
          idempotencyKey: item.idempotencyKey
        })
      });

      const data = await res.json();

      if (res.ok && (data.id || data.text)) {
        console.log('[Notes] POST confirmed, cache updated', { tempId: item.id, noteId: data.id });
        // Update UI — server response is the source of truth
        setNotes(prev => prev.map(n =>
          (n.id === item.id || (item.idempotencyKey && n.idempotencyKey === item.idempotencyKey))
            ? { ...n, id: data.id, status: 'saved', createdAt: data.createdAt, createdBy: data.createdBy, idempotencyKey: data.idempotencyKey }
            : n
        ));

        // Remove from local storage queue
        const currentQueue = getOfflineQueue(item.scopeKey);
        saveOfflineQueue(item.scopeKey, currentQueue.filter((q: any) => q.id !== item.id));
      } else {
        throw new Error(data.error || 'Failed to save');
      }
    } catch (err: any) {
      console.warn('[Notes] POST failed, scheduling retry', { id: item.id, error: err.message });
      handleSaveFailure(item);
    }
  };

  // Automatic retry implementation
  const handleSaveFailure = (item: any) => {
    const nextRetryCount = item.retryCount + 1;
    const delays = [1000, 2000, 5000]; // Retries at 1s, 2s, 5s

    if (nextRetryCount <= 3) {
      const delay = delays[nextRetryCount - 1];

      // Update local storage queue
      const currentQueue = getOfflineQueue(item.scopeKey);
      const updatedQueue = currentQueue.map((q: any) =>
        q.id === item.id ? { ...q, retryCount: nextRetryCount } : q
      );
      saveOfflineQueue(item.scopeKey, updatedQueue);

      // Update UI Status
      setNotes(prev => prev.map(n =>
        n.id === item.id
          ? { ...n, status: 'saving', error: `Saving (Retry ${nextRetryCount}/3)...` }
          : n
      ));

      // Retry query
      setTimeout(() => {
        const freshQueue = getOfflineQueue(item.scopeKey);
        const freshItem = freshQueue.find((q: any) => q.id === item.id);
        if (freshItem) {
          saveNoteToServer(freshItem);
        }
      }, delay);
    } else {
      // Retries exhausted: Mark failed, toast error, restore text to input if it's currently empty.
      // The note text itself is NEVER discarded — it stays in the local queue
      // (status 'failed') until the user retries or explicitly deletes it.
      setNotes(prev => prev.map(n =>
        n.id === item.id
          ? { ...n, status: 'failed', error: 'Couldn\'t save note. Please try again.' }
          : n
      ));

      // If the note input is currently empty (meaning they just submitted it), restore it
      setNoteInput(prev => prev.trim() === '' ? item.text : prev);

      toast.error("Couldn't save note. Please try again.");
    }
  };

  // Manual Retry Handler
  const handleManualRetry = (id: string) => {
    if (!notesScopeKey) return;
    const queue = getOfflineQueue(notesScopeKey);
    const item = queue.find((q: any) => q.id === id);
    if (item) {
      // Reset retry count to 0
      const resetItem = { ...item, retryCount: 0 };

      // Update queue
      const updatedQueue = queue.map((q: any) =>
        q.id === id ? resetItem : q
      );
      saveOfflineQueue(notesScopeKey, updatedQueue);

      // Update UI status to saving
      setNotes(prev => prev.map(n =>
        n.id === id ? { ...n, status: 'saving', error: 'Saving...' } : n
      ));

      saveNoteToServer(resetItem);
    }
  };

  // Add Note Handler (triggered by enter / button click)
  const addNote = () => {
    const text = noteInput.trim();
    console.log('[Notes] Save clicked');
    if (!text) return;
    if (!meta?.id || !meta?.leads?.id || !notesScopeKey) {
      toast.error("No contact linked to this conversation");
      return;
    }
    console.log('[Notes] Validation passed');

    const tempId = `opt_${Math.random().toString(36).substring(2, 9)}`;
    const idempotencyKey = `idem_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;

    const newNote: Note = {
      id: tempId,
      text,
      createdAt: new Date().toISOString(),
      createdBy: 'You',
      status: 'saving',
      idempotencyKey
    };

    // Add optimistic note to UI list
    setNotes(prev => [...prev, newNote]);
    setNoteInput(""); // Clear controlled textarea

    // Add note to local storage queue — the write-ahead log that lets the
    // note survive a refresh/crash that happens before the POST resolves.
    const queueItem = {
      id: tempId,
      text,
      conversationId: meta.id,
      contactId: meta.leads.id,
      scopeKey: notesScopeKey,
      idempotencyKey,
      createdAt: newNote.createdAt,
      retryCount: 0
    };
    const currentQueue = getOfflineQueue(notesScopeKey);
    saveOfflineQueue(notesScopeKey, [...currentQueue, queueItem]);

    // Send note to backend
    saveNoteToServer(queueItem);
  };

  // Edit Note logic
  const startEditingNote = (id: string, text: string) => {
    setEditingNoteId(id);
    setEditingNoteText(text);
  };

  const saveEditedNote = async (id: string) => {
    const text = editingNoteText.trim();
    if (!text) {
      toast.error("Note text cannot be empty");
      return;
    }

    const previousNotes = [...notes];
    
    // Optimistic UI update
    setNotes(prev => prev.map(n => n.id === id ? { ...n, text } : n));
    setEditingNoteId(null);

    try {
      const res = await fetch('/api/dashboard/notes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, text })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to edit note');
      }
      toast.success("Note edited successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to edit note");
      setNotes(previousNotes); // Revert state
    }
  };

  // Delete Note logic
  const deleteNote = async (id: string) => {
    const previousNotes = [...notes];

    // Check if it is a locally queued failed/saving note
    if (id.startsWith('opt_')) {
      // Remove from UI
      setNotes(prev => prev.filter(n => n.id !== id));
      // Remove from offline queue
      if (notesScopeKey) {
        const queue = getOfflineQueue(notesScopeKey);
        saveOfflineQueue(notesScopeKey, queue.filter((q: any) => q.id !== id));
      }
      toast.success("Queued note removed");
      return;
    }

    // Optimistic UI update
    setNotes(prev => prev.filter(n => n.id !== id));

    try {
      const res = await fetch(`/api/dashboard/notes?id=${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete note');
      }
      toast.success("Note deleted successfully");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete note");
      setNotes(previousNotes); // Revert state
    }
  };

  const lead = meta?.leads;
  const rawPhone = lead?.phone || meta?.sender_id || meta?.sender_name || "";
  const cachedContact = getContactByPhone(rawPhone);
  const displayName = contactDisplayName(cachedContact?.name ?? lead?.name, rawPhone);
  const hasSavedName = hasRealName(cachedContact?.name);

  const inboundCount = messages.filter(m => m.direction === "inbound").length;
  const outboundCount = messages.filter(m => m.direction === "outbound").length;
  const aiCount = messages.filter(m => m.ai_generated).length;
  const firstMsg = messages[0];
  const lastMsg = messages.at(-1);

  const quickActions = meta ? [
    {
      icon: UserPlus, label: 'Assign', dataAttr: 'data-assign-trigger',
      action: () => {
        agentSelectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => agentSelectRef.current?.focus(), 300);
      }
    },
    {
      icon: Tag, label: 'Tag', dataAttr: 'data-tag-trigger',
      action: () => setTagsOpen(v => !v)
    },
    {
      icon: StickyNote, label: 'Note',
      action: () => {
        setNotesOpen(true);
        setTimeout(() => {
          notesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => noteInputRef.current?.focus(), 300);
        }, 100);
      }
    },
    {
      icon: Workflow, label: 'Flow',
      action: () => { window.location.href = '/dashboard/flows'; }
    },
  ] : [];

  return (
    <div className={cn(
      "w-[300px] flex-shrink-0 bg-card border-l border-border flex flex-col overflow-hidden",
      meta?.id ? "hidden xl:flex" : "hidden"
    )}>
      {/* ── Hero ── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div
          style={meta ? { background: crmAvatarGradient(rawPhone || meta.id) } : {}}
          className={cn('w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 shadow-sm text-white', !meta && 'bg-muted')}
        >
          {meta
            ? (lead?.name
                ? lead.name.charAt(0).toUpperCase()
                : rawPhone
                  ? (() => { const d = rawPhone.replace(/\D/g, ''); const l = d.startsWith('91') && d.length === 12 ? d.slice(2) : d; return l.charAt(0) || '?'; })()
                  : '?')
            : <User className="w-5 h-5 text-muted-foreground/40" />
          }
        </div>

        {meta ? (
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={() => {
                  setIsEditingName(false);
                  if (editName.trim() && editName.trim() !== localLead?.name) {
                    saveField('name', editName.trim());
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setIsEditingName(false);
                    if (editName.trim() && editName.trim() !== localLead?.name) {
                      saveField('name', editName.trim());
                    }
                  } else if (e.key === 'Escape') {
                    setIsEditingName(false);
                  }
                }}
                autoFocus
                className="text-[13px] bg-secondary border border-indigo-500/50 rounded px-1.5 py-0.5 text-foreground outline-none w-full font-semibold focus:border-indigo-500 transition-colors"
              />
            ) : (
              <p
                onClick={() => {
                  setEditName(localLead?.name || displayName);
                  setIsEditingName(true);
                }}
                title="Click to edit name"
                className="text-[13.5px] font-semibold text-foreground truncate leading-tight hover:underline hover:text-indigo-400 cursor-pointer transition-colors"
              >
                {displayName}
              </p>
            )}
            {rawPhone && displayName !== formatPhoneDisplay(rawPhone) && <p className="text-[11.5px] text-muted-foreground/60 mt-0.5 truncate">{formatPhoneDisplay(rawPhone)}</p>}
            <div className="flex items-center gap-1.5 mt-1.5">
              {localLead?.lead_status && (
                <span className={cn("px-1.5 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-wide", STATUS_COLORS[localLead.lead_status] || STATUS_COLORS.new)}>
                  {localLead.lead_status}
                </span>
              )}
              <span className={cn(
                "px-1.5 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-wide",
                meta.bot_paused
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/20"
                  : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20"
              )}>
                {meta.bot_paused ? "Human" : "AI"}
              </span>
            </div>

            {!hasSavedName ? (
              <div className="mt-2.5 space-y-1.5">
                <p className="text-[11px] text-muted-foreground/65 flex items-center gap-1.5 leading-none">
                  <span className="text-[8px] text-amber-500/80">●</span> Unsaved Contact
                </p>
                <button
                  onClick={() => {
                    setSaveContactPhone(rawPhone);
                    setSaveContactModalOpen(true);
                  }}
                  className="h-7 px-3 text-[11px] font-semibold text-foreground bg-secondary hover:bg-secondary/80 border border-border/80 rounded-full transition-all cursor-pointer"
                >
                  Save Contact
                </button>
              </div>
            ) : (
              <div className="mt-2.5 space-y-1.5">
                <p className="text-[11px] text-emerald-600 dark:text-emerald-500/85 font-semibold flex items-center gap-1 leading-none">
                  WhatsApp Contact <span className="text-[9.5px]">✓</span>
                </p>
                <button
                  onClick={() => setViewModalOpen(true)}
                  className="h-7 px-3 text-[11px] font-semibold text-foreground bg-secondary hover:bg-secondary/80 border border-border/80 rounded-full transition-all cursor-pointer"
                >
                  View Contact
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground/60">Select a conversation</p>
        )}
      </div>

      {/* Quick Actions */}
      {meta && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-4 gap-1.5">
            {/* eslint-disable-next-line react-hooks/refs */}
            {quickActions.map(({ icon: Icon, label, action, dataAttr }: any) => (
              <button
                key={label}
                onClick={action}
                {...(dataAttr ? { [dataAttr]: 'true' } : {})}
                className="group flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                <Icon className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
                <span className="text-[10px] font-medium text-muted-foreground/70 group-hover:text-foreground transition-colors">{label}</span>
              </button>
            ))}
          </div>

          {/* Tag picker */}
          <AnimatePresence>
            {tagsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
              >
                <div data-tags-panel className="bg-muted/40 rounded-xl p-3 mb-1">
                  <p className="text-[9.5px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Quick Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {PREDEFINED_TAGS.map(tag => {
                      const active = (localLead?.tags || []).includes(tag);
                      return (
                        <button
                          key={tag}
                          onClick={() => toggleTag(tag)}
                          className={cn(
                            'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border',
                            active
                              ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                              : 'bg-card text-foreground/70 border-border hover:border-indigo-400 hover:text-indigo-600 dark:hover:bg-indigo-950/30'
                          )}
                        >
                          {active && <Check className="w-2.5 h-2.5" />}
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* subtle separator */}
          <div className="mx-4 h-px bg-border mb-1 mt-1" />
        </div>
      )}

      {/* ── Sections ── */}
      <div className="flex-1 overflow-y-auto">
        {meta && (
          <>
            {/* Contact */}
            <Section title="Contact" icon={Phone}>
              {/* Phone Row */}
              <div className="flex flex-col gap-0.5 group">
                <p className="text-[9.5px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Phone</p>
                {isEditingPhone ? (
                  <input
                    type="text"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    onBlur={() => {
                      setIsEditingPhone(false);
                      if (editPhone.trim() && editPhone.trim() !== localLead?.phone) {
                        saveField('phone', editPhone.trim());
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setIsEditingPhone(false);
                        if (editPhone.trim() && editPhone.trim() !== localLead?.phone) {
                          saveField('phone', editPhone.trim());
                        }
                      } else if (e.key === 'Escape') {
                        setIsEditingPhone(false);
                      }
                    }}
                    autoFocus
                    className="text-[12.5px] bg-secondary border border-indigo-500/50 rounded px-1.5 py-0.5 text-foreground outline-none w-full"
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <a href={`tel:+${rawPhone.replace(/\D/g, '')}`} className="text-[12.5px] text-foreground/85 font-medium hover:underline hover:text-indigo-400 transition-colors cursor-pointer">
                      {formatPhoneDisplay(rawPhone) || "—"}
                    </a>
                    <button
                      onClick={() => {
                        setEditPhone(localLead?.phone || "");
                        setIsEditingPhone(true);
                      }}
                      className="text-[10px] text-indigo-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Email Row */}
              <div className="flex flex-col gap-0.5 group">
                <p className="text-[9.5px] font-semibold text-muted-foreground/50 uppercase tracking-wider">Email</p>
                {isEditingEmail ? (
                  <input
                    type="email"
                    value={editEmail}
                    onChange={e => setEditEmail(e.target.value)}
                    onBlur={() => {
                      setIsEditingEmail(false);
                      if (editEmail.trim() !== localLead?.email) {
                        saveField('email', editEmail.trim());
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        setIsEditingEmail(false);
                        if (editEmail.trim() !== localLead?.email) {
                          saveField('email', editEmail.trim());
                        }
                      } else if (e.key === 'Escape') {
                        setIsEditingEmail(false);
                      }
                    }}
                    autoFocus
                    className="text-[12.5px] bg-secondary border border-indigo-500/50 rounded px-1.5 py-0.5 text-foreground outline-none w-full"
                  />
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] text-foreground/85 font-medium truncate">
                      {localLead?.email || "—"}
                    </span>
                    <button
                      onClick={() => {
                        setEditEmail(localLead?.email || "");
                        setIsEditingEmail(true);
                      }}
                      className="text-[10px] text-indigo-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Status Row — native select */}
              <div className="flex flex-col gap-0.5">
                <p className="text-[9.5px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Lead Status</p>
                <div className="relative">
                  <select
                    value={localLead?.lead_status || 'new'}
                    onChange={(e) => updateLeadStatus(e.target.value)}
                    className="w-full appearance-none px-2.5 py-2 bg-secondary/60 hover:bg-secondary border border-border hover:border-indigo-400 focus:border-indigo-400 rounded-xl text-[12.5px] font-semibold transition-all cursor-pointer outline-none pr-8 text-foreground"
                  >
                    <option value="new">🆕 New</option>
                    <option value="hot">🔥 Hot</option>
                    <option value="warm">☀️ Warm</option>
                    <option value="cold">❄️ Cold</option>
                    <option value="converted">👑 Converted</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                </div>
              </div>

              {/* Agent Assignment — native select */}
              <div className="flex flex-col gap-0.5">
                <p className="text-[9.5px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Assigned Agent</p>
                {loadingTeam ? (
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading team...
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      ref={agentSelectRef}
                      value={localLead?.assigned_to || ''}
                      onChange={(e) => assignAgent(e.target.value || null)}
                      className="w-full appearance-none px-2.5 py-2 bg-secondary/60 hover:bg-secondary border border-border hover:border-indigo-400 focus:border-indigo-400 rounded-xl text-[12.5px] font-semibold transition-all cursor-pointer outline-none pr-8 text-foreground"
                    >
                      <option value="">Unassigned</option>
                      {team.map((u: any) => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
                  </div>
                )}
              </div>

              {localLead?.tags && localLead.tags.length > 0 && (
                <div>
                  <p className="text-[9.5px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1.5">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {localLead.tags.map((t: string) => (
                      <span key={t} className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40 rounded-full text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {localLead?.first_message_at && <InfoRow label="First Contact" value={formatDate(localLead.first_message_at)} />}
            </Section>

            {/* Conversation Stats */}
            <Section title="Conversation" icon={MessageSquare}>
              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Total", value: messages.length },
                  { label: "Received", value: inboundCount },
                  { label: "Sent", value: outboundCount },
                ].map(s => (
                  <div key={s.label} className="bg-muted/50 rounded-xl px-2 py-2.5 text-center">
                    <p className="text-[16px] font-bold text-foreground">{s.value}</p>
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              {aiCount > 0 && (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-3 py-2">
                  <Bot className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <p className="text-[12px] text-emerald-700 dark:text-emerald-400 font-medium">
                    {aiCount} AI-generated {aiCount === 1 ? "reply" : "replies"}
                  </p>
                </div>
              )}
              {firstMsg && <InfoRow label="First Message" value={formatDate(firstMsg.created_at)} />}
              {lastMsg && lastMsg !== firstMsg && (
                <InfoRow
                  label="Last Message"
                  value={`${new Date(lastMsg.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · ${new Date(lastMsg.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
                />
              )}
            </Section>

            {/* Notes */}
            <div ref={notesSectionRef}>
              <Section title="Notes" icon={Tag} defaultOpen={notesOpen}>
              {notesLoadStatus === 'loading' && notes.length === 0 && (
                <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading notes...
                </p>
              )}
              {notesLoadStatus === 'error' && (
                <div className="flex items-center justify-between gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-2">
                  <p className="text-[11.5px] text-destructive font-medium">
                    Couldn&apos;t load notes{notesLoadError ? `: ${notesLoadError}` : '.'}
                  </p>
                  <button
                    onClick={() => setNotesRetryTick(t => t + 1)}
                    className="text-[11px] font-semibold text-destructive underline hover:text-destructive-foreground transition-colors flex-shrink-0"
                  >
                    Retry
                  </button>
                </div>
              )}
              {notesLoadStatus === 'loaded' && notes.length === 0 && (
                <p className="text-[12px] text-muted-foreground">No notes yet.</p>
              )}
              <div className="space-y-2">
                {notes.map(n => (
                  <div key={n.id} className="group flex flex-col gap-1.5 bg-muted/40 rounded-xl px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      {editingNoteId === n.id ? (
                        <textarea
                          value={editingNoteText}
                          onChange={e => setEditingNoteText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              saveEditedNote(n.id);
                            } else if (e.key === 'Escape') {
                              setEditingNoteId(null);
                            }
                          }}
                          className="flex-1 bg-background rounded border border-border p-1.5 text-[12px] text-foreground outline-none resize-none"
                          rows={2}
                          autoFocus
                        />
                      ) : (
                        <p className="flex-1 text-[12px] text-foreground leading-relaxed whitespace-pre-wrap">{n.text}</p>
                      )}

                      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                        {editingNoteId === n.id ? (
                          <>
                            <button
                              onClick={() => saveEditedNote(n.id)}
                              className="p-0.5 text-muted-foreground hover:text-green-500 transition-colors"
                              title="Save note"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingNoteId(null)}
                              className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                              title="Cancel"
                            >
                              <Plus className="w-3.5 h-3.5 rotate-45" />
                            </button>
                          </>
                        ) : (
                          n.status !== 'saving' && (
                            <>
                              <button
                                onClick={() => startEditingNote(n.id, n.text)}
                                className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                                title="Edit note"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => deleteNote(n.id)}
                                className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                                title="Delete note"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-muted-foreground/60">
                      <div className="flex items-center gap-1.5">
                        {n.status === 'saving' && (
                          <span className="flex items-center gap-1 text-orange-500/80 font-medium animate-pulse">
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            {n.error || 'Saving...'}
                          </span>
                        )}
                        {n.status === 'failed' && (
                          <span className="flex items-center gap-1 text-destructive font-medium">
                            <span>⚠️ {n.error || 'Failed'}</span>
                            <button
                              onClick={() => handleManualRetry(n.id)}
                              className="underline hover:text-destructive-foreground transition-colors font-semibold"
                            >
                              Retry
                            </button>
                          </span>
                        )}
                        {n.status === 'saved' && (
                          <span>By {n.createdBy || 'Agent'}</span>
                        )}
                      </div>
                      {n.createdAt && <span>{formatNoteTime(n.createdAt)}</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mt-2 items-end">
                <textarea
                  ref={noteInputRef}
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      addNote();
                    }
                  }}
                  placeholder="Add a note…"
                  rows={2}
                  className="flex-1 bg-muted/50 rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground outline-none focus:bg-muted transition-colors resize-none leading-relaxed"
                />
                <button
                  onClick={addNote}
                  disabled={!noteInput.trim()}
                  className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center disabled:opacity-30 transition-opacity flex-shrink-0 mb-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </Section>
            </div>
          </>
        )}

        {!meta && (
          <div className="flex flex-col items-center justify-center h-48 px-5 text-center">
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              Select a conversation to see contact info, conversation stats, and notes.
            </p>
          </div>
        )}
      </div>

      {/* ── View Contact Detail Modal ── */}
      <AnimatePresence>
        {viewModalOpen && meta && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !modalSaving && setViewModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-xs cursor-default"
            />
            
            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              className="relative w-full max-w-[380px] bg-white dark:bg-[#1C2333] border border-border rounded-2xl overflow-hidden shadow-2xl flex flex-col p-6 space-y-5"
            >
              {!isEditingInModal ? (
                <>
                  {/* Identity Header */}
                  <div className="flex flex-col items-center text-center pb-4 border-b border-border/40 relative">
                    <button
                      onClick={() => setViewModalOpen(false)}
                      className="absolute right-0 top-0 p-1.5 hover:bg-secondary rounded-lg transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-4 h-4 rotate-45" />
                    </button>
                    
                    <div
                      style={{ background: crmAvatarGradient(rawPhone || meta.id) }}
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold border border-border mb-3 shadow-inner text-white"
                    >
                      {localLead?.name
                        ? localLead.name.charAt(0).toUpperCase()
                        : rawPhone
                          ? (() => { const d = rawPhone.replace(/\D/g, ''); const l = d.startsWith('91') && d.length === 12 ? d.slice(2) : d; return l.charAt(0) || '?'; })()
                          : '?'}
                    </div>
                    <h3 className="text-md font-semibold text-foreground tracking-tight">{displayName}</h3>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span>WhatsApp Contact</span>
                      <span>•</span>
                      <span>Score {localLead?.lead_score || 0}</span>
                    </div>
                  </div>

                  {/* View Panel Details */}
                  <div className="space-y-3">
                    <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">CRM Parameters</div>
                    <div className="flex items-center gap-3 text-[13px] font-medium text-foreground bg-background p-2.5 rounded-lg border border-border/80">
                      <Phone className="w-4 h-4 text-muted-foreground/60" />
                      <span>{formatPhoneDisplay(rawPhone)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[13px] font-medium text-foreground bg-background p-2.5 rounded-lg border border-border/80">
                      <Mail className="w-4 h-4 text-muted-foreground/60" />
                      <span className="text-muted-foreground">Email: </span>
                      <span>{localLead?.email || "—"}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[13px] font-medium text-foreground bg-background p-2.5 rounded-lg border border-border/80">
                      <Tag className="w-4 h-4 text-muted-foreground/60" />
                      <span className="text-muted-foreground">Status: </span>
                      <span className="capitalize">{localLead?.lead_status || 'new'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[13px] font-medium text-foreground bg-background p-2.5 rounded-lg border border-border/80">
                      <ChevronDown className="w-4 h-4 text-muted-foreground/60" />
                      <span className="text-muted-foreground">Saved Date: </span>
                      <span>{formatDate(localLead?.created_at || null)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[13px] font-medium text-foreground bg-background p-2.5 rounded-lg border border-border/80">
                      <Clock className="w-4 h-4 text-muted-foreground/60" />
                      <span className="text-muted-foreground">Last Interaction: </span>
                      <span>{formatDate(localLead?.last_message_at || null)}</span>
                    </div>
                  </div>

                  {localLead?.notes && (
                    <div className="space-y-2">
                      <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Context Notes</div>
                      <div className="p-3 bg-secondary/30 border border-border rounded-lg text-[13px] leading-relaxed text-foreground/80 max-h-32 overflow-y-auto whitespace-pre-wrap custom-scrollbar">
                        {localLead.notes}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => {
                        setModalEditName(localLead?.name || displayName);
                        setModalEditEmail(localLead?.email || "");
                        setModalEditNotes(localLead?.notes || "");
                        setIsEditingInModal(true);
                      }}
                      className="h-9 text-[13px] font-semibold text-foreground bg-secondary hover:bg-secondary/80 border border-border/80 rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      Edit Details
                    </button>
                    <button
                      onClick={() => setViewModalOpen(false)}
                      className="h-9 text-[13px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors cursor-pointer"
                    >
                      Close Profile
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={handleModalSave} className="flex flex-col space-y-4">
                  {/* Edit Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-border/40">
                    <div>
                      <h3 className="text-md font-bold text-foreground">Edit Contact Details</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Update key parameters for this lead.</p>
                    </div>
                    <button
                      type="button"
                      disabled={modalSaving}
                      onClick={() => setIsEditingInModal(false)}
                      className="p-1 hover:bg-secondary rounded-lg transition-colors cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="w-4 h-4 rotate-45" />
                    </button>
                  </div>

                  {/* Input Fields */}
                  <div className="space-y-3.5">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Phone Number</label>
                      <input
                        type="tel"
                        disabled
                        value={formatPhoneDisplay(rawPhone)}
                        className="w-full h-10 px-3 bg-secondary/60 border border-border rounded-lg text-[13px] text-muted-foreground cursor-not-allowed"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Full Name *</label>
                      <input
                        type="text"
                        required
                        autoFocus
                        placeholder="e.g. Rahul Sharma"
                        value={modalEditName}
                        onChange={(e) => setModalEditName(e.target.value)}
                        className="w-full h-10 px-3 bg-background border border-border rounded-lg text-[13px] focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10 transition-all text-foreground"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Email Address</label>
                      <input
                        type="email"
                        placeholder="e.g. rahul@example.com"
                        value={modalEditEmail}
                        onChange={(e) => setModalEditEmail(e.target.value)}
                        className="w-full h-10 px-3 bg-background border border-border rounded-lg text-[13px] focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10 transition-all text-foreground"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Context Notes</label>
                      <textarea
                        rows={3}
                        placeholder="Customer requirements, budget, etc."
                        value={modalEditNotes}
                        onChange={(e) => setModalEditNotes(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-[13px] focus:outline-none focus:border-indigo-500/40 focus:ring-4 focus:ring-indigo-500/10 transition-all resize-none text-foreground"
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-3 border-t border-border/40 shrink-0">
                    <button
                      type="button"
                      disabled={modalSaving}
                      onClick={() => setIsEditingInModal(false)}
                      className="text-[13px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={modalSaving}
                      className="h-9 px-5 text-[13.5px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors cursor-pointer"
                    >
                      {modalSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
