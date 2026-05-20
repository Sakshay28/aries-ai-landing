"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { SkeletonRow } from "@/components/ui/skeleton";

interface ChatConversation {
  id: string;
  last_message_at: string | null;
  is_active: boolean;
  bot_paused: boolean;
  escalated?: boolean;
  leads?: { name: string | null; phone: string | null } | null;
  last_message_preview?: string | null;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  if (diff < 172800) return "Yesterday";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const AVATAR_BG = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
];

function avatarColor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_BG[h % AVATAR_BG.length];
}

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  if (local.length === 10) return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  return `+${digits}`;
}

function getDisplayName(conv: ChatConversation): string {
  return conv.leads?.name || formatPhone(conv.leads?.phone) || "Unknown";
}

function getInitial(conv: ChatConversation): string {
  const name = conv.leads?.name;
  if (name) return name.charAt(0).toUpperCase();
  const phone = conv.leads?.phone;
  if (phone) return phone.replace(/\D/g, '').slice(-1) || '?';
  return "?";
}

export default function ChatSidebar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Read activeId directly from searchParams inside callbacks via ref — avoids
  // making activeId a dependency that causes load() to get a new reference.
  const activeIdRef = useRef(searchParams.get("conversationId") || "");
  activeIdRef.current = searchParams.get("conversationId") || "";
  const activeId = activeIdRef.current;

  const [convos, setConvos] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'active' | 'requesting' | 'intervened'>('active');
  const [tenantId, setTenantId] = useState<string | null>(null);

  const supabaseRef = useRef(createBrowserSupabaseClient());
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Track whether we've done the initial auto-select so it only happens once.
  const hasAutoSelected = useRef(false);
  // RouterRef so load() doesn't need router as a dependency.
  const routerRef = useRef(router);
  routerRef.current = router;

  // ─── STABLE load() — no dependencies that change on URL navigation ───────
  // Using a ref-based pattern so the Realtime callback always calls the latest
  // version without needing to re-subscribe the channel.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/chat/conversations?_t=${Date.now()}`);
      const data = await res.json();
      if (!data.success) {
        setLoading(false);
        return;
      }
      setConvos(data.conversations);
      if (data.tenantId) {
        setTenantId(data.tenantId);
      }
      setLoading(false);

      // Auto-select the first conversation only once (on initial load).
      if (!hasAutoSelected.current && !activeIdRef.current && data.conversations.length > 0) {
        hasAutoSelected.current = true;
        routerRef.current.push(`/dashboard/chat?conversationId=${data.conversations[0].id}`);
      }
    } catch {
      setLoading(false);
    }
  }, []); // ← intentionally empty: uses refs for activeId and router

  // ─── Mount: initial load ──────────────────────────────────────────────────
  useEffect(() => {
    load();
  }, [load]);

  // ─── Realtime subscription — triggers when tenantId is loaded ─────────────
  useEffect(() => {
    if (!tenantId) return;

    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`chat-sidebar-${tenantId}`)
      // Conversation updates: status changes, escalations, bot_paused toggles
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations"
        },
        (payload) => {
          if (payload.new && (payload.new as any).tenant_id === tenantId) {
            load();
          }
        }
      )
      // New messages: refresh sidebar previews + last_message_at ordering
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages"
        },
        (payload) => {
          if (payload.new && (payload.new as any).tenant_id === tenantId) {
            load();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Sidebar Realtime] ✅ Subscribed for tenant:', tenantId);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Sidebar Realtime] ❌ Error:', status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, load]);

  // ─── Polling fallback — guarantees sidebar updates even without Realtime ───
  useEffect(() => {
    const interval = setInterval(() => { load(); }, 5_000);
    return () => clearInterval(interval);
  }, [load]);

  // ─── Keyboard shortcut ⌘K / Ctrl+K ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = convos.filter(c => {
    if (activeTab === 'requesting') {
      if (!c.escalated) return false;
    } else if (activeTab === 'intervened') {
      if (!c.bot_paused) return false;
    } else {
      if (c.bot_paused) return false;
    }

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return getDisplayName(c).toLowerCase().includes(q) ||
      (c.last_message_preview ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="w-[300px] flex-shrink-0 bg-card border-r border-border flex flex-col relative z-20">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <h2 className="text-[15px] font-semibold text-foreground tracking-tight mb-3">Inbox</h2>

        {/* Tabs */}
        <div className="flex gap-1 p-0.5 bg-secondary rounded-lg mb-3">
          {(['active', 'requesting', 'intervened'] as const).map((tab) => {
            const count = convos.filter(c => {
              if (tab === 'requesting') return c.escalated;
              if (tab === 'intervened') return c.bot_paused;
              return !c.bot_paused;
            }).length;

            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all relative capitalize",
                  activeTab === tab
                    ? "bg-card text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab}
                {count > 0 && (
                  <span className={cn(
                    "ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold",
                    tab === 'requesting'
                      ? "bg-red-500/20 text-red-500"
                      : tab === 'intervened'
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-emerald-500/20 text-emerald-400"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 text-muted-foreground/50 pointer-events-none" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full pl-8 pr-10 py-2 bg-secondary rounded-xl text-[13px] outline-none text-foreground placeholder:text-muted-foreground/50 focus:bg-[#E8ECF0] dark:focus:bg-white/8 transition-colors"
          />
          <span className="absolute right-3 text-[10px] font-medium text-muted-foreground/40 pointer-events-none">⌘K</span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-3 space-y-1">
            {[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-[13px] text-muted-foreground">
              {search ? `No results for "${search}"` : "No conversations yet."}
            </p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isActive = conv.id === activeId;
            const name = getDisplayName(conv);
            const preview = conv.last_message_preview ?? "";
            const phone = conv.leads?.phone ?? '';
            const isRecent = conv.last_message_at
              ? (Date.now() - new Date(conv.last_message_at).getTime()) < 5 * 60_000
              : false;
            const isUnreadFeel = isRecent && !isActive;

            return (
              <button
                key={conv.id}
                onClick={() => router.push(`/dashboard/chat?conversationId=${conv.id}`)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 relative group",
                  isActive
                    ? "bg-[#EEF2F7] dark:bg-white/8 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] border-y border-black/5 dark:border-white/5"
                    : "hover:bg-[#F5F7FA] dark:hover:bg-white/4"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-indigo-500 to-violet-500 rounded-r-full shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                )}

                <div className="relative flex-shrink-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold ${avatarColor(phone || conv.id)}`}>
                    {getInitial(conv)}
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5">
                    <span className={cn(
                      "absolute inset-0 rounded-full border-2 border-white dark:border-[#111827]",
                      conv.bot_paused ? "bg-blue-400" : "bg-emerald-400"
                    )} />
                    {isRecent && (
                      <span className={cn(
                        "absolute inset-0 rounded-full animate-ping",
                        conv.bot_paused ? "bg-blue-400/70" : "bg-emerald-400/70"
                      )} />
                    )}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <span className={cn(
                      "text-[13.5px] truncate",
                      isUnreadFeel ? "font-bold text-foreground" : isActive ? "font-semibold text-foreground" : "font-semibold text-foreground/85"
                    )}>
                      {name}
                    </span>
                    <span className={cn(
                      "text-[11px] flex-shrink-0 ml-2 font-normal",
                      isUnreadFeel ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground/60"
                    )}>
                      {timeAgo(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className={cn(
                      "text-[12.5px] truncate flex-1",
                      isUnreadFeel ? "text-foreground/80 font-medium" : "text-muted-foreground/70 font-normal"
                    )}>{preview || 'No messages yet'}</p>
                    {isUnreadFeel && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
