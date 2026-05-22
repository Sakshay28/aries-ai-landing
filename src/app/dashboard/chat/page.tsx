"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import ChatSidebar from "./ChatSidebar";
import ChatArea from "./ChatArea";
import CRMPanel from "./CRMPanel";
import type { Message } from "@/lib/types";

export interface SharedConversationMeta {
  id: string;
  is_active: boolean;
  bot_paused: boolean;
  escalated?: boolean;
  escalated_at?: string | null;
  escalation_reason?: string | null;
  lead_id?: string | null;
  sender_name: string | null;
  sender_id: string | null;
  leads?: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    lead_status: string | null;
    lead_score: number | null;
    tags: string[] | null;
    created_at: string | null;
    first_message_at: string | null;
    assigned_to?: string | null;
  } | null;
}

export default function ChatPage() {
  const [meta, setMeta] = useState<SharedConversationMeta | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const handleLeadUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { lead?: any; conversationId?: string };
      if (!detail?.lead || !detail?.conversationId) return;
      setMeta(prev => {
        if (prev && prev.id === detail.conversationId) {
          return { ...prev, leads: detail.lead };
        }
        return prev;
      });
    };
    window.addEventListener('lead-updated', handleLeadUpdated);
    return () => window.removeEventListener('lead-updated', handleLeadUpdated);
  }, []);

  const handleDataLoaded = useCallback((m: SharedConversationMeta | null, msgs: Message[]) => {
    setMeta(m);
    setMessages(msgs);
  }, []);

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 h-[calc(100vh-64px)] lg:h-screen flex overflow-hidden bg-background text-foreground"
      style={{
        background: 'var(--background)',
        ['--chat-surface' as string]: 'var(--secondary)',
      } as React.CSSProperties}
    >
      <Suspense fallback={null}>
        <ChatSidebar />
      </Suspense>
      <Suspense fallback={null}>
        <ChatArea onDataLoaded={handleDataLoaded} />
      </Suspense>
      <CRMPanel meta={meta} messages={messages} />
    </div>
  );
}
