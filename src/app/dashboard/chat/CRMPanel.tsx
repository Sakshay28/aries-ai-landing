"use client";

import { useState, useEffect, useRef } from "react";
import {
  Phone, Tag, Bot, User,
  MessageSquare, ChevronDown, Plus, Trash2,
  UserPlus, StickyNote, Workflow, Sparkles, Loader2,
  Target, Zap, ArrowRight, Brain,
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
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(o => !o)}
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
            className="overflow-hidden"
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

// ── AI Brief types (mirrored from API route) ─────────────────────
interface AISummaryBrief {
  conversationGoal: string;
  keyContext: { label: string; value: string }[];
  intents: { label: string; confidence: number }[];
  sentiment: { label: string; emoji: string; explanation: string; tone: 'positive' | 'neutral' | 'frustrated' | 'confused' };
  leadScore: number;
  leadScoreReasons: string[];
  recommendedAction: { level: 'green' | 'yellow' | 'purple'; action: string };
  snapshot: string;
}

const ACTION_STYLES = {
  green:  { bg: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  yellow: { bg: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40',   text: 'text-amber-700 dark:text-amber-300',   dot: 'bg-amber-500' },
  purple: { bg: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/40', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
};

const SENTIMENT_STYLES = {
  positive:   'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40',
  neutral:    'bg-slate-50 dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10',
  frustrated: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/40',
  confused:   'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/40',
};

function AIBriefCard({ meta, messages }: { meta: SharedConversationMeta; messages: Message[] }) {
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<AISummaryBrief | null>(null);
  const prevConvId = useRef<string>('');

  // Reset brief whenever we switch to a different conversation
  useEffect(() => {
    if (prevConvId.current !== meta.id) {
      prevConvId.current = meta.id;
      setBrief(null);
    }
  }, [meta.id]);

  const generate = async () => {
    if (messages.length === 0) { toast.error('Nothing to summarize yet'); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/chat/summary?conversationId=${meta.id}`);
      const data = await res.json();
      if (data.success) setBrief(data.brief);
      else toast.error('Could not generate brief');
    } catch { toast.error('Brief generation failed'); }
    finally { setLoading(false); }
  };

  if (!brief) {
    return (
      <button
        onClick={generate}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 hover:from-violet-100 hover:to-fuchsia-100 dark:hover:from-violet-900/40 dark:hover:to-fuchsia-900/40 border border-violet-100 dark:border-violet-900/40 text-violet-700 dark:text-violet-300 text-[11.5px] font-semibold transition-all"
      >
        {loading
          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating AI Brief…</>
          : <><Brain className="w-3.5 h-3.5" /> <span>✨ Generate AI Brief</span></>
        }
      </button>
    );
  }

  const actionStyle = ACTION_STYLES[brief.recommendedAction.level];
  const sentStyle = SENTIMENT_STYLES[brief.sentiment.tone] || SENTIMENT_STYLES.neutral;

  return (
    <div className="space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-[11px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider">AI Brief</span>
        </div>
        <button onClick={() => setBrief(null)} className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">
          Regenerate
        </button>
      </div>

      {/* Snapshot TL;DR */}
      <div className="rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/20 dark:to-fuchsia-950/20 border border-violet-100 dark:border-violet-900/30 px-3 py-2.5">
        <p className="text-[12px] text-foreground/85 leading-relaxed italic">"{brief.snapshot}"</p>
      </div>

      {/* Conversation Goal */}
      <div className="rounded-xl bg-muted/40 px-3 py-2.5 space-y-1">
        <div className="flex items-center gap-1.5">
          <Target className="w-3 h-3 text-muted-foreground/60" />
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/60">Goal</p>
        </div>
        <p className="text-[12px] text-foreground/85 leading-snug">{brief.conversationGoal}</p>
      </div>

      {/* Key Context */}
      {brief.keyContext.length > 0 && (
        <div className="rounded-xl bg-muted/40 px-3 py-2.5 space-y-1.5">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1">Key Context</p>
          {brief.keyContext.map((ctx, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground/70">{ctx.label}</span>
              <span className="text-[11.5px] font-semibold text-foreground/85">{ctx.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Intents */}
      {brief.intents.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-muted-foreground/60" />
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/60">Intent</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {brief.intents.map((intent, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800/40 rounded-full px-2.5 py-1">
                <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">{intent.label}</span>
                <span className="text-[10px] font-bold text-indigo-400 dark:text-indigo-500">{intent.confidence}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sentiment */}
      <div className={cn('flex items-center gap-2.5 rounded-xl px-3 py-2.5 border', sentStyle)}>
        <span className="text-[18px] leading-none">{brief.sentiment.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold leading-tight">{brief.sentiment.label}</p>
          <p className="text-[10.5px] opacity-75 mt-0.5 leading-snug">{brief.sentiment.explanation}</p>
        </div>
      </div>

      {/* Lead Score */}
      <div className="rounded-xl bg-muted/40 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground/60">Lead Score</p>
          <span className="text-[13px] font-bold text-foreground">{brief.leadScore}<span className="text-[10px] text-muted-foreground/60">/100</span></span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${brief.leadScore}%`, background: brief.leadScore >= 70 ? '#22c55e' : brief.leadScore >= 40 ? '#f59e0b' : '#ef4444' }}
          />
        </div>
        <div className="space-y-0.5">
          {brief.leadScoreReasons.map((r, i) => (
            <p key={i} className="text-[10.5px] text-muted-foreground/70 flex items-center gap-1">
              <span className="text-muted-foreground/40">•</span> {r}
            </p>
          ))}
        </div>
      </div>

      {/* Recommended Action */}
      <div className={cn('rounded-xl px-3 py-2.5 border space-y-2', actionStyle.bg)}>
        <div className="flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', actionStyle.dot)} />
          <p className={cn('text-[9.5px] font-bold uppercase tracking-wider', actionStyle.text)}>Recommended Action</p>
        </div>
        <p className={cn('text-[12px] font-medium leading-snug', actionStyle.text)}>{brief.recommendedAction.action}</p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {(['Assign Agent', 'Take Over', 'Follow-up'] as const).map((label) => (
            <button
              key={label}
              onClick={() => toast.info(`${label} — coming soon`)}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-semibold border transition-all hover:opacity-80',
                actionStyle.bg, actionStyle.text
              )}
            >
              <ArrowRight className="w-2.5 h-2.5" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
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

  const PREDEFINED_TAGS = ['VIP', 'Follow-up', 'Complaint', 'Booking', 'Pricing', 'Interested', 'Not interested', 'Spam'];

  const toggleTag = async (tag: string) => {
    if (!localLead?.id) return;
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
    if (!localLead?.id) return;
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
    if (!localLead?.id) return;
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
                icon: UserPlus, label: 'Assign',
                action: () => {
                  agentSelectRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  setTimeout(() => {
                    agentSelectRef.current?.focus();
                    agentSelectRef.current?.classList.add('ring-2', 'ring-indigo-500');
                    setTimeout(() => agentSelectRef.current?.classList.remove('ring-2', 'ring-indigo-500'), 1500);
                  }, 300);
                }
              },
              {
                icon: Tag, label: 'Tag',
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
            ]).map(({ icon: Icon, label, action }) => (
              <button
                key={label}
                onClick={action}
                className="group flex flex-col items-center gap-1 py-2 rounded-xl hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                <Icon className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
                <span className="text-[10px] font-medium text-muted-foreground/70 group-hover:text-foreground transition-colors">{label}</span>
              </button>
            ))}
          </div>

          {/* Tag picker dropdown */}
          {tagsOpen && (
            <div className="px-4 pb-3">
              <div className="bg-muted/50 rounded-xl p-2.5">
                <p className="text-[9.5px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Quick Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {PREDEFINED_TAGS.map(tag => {
                    const active = (localLead?.tags || []).includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          'px-2 py-1 rounded-lg text-[11px] font-semibold transition-all',
                          active
                            ? 'bg-indigo-500 text-white shadow-sm'
                            : 'bg-white dark:bg-white/10 text-foreground/70 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600'
                        )}
                      >
                        {active ? '✓ ' : ''}{tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* subtle separator */}
          <div className="mx-4 h-px bg-border mb-1 mt-1" />
        </div>
      )}

      {/* ── Sections ── */}
      <div className="flex-1 overflow-y-auto">
        {meta && (
          <>
            {/* AI Insights */}
            <Section title="AI Brief" icon={Sparkles}>
              <AIBriefCard meta={meta} messages={messages} />
            </Section>

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

              {/* Status Row */}
              <div className="flex flex-col gap-0.5">
                <p className="text-[9.5px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Lead Status</p>
                <select
                  value={localLead?.lead_status || 'new'}
                  onChange={e => updateLeadStatus(e.target.value)}
                  className="w-full text-[12px] bg-secondary/50 border border-border hover:border-indigo-500/50 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer text-foreground transition-all duration-150 font-semibold"
                >
                  <option value="new">New</option>
                  <option value="hot">Hot 🔥</option>
                  <option value="warm">Warm ☀️</option>
                  <option value="cold">Cold ❄️</option>
                  <option value="converted">Converted 👑</option>
                </select>
              </div>

              {/* Agent Assignment */}
              <div className="flex flex-col gap-0.5">
                <p className="text-[9.5px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-1">Assigned Agent</p>
                {loadingTeam ? (
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading team...
                  </div>
                ) : (
                  <select
                    ref={agentSelectRef}
                    value={localLead?.assigned_to || ""}
                    onChange={e => assignAgent(e.target.value || null)}
                    className="w-full text-[12px] bg-secondary/50 border border-border hover:border-indigo-500/50 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 cursor-pointer text-foreground transition-all duration-150 font-semibold"
                  >
                    <option value="">Unassigned</option>
                    {team.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {localLead?.tags && localLead.tags.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {localLead.tags.map((t: string) => (
                      <span key={t} className="px-2 py-0.5 bg-muted rounded-md text-[11px] font-medium text-foreground">{t}</span>
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
