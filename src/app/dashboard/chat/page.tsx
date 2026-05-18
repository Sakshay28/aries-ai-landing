"use client";

import { Suspense, useState, useCallback } from "react";
import ChatSidebar from "./ChatSidebar";
import ChatArea from "./ChatArea";
import CRMPanel from "./CRMPanel";
import type { Message } from "@/lib/types";

export interface SharedConversationMeta {
  id: string;
  is_active: boolean;
  bot_paused: boolean;
  sender_name: string | null;
  sender_id: string | null;
  leads?: {
    name: string | null;
    phone: string | null;
    email: string | null;
    lead_status: string | null;
    lead_score: number | null;
    tags: string[] | null;
    created_at: string | null;
    first_message_at: string | null;
  } | null;
}

export default function ChatPage() {
  const [meta, setMeta] = useState<SharedConversationMeta | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const handleDataLoaded = useCallback((m: SharedConversationMeta | null, msgs: Message[]) => {
    setMeta(m);
    setMessages(msgs);
  }, []);

  return (
    <div
      className="-m-4 md:-m-6 lg:-m-8 h-[calc(100vh-64px)] lg:h-screen flex overflow-hidden"
      style={{
        background: '#F7F8FA',
        ['--chat-surface' as string]: '#EAEDF0',
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
