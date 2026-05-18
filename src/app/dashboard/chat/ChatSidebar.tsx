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

function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
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

  const filtered = convos.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return getDisplayName(c).toLowerCase().includes(q) ||
      (c.last_message_preview ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="w-[320px] flex-shrink-0 border-r border-border flex flex-col bg-background relative z-20">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 border-b border-border/50">
        <div className="flex items-center mb-4">
          <h2 className="text-[17px] font-semibold text-foreground tracking-tight">Inbox</h2>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-[14px] h-[14px] absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full pl-8 pr-3 py-2 bg-muted/50 rounded-lg text-[13px] outline-none text-foreground placeholder:text-muted-foreground focus:bg-muted transition-colors"
          />
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

            return (
              <button
                key={conv.id}
                onClick={() => router.push(`/dashboard/chat?conversationId=${conv.id}`)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors relative",
                  isActive
                    ? "bg-muted/80"
                    : "hover:bg-muted/40"
                )}
              >
                {/* Active indicator */}
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-foreground rounded-r-full" />}

                {/* Avatar */}
                <div className="w-11 h-11 rounded-full flex-shrink-0 overflow-hidden bg-muted flex items-center justify-center">
                  <img
                    src={avatarUrl(phone || conv.id)}
                    alt="avatar"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className={cn("text-[14px] font-semibold truncate", isActive ? "text-foreground" : "text-foreground/90")}>
                      {name}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0 ml-2">
                      {timeAgo(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] text-muted-foreground truncate flex-1">{preview}</p>
                    {/* Bot status badge */}
                    <span className={cn(
                      "flex-shrink-0 flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md",
                      conv.bot_paused
                        ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                    )}>
                      {conv.bot_paused ? <User className="w-2.5 h-2.5" /> : <Bot className="w-2.5 h-2.5" />}
                    </span>
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
