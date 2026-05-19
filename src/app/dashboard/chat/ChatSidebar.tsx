"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Search, Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { SkeletonRow } from "@/components/ui/skeleton";

interface ChatConversation {
  id: string;
  last_message_at: string | null;
  is_active: boolean;
  bot_paused: boolean;
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
  if (phone) return phone.slice(-1);
  return "?";
}

export default function ChatSidebar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeId = searchParams.get("conversationId") || "";
  const [convos, setConvos] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const supabaseRef = useRef(createBrowserSupabaseClient());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/chat/conversations");
      const data = await res.json();
      if (!data.success) { setLoading(false); return; }
      setConvos(data.conversations);
      setLoading(false);
      if (!activeId && data.conversations.length > 0) {
        router.push(`/dashboard/chat?conversationId=${data.conversations[0].id}`);
      }
    } catch { setLoading(false); }
  }, [activeId, router]);

  useEffect(() => {
    load();
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("chat-sidebar-convos")
      .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
        if (payload.table?.startsWith('messages') || payload.table === 'conversations') load();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

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
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return getDisplayName(c).toLowerCase().includes(q) ||
      (c.last_message_preview ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="w-[300px] flex-shrink-0 bg-white dark:bg-[#111827] shadow-[1px_0_0_rgba(0,0,0,0.06)] dark:shadow-[1px_0_0_rgba(255,255,255,0.04)] flex flex-col relative z-20">
      {/* Header */}
      <div className="px-4 pt-5 pb-3">
        <h2 className="text-[15px] font-semibold text-foreground tracking-tight mb-3">Inbox</h2>

        {/* Search */}
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-3 text-muted-foreground/50 pointer-events-none" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full pl-8 pr-10 py-2 bg-[#F0F2F5] dark:bg-white/5 rounded-xl text-[13px] outline-none text-foreground placeholder:text-muted-foreground/50 focus:bg-[#E8ECF0] dark:focus:bg-white/8 transition-colors"
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
            // "Recent" = activity in last 5 min (drives pulse + unread emphasis)
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
                    ? "bg-[#EEF2F7] dark:bg-white/8"
                    : "hover:bg-[#F5F7FA] dark:hover:bg-white/4"
                )}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-7 bg-foreground rounded-r-full" />
                )}

                {/* Avatar with status dot */}
                <div className="relative flex-shrink-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold ${avatarColor(phone || conv.id)}`}>
                    {getInitial(conv)}
                  </div>
                  {/* Mode dot (pulses when conversation is active in last 5 min) */}
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

                {/* Content */}
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
