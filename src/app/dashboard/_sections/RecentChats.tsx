"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonRow } from "@/components/ui/skeleton";
import { CheckCheck } from "lucide-react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

interface Conversation {
  id: string;
  lead_id: string | null;
  last_message_at: string | null;
  unread_count?: number;
  leads?: { name: string | null; phone: string | null } | null;
  last_message_text?: string | null;
}

const AVATAR_COLORS = [
  "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-500",
  "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-500",
  "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-500",
  "bg-amber-50 text-amber-600 dark:bg-amberite-500/10 dark:text-amber-500",
  "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-500",
];

function getInitials(name: string | null | undefined, phone: string | null | undefined) {
  if (name) {
    const parts = name.trim().split(" ");
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  if (phone) return phone.slice(-2);
  return "??";
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 172800) return "Yesterday";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function RecentChats() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    async function load() {
      // Get current session to extract tenant_id via RLS
      const { data: convData } = await supabase
        .from("conversations")
        .select("id, lead_id, last_message_at, leads(name, phone)")
        .order("last_message_at", { ascending: false })
        .limit(5);

      if (!convData || convData.length === 0) {
        setConvos([]);
        setLoading(false);
        return;
      }

      // Fetch last message per conversation
      const withMessages = await Promise.all(
        convData.map(async (c) => {
          const { data: msgs } = await supabase
            .from("messages")
            .select("content")
            .eq("conversation_id", c.id)
            .order("created_at", { ascending: false })
            .limit(1);

          return {
            ...c,
            last_message_text: msgs?.[0]?.content ?? null,
          } as unknown as Conversation;
        })
      );

      setConvos(withMessages);
      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-1 divide-y divide-border">
        {[...Array(3)].map((_, i) => <SkeletonRow key={i} className="px-1" />)}
      </div>
    );
  }

  if (convos.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No conversations yet — waiting for your first WhatsApp message.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {convos.map((chat, idx) => {
        const name = chat.leads?.name ?? chat.leads?.phone ?? "Unknown";
        const initials = getInitials(chat.leads?.name, chat.leads?.phone);
        const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
        const preview = chat.last_message_text
          ? chat.last_message_text.slice(0, 60)
          : "No messages yet";

        return (
          <Link href={`/dashboard/chat?conversationId=${chat.id}`} key={chat.id} className="block outline-none">
            <Card className="border-border bg-card shadow-none hover:bg-[#F9F9F8] dark:hover:bg-muted/50 transition-colors cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarColor}`}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-medium text-foreground">{name}</h4>
                  <p className="text-sm text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                    {preview}
                    <CheckCheck className="w-3.5 h-3.5 text-foreground/30 shrink-0" />
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground font-medium">
                    {timeAgo(chat.last_message_at)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
