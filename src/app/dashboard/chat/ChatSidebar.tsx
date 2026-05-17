"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Search, Filter, Edit, Pin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
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

const AVATAR_COLORS = [
  "bg-emerald-500 text-white",
  "bg-blue-500 text-white",
  "bg-violet-500 text-white",
  "bg-amber-500 text-white",
  "bg-rose-500 text-white",
  "bg-cyan-500 text-white",
];

const AVATAR_COLORS_INACTIVE = [
  "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-500",
  "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-500",
  "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-500",
  "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500",
  "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-500",
  "bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-500",
];

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

function getDisplayName(conv: ChatConversation): string {
  return conv.leads?.name || conv.leads?.phone || "Unknown";
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
  const [filtered, setFiltered] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const supabaseRef = useRef(createBrowserSupabaseClient());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/chat/conversations");
      const data = await res.json();
      
      if (!data.success) {
        console.error("ChatSidebar fetch error:", data.error);
        setLoading(false);
        return;
      }

      const withPreviews = data.conversations;
      setConvos(withPreviews);
      setFiltered(withPreviews);
      setLoading(false);

      // Auto-select first if nothing selected
      if (!activeId && withPreviews.length > 0) {
        router.push(`/dashboard/chat?conversationId=${withPreviews[0].id}`);
      }
    } catch (err) {
      console.error("ChatSidebar exception:", err);
      setLoading(false);
    }
  }, [activeId, router]);

  useEffect(() => {
    load();
    // Realtime: subscribe to conversation updates
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel("chat-sidebar-convos")
      .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
        if (payload.table?.startsWith('messages') || payload.table === 'conversations') {
          load();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // Client-side search filter
  useEffect(() => {
    if (!search.trim()) {
      setFiltered(convos);
    } else {
      const q = search.toLowerCase();
      setFiltered(convos.filter(c => {
        const name = getDisplayName(c).toLowerCase();
        const preview = (c.last_message_preview ?? "").toLowerCase();
        return name.includes(q) || preview.includes(q);
      }));
    }
  }, [search, convos]);

  return (
    <div className="w-full md:w-[320px] lg:w-[360px] flex-shrink-0 border-r border-border/60 flex flex-col bg-background relative z-20">
      {/* Header */}
      <div className="h-[60px] flex items-center justify-between px-4">
        <h2 className="text-lg font-semibold text-foreground tracking-tight">Chats</h2>
        <div className="flex items-center gap-0.5">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 text-muted-foreground hover:text-foreground rounded-full transition-colors"
          >
            <Filter className="w-[18px] h-[18px]" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 text-muted-foreground hover:text-foreground rounded-full transition-colors"
          >
            <Edit className="w-[18px] h-[18px]" />
          </motion.button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="relative group">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70 transition-colors group-focus-within:text-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="pl-9 bg-muted/40 border-transparent focus-visible:ring-1 focus-visible:ring-emerald-500/30 focus-visible:bg-background transition-all duration-200 rounded-lg h-9 text-[14px] shadow-sm"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 space-y-1">
            {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {search ? `No results for "${search}"` : "No conversations yet.\nYour first WhatsApp message will appear here."}
            </p>
          </div>
        ) : (
          filtered.map((conv, idx) => {
            const isActive = conv.id === activeId;
            const colorIdx = idx % AVATAR_COLORS.length;
            const name = getDisplayName(conv);
            const preview = conv.last_message_preview ?? "No messages yet";

            return (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
                className={cn(
                  "flex items-center gap-3 px-3 py-[10px] mx-2 my-[2px] rounded-lg cursor-pointer transition-colors relative group",
                  isActive ? "bg-muted/80" : "hover:bg-muted/50"
                )}
                onClick={() => router.push(`/dashboard/chat?conversationId=${conv.id}`)}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-chat-indicator"
                    className="absolute left-0 top-[10%] bottom-[10%] w-[3px] bg-emerald-500 rounded-r-full"
                  />
                )}

                <div className={cn(
                  "w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center font-medium text-[15px] transition-all duration-200",
                  isActive ? AVATAR_COLORS[colorIdx] : AVATAR_COLORS_INACTIVE[colorIdx]
                )}>
                  {getInitial(conv)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-[2px]">
                    <h3 className="text-[14px] font-medium text-foreground truncate tracking-tight">{name}</h3>
                    <span className={cn(
                      "text-[12px] flex-shrink-0 ml-2 font-medium tracking-tight",
                      conv.is_active ? "text-emerald-500" : "text-muted-foreground/60"
                    )}>
                      {timeAgo(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-[13px] truncate pr-2 tracking-tight leading-snug text-muted-foreground">
                      {preview.slice(0, 55)}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {conv.bot_paused && <Pin className="w-3 h-3 text-muted-foreground/40 rotate-45" />}
                      {conv.is_active && (
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
