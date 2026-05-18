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
  leads?: { name: string | null; phone: string | null } | null;
  last_message_preview?: string | null;
}

const AVATAR_COLORS = [
  "bg-[#F2FDF5] text-[#12B76A]",
  "bg-blue-50 text-blue-600",
  "bg-violet-50 text-violet-600",
  "bg-amber-50 text-amber-600",
  "bg-rose-50 text-rose-600",
  "bg-cyan-50 text-cyan-600",
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
        setLoading(false);
        return;
      }

      const withPreviews = data.conversations;
      setConvos(withPreviews);
      setFiltered(withPreviews);
      setLoading(false);

      if (!activeId && withPreviews.length > 0) {
        router.push(`/dashboard/chat?conversationId=${withPreviews[0].id}`);
      }
    } catch (err) {
      setLoading(false);
    }
  }, [activeId, router]);

  useEffect(() => {
    load();
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
    <div className="w-[340px] flex-shrink-0 border-r border-[#E5E7EB] dark:border-white/10 flex flex-col bg-white dark:bg-[#1A1D21] relative z-20 font-sans font-inter">
      {/* Header */}
      <div className="pt-6 pb-4 px-5">
        <h2 className="text-[20px] font-semibold text-foreground tracking-tight mb-4">Chats</h2>
        
        {/* Search */}
        <div className="relative group">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="w-full pl-9 pr-3 py-2 bg-[#F9FAFB] dark:bg-white/5 border border-transparent focus:border-blue-500/30 focus:bg-white focus:ring-2 focus:ring-blue-500/10 transition-all rounded-xl text-[14px] outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 space-y-1 mt-2">
            {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              {search ? `No results for "${search}"` : "No conversations yet."}
            </p>
          </div>
        ) : (
          filtered.map((conv, idx) => {
            const isActive = conv.id === activeId;
            const colorIdx = idx % AVATAR_COLORS.length;
            const name = getDisplayName(conv);
            const preview = conv.last_message_preview ?? "No messages yet";

            return (
              <div
                key={conv.id}
                onClick={() => router.push(`/dashboard/chat?conversationId=${conv.id}`)}
                className={cn(
                  "flex items-center gap-3 px-5 py-[12px] cursor-pointer transition-colors relative group",
                  isActive 
                    ? "bg-[#2563EB]/[0.08] dark:bg-[#2563EB]/20 border-l-[3px] border-l-[#2563EB]" 
                    : "border-l-[3px] border-l-transparent hover:bg-[#F9FAFB] dark:hover:bg-white/5"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center font-semibold text-[15px] transition-all",
                  AVATAR_COLORS[colorIdx]
                )}>
                  {getInitial(conv)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-[3px]">
                    <h3 className="text-[15px] font-semibold text-foreground truncate tracking-tight">{name}</h3>
                    <span className="text-[12px] flex-shrink-0 ml-2 font-medium text-muted-foreground">
                      {timeAgo(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className={cn(
                      "text-[14px] truncate pr-2 tracking-tight leading-snug",
                      isActive ? "text-foreground font-medium" : "text-muted-foreground"
                    )}>
                      {preview}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
