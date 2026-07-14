"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { SkeletonRow } from "@/components/ui/skeleton";
import { useContactsStore, Contact } from "@/lib/store/contactsStore";

interface ChatConversation {
  id: string;
  last_message_at: string | null;
  is_active: boolean;
  bot_paused: boolean;
  escalated?: boolean;
  leads?: { name: string | null; phone: string | null } | null;
  assigned_to?: string | null;
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

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
];

function avatarGradient(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

import { normalizePhone } from "@/lib/utils/phone";
import { contactDisplayName } from "@/lib/utils/contact-name";

function getDisplayName(conv: ChatConversation, getContactByPhone: (phone: string) => Contact | undefined): string {
  const phone = conv.leads?.phone || '';
  const contact = getContactByPhone(phone);
  return contactDisplayName(contact?.name ?? conv.leads?.name, phone);
}

function getInitial(conv: ChatConversation, getContactByPhone: (phone: string) => Contact | undefined): string {
  const phone = conv.leads?.phone || '';
  const contact = getContactByPhone(phone);
  const name = contact?.name || conv.leads?.name;
  if (name) return name.charAt(0).toUpperCase();
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
    return local.charAt(0) || '?';
  }
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
  const convosRef = useRef<ChatConversation[]>([]);
  convosRef.current = convos;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<'active' | 'requesting' | 'intervened'>('active');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

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
    // Only flag a slow load for the very first fetch (empty list) — background
    // refreshes shouldn't flash a "taking a while" banner over a working inbox.
    const isInitial = convosRef.current.length === 0;
    const slowTimer = isInitial ? setTimeout(() => setSlowLoad(true), 4_000) : null;
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`/api/dashboard/chat/conversations?_t=${Date.now()}`, { signal: controller.signal });
      const data = await res.json();
      if (!data.success) {
        setLoading(false);
        setLoadError(true);
        return;
      }
      setConvos(data.conversations);
      setLoadError(false);
      if (data.tenantId) {
        setTenantId(data.tenantId);
      }
      if (data.me?.id) {
        setMe(data.me.id);
      }
      setLoading(false);

      // Auto-select the first conversation only once (on initial load).
      if (!hasAutoSelected.current && !activeIdRef.current && data.conversations.length > 0) {
        hasAutoSelected.current = true;
        routerRef.current.push(`/dashboard/chat?conversationId=${data.conversations[0].id}`);
      }
    } catch {
      // Keep any already-loaded list on screen (loadError still surfaces a
      // non-blocking "couldn't refresh" banner); only a truly empty list turns
      // this into a full blocking error state below.
      setLoading(false);
      setLoadError(true);
    } finally {
      if (slowTimer) clearTimeout(slowTimer);
      clearTimeout(abortTimer);
      setSlowLoad(false);
    }
  }, []); // ← intentionally empty: uses refs for activeId and router

  const queryTrigger = useContactsStore((state) => state.queryTrigger);
  const getContactByPhone = useContactsStore((state) => state.getContactByPhone);
  const fetchContactsList = useContactsStore((state) => state.fetchContactsList);

  // ─── Mount: initial load ──────────────────────────────────────────────────
  useEffect(() => {
    load();
    fetchContactsList();
  }, [load, fetchContactsList, queryTrigger]);

  // ─── Realtime subscription — triggers when tenantId is loaded ─────────────
  useEffect(() => {
    if (!tenantId) return;

    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`chat-sidebar-${tenantId}`)
      // Conversation updates: status changes, escalations, bot_paused toggles
      // Filter server-side so this browser only receives events for THIS tenant
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `tenant_id=eq.${tenantId}`,
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
          table: "messages",
          filter: `tenant_id=eq.${tenantId}`,
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
  // 20s: this query fetches up to 2000 conversations + 5000 messages per call, so its
  // poll frequency is the single biggest lever on Supabase egress/Disk-IO (was 5s — see
  // 2026-07-02 usage investigation). Realtime (above) already covers the common case.
  useEffect(() => {
    const interval = setInterval(() => { load(); }, 20_000);
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
    if (mineOnly && c.assigned_to !== me) return false;
    if (activeTab === 'requesting') {
      if (!c.escalated) return false;
    } else if (activeTab === 'intervened') {
      if (!c.bot_paused) return false;
    } else {
      if (c.bot_paused) return false;
    }

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const phone = c.leads?.phone || '';
    const contact = getContactByPhone(phone);
    const resolvedName = contact?.name || c.leads?.name || '';
    const searchablePhone = normalizePhone(phone);

    return resolvedName.toLowerCase().includes(q) ||
      searchablePhone.includes(q) ||
      (c.last_message_preview ?? '').toLowerCase().includes(q);
  });

  return (
    <div className={cn(
      "w-full lg:w-[300px] flex-shrink-0 bg-card lg:border-r border-border flex flex-col relative z-20",
      activeId ? "hidden lg:flex" : "flex"
    )}>
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

        {me && (
          <div className="flex items-center gap-1 mb-3">
            <button
              onClick={() => setMineOnly(false)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                !mineOnly ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              All chats
            </button>
            <button
              onClick={() => setMineOnly(true)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                mineOnly ? "bg-indigo-500/15 text-indigo-500" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Assigned to me
            </button>
          </div>
        )}

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
            {slowLoad && (
              <p className="text-center text-[11px] text-muted-foreground/60 pt-2">
                Taking longer than usual…
              </p>
            )}
          </div>
        ) : loadError && convos.length === 0 ? (
          <div className="py-16 px-6 text-center flex flex-col items-center gap-3">
            <p className="text-[13px] text-muted-foreground">Couldn&rsquo;t load conversations.</p>
            <button
              onClick={() => { setLoading(true); load(); }}
              className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-secondary hover:bg-[#E8ECF0] dark:hover:bg-white/8 text-foreground transition-colors"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-[13px] text-muted-foreground">
              {search ? `No results for "${search}"` : "No conversations yet."}
            </p>
          </div>
        ) : (
          <>
            {loadError && (
              <div className="mx-3 mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">
                <p className="text-[11.5px]">Couldn&rsquo;t refresh — showing last known conversations.</p>
                <button onClick={() => load()} className="text-[11.5px] font-semibold underline flex-shrink-0">Retry</button>
              </div>
            )}
          {filtered.map((conv) => {
            const isActive = conv.id === activeId;
            const phone = conv.leads?.phone ?? '';
            const name = getDisplayName(conv, getContactByPhone);
            const preview = conv.last_message_preview ?? "";
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
                  <div
                    style={{ background: avatarGradient(phone || conv.id) }}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-[14px] font-bold text-white shadow-sm"
                  >
                    {getInitial(conv, getContactByPhone)}
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
          })}
          </>
        )}
      </div>
    </div>
  );
}
