"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Phone, Tag, Bot, User,
  MessageSquare, ChevronDown, Plus, Trash2,
  UserPlus, StickyNote, Workflow, Loader2, Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { Message } from "@/lib/types";
import type { SharedConversationMeta } from "./page";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

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

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (local.length === 10) return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  return `+${digits}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
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


// ── portal dropdown ─────────────────────────────────────────────────
function DropdownPortal({
  anchorRef, name, children,
}: {
  anchorRef: { current: HTMLElement | null };
  name: string;
  children: React.ReactNode;
}) {
  if (typeof document === 'undefined') return null;
  const rect = anchorRef.current?.getBoundingClientRect();
  if (!rect) return null;
  return createPortal(
    <div
      data-portal={name}
      className="fixed z-[9999] bg-card border border-border rounded-xl shadow-xl overflow-hidden"
      style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}
    >
      {children}
    </div>,
    document.body
  );
}

// ── note type ────────────────────────────────────────────────────────
interface Note { id: string; text: string; createdAt: string; }

// ── main component ──────────────────────────────────────────────────
interface CRMPanelProps {
  meta: SharedConversationMeta | null;
  messages: Message[];
}

export default function CRMPanel({ meta, messages }: CRMPanelProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [localLead, setLocalLead] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const noteInputRef = useRef<HTMLInputElement>(null);
  const agentSelectRef = useRef<HTMLSelectElement>(null);
  const notesSectionRef = useRef<HTMLDivElement>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(true);
  const [statusDropOpen, setStatusDropOpen] = useState(false);
  const [agentDropOpen, setAgentDropOpen] = useState(false);
  const statusDropRef = useRef<HTMLDivElement>(null);
  const agentDropRef = useRef<HTMLDivElement>(null);
  const statusTriggerRef = useRef<HTMLButtonElement>(null);
  const agentTriggerRef = useRef<HTMLButtonElement>(null);
  // Outside-click: use closest() on live DOM — immune to React async ref assignment
  useEffect(() => {
    if (!statusDropOpen && !agentDropOpen && !tagsOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (statusDropOpen) {
        const inPortal = target.closest?.('[data-portal="status-drop"]');
        const inTrigger = statusTriggerRef.current?.contains(target as Node);
        if (!inPortal && !inTrigger) setStatusDropOpen(false);
      }
      if (agentDropOpen) {
        const inPortal = target.closest?.('[data-portal="agent-drop"]');
        const inTrigger = agentTriggerRef.current?.contains(target as Node);
        const inQuick = !!(target as Element).closest?.('[data-assign-trigger]');
        if (!inPortal && !inTrigger && !inQuick) setAgentDropOpen(false);
      }
      if (tagsOpen) {
        const inPortal = target.closest?.('[data-portal="tags-drop"]');
        const inTrigger = !!(target as Element).closest?.('[data-tag-trigger]');
        if (!inPortal && !inTrigger) setTagsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusDropOpen, agentDropOpen, tagsOpen]);

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

  // Load notes from localStorage keyed by conversation id
  useEffect(() => {
    if (!meta?.id) { setNotes([]); return; }
    try {
      const raw = localStorage.getItem(`crm-notes-${meta.id}`);
      setNotes(raw ? JSON.parse(raw) : []);
    } catch { setNotes([]); }
  }, [meta?.id]);

  const saveNotes = (updated: Note[]) => {
    setNotes(updated);
    if (meta?.id) localStorage.setItem(`crm-notes-${meta.id}`, JSON.stringify(updated));
  };

  const addNote = () => {
    const text = noteInput.trim();
    if (!text) return;
    saveNotes([...notes, { id: Date.now().toString(), text, createdAt: new Date().toISOString() }]);
    setNoteInput("");
  };
  const deleteNote = (id: string) => saveNotes(notes.filter(n => n.id !== id));

  const lead = meta?.leads;
  const rawPhone = lead?.phone || meta?.sender_id || meta?.sender_name || "";
  const displayName = lead?.name || formatPhone(rawPhone) || "Unknown";

  const inboundCount = messages.filter(m => m.direction === "inbound").length;
  const outboundCount = messages.filter(m => m.direction === "outbound").length;
  const aiCount = messages.filter(m => m.ai_generated).length;
  const firstMsg = messages[0];
  const lastMsg = messages.at(-1);

  return (
    <div className="w-[300px] flex-shrink-0 bg-card border-l border-border flex flex-col overflow-hidden">
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
            {rawPhone && <p className="text-[11.5px] text-muted-foreground/60 mt-0.5 truncate">{formatPhone(rawPhone)}</p>}
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
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground/60">Select a conversation</p>
        )}
      </div>

      {/* Quick Actions */}
      {meta && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-4 gap-1.5">
            {([
              {
                icon: UserPlus, label: 'Assign', dataAttr: 'data-assign-trigger',
                action: () => {
                  setAgentDropOpen(true);
                  agentTriggerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                action: () => window.location.href = '/dashboard/flows'
              },
            ]).map(({ icon: Icon, label, action, dataAttr }: any) => (
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
                <div data-portal="tags-drop" className="bg-muted/40 rounded-xl p-3 mb-1">
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
                      {formatPhone(rawPhone) || "—"}
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

              {/* Status Row — custom dropdown */}
              {(() => {
                const STATUS_OPTIONS = [
                  { value: 'new',       label: 'New',       emoji: '🆕', color: 'text-foreground' },
                  { value: 'hot',       label: 'Hot',       emoji: '🔥', color: 'text-red-600 dark:text-red-400' },
                  { value: 'warm',      label: 'Warm',      emoji: '☀️', color: 'text-orange-600 dark:text-orange-400' },
                  { value: 'cold',      label: 'Cold',      emoji: '❄️', color: 'text-blue-600 dark:text-blue-400' },
                  { value: 'converted', label: 'Converted', emoji: '👑', color: 'text-emerald-600 dark:text-emerald-400' },
                ];
                const current = STATUS_OPTIONS.find(o => o.value === (localLead?.lead_status || 'new')) || STATUS_OPTIONS[0];
                return (
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[9.5px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Lead Status</p>
                    <button
                      ref={statusTriggerRef}
                      onClick={() => setStatusDropOpen(v => !v)}
                      className="w-full flex items-center justify-between px-2.5 py-2 bg-secondary/60 hover:bg-secondary border border-border hover:border-indigo-400 rounded-xl text-[12.5px] font-semibold transition-all"
                    >
                      <span className={cn('flex items-center gap-2', current.color)}>
                        <span className="text-[14px]">{current.emoji}</span>
                        {current.label}
                      </span>
                      <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200', statusDropOpen && 'rotate-180')} />
                    </button>
                    {statusDropOpen && (
                      <DropdownPortal anchorRef={statusTriggerRef} name="status-drop">
                        {STATUS_OPTIONS.map(opt => (
                          <button
                            type="button"
                            key={opt.value}
                            onClick={() => { updateLeadStatus(opt.value); setStatusDropOpen(false); }}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-medium transition-colors hover:bg-muted/60',
                              opt.value === current.value ? 'bg-muted/80' : ''
                            )}
                          >
                            <span className="text-[14px]">{opt.emoji}</span>
                            <span className={opt.color}>{opt.label}</span>
                            {opt.value === current.value && <Check className="w-3 h-3 ml-auto text-indigo-500" />}
                          </button>
                        ))}
                      </DropdownPortal>
                    )}
                  </div>
                );
              })()}

              {/* Agent Assignment — custom dropdown */}
              {(() => {
                const currentAgent = team.find((u: any) => u.id === localLead?.assigned_to);
                const currentLabel = currentAgent ? (currentAgent.full_name || currentAgent.email) : 'Unassigned';
                const currentInitial = currentAgent ? (currentAgent.full_name || currentAgent.email || '?').charAt(0).toUpperCase() : null;
                return (
                  <div className="flex flex-col gap-0.5">
                    <p className="text-[9.5px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Assigned Agent</p>
                    {loadingTeam ? (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading team...
                      </div>
                    ) : (
                      <>
                        <button
                          ref={agentTriggerRef}
                          onClick={() => setAgentDropOpen(v => !v)}
                          className="w-full flex items-center justify-between px-2.5 py-2 bg-secondary/60 hover:bg-secondary border border-border hover:border-indigo-400 rounded-xl text-[12.5px] font-semibold transition-all"
                        >
                          <span className="flex items-center gap-2 text-foreground">
                            {currentInitial ? (
                              <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{currentInitial}</span>
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                <User className="w-3 h-3 text-muted-foreground/50" />
                              </span>
                            )}
                            <span className={cn(currentAgent ? 'text-foreground' : 'text-muted-foreground')}>{currentLabel}</span>
                          </span>
                          <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200', agentDropOpen && 'rotate-180')} />
                        </button>
                        {agentDropOpen && (
                          <DropdownPortal anchorRef={agentTriggerRef} name="agent-drop">
                            <button
                              type="button"
                            onClick={() => { assignAgent(null); setAgentDropOpen(false); }}
                              className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-medium transition-colors hover:bg-muted/60', !localLead?.assigned_to ? 'bg-muted/80' : '')}
                            >
                              <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                <User className="w-3 h-3 text-muted-foreground/50" />
                              </span>
                              <span className="text-muted-foreground">Unassigned</span>
                              {!localLead?.assigned_to && <Check className="w-3 h-3 ml-auto text-indigo-500" />}
                            </button>
                            {team.map((u: any) => {
                              const initial = (u.full_name || u.email || '?').charAt(0).toUpperCase();
                              const isSelected = u.id === localLead?.assigned_to;
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => { assignAgent(u.id); setAgentDropOpen(false); }}
                                  className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-medium transition-colors hover:bg-muted/60', isSelected ? 'bg-muted/80' : '')}
                                >
                                  <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{initial}</span>
                                  <span className="truncate">{u.full_name || u.email}</span>
                                  {isSelected && <Check className="w-3 h-3 ml-auto text-indigo-500" />}
                                </button>
                              );
                            })}
                          </DropdownPortal>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}

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
              {notes.length === 0 && (
                <p className="text-[12px] text-muted-foreground">No notes yet.</p>
              )}
              {notes.map(n => (
                <div key={n.id} className="group flex items-start gap-2 bg-muted/40 rounded-xl px-3 py-2.5">
                  <p className="flex-1 text-[12px] text-foreground leading-relaxed">{n.text}</p>
                  <button
                    onClick={() => deleteNote(n.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                  >
                    <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive transition-colors" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 mt-1">
                <input
                  ref={noteInputRef}
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addNote()}
                  placeholder="Add a note…"
                  className="flex-1 bg-muted/50 rounded-lg px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground outline-none focus:bg-muted transition-colors"
                />
                <button
                  onClick={addNote}
                  disabled={!noteInput.trim()}
                  className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center disabled:opacity-30 transition-opacity flex-shrink-0"
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
    </div>
  );
}
