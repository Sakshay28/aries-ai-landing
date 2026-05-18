"use client";

import { Phone, Search, MoreVertical, Plus, Send } from "lucide-react";
import { motion } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Message } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

interface ConversationMeta {
  id: string;
  is_active: boolean;
  bot_paused: boolean;
  sender_name: string | null;
  leads?: { name: string | null; phone: string | null } | null;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatArea() {
  const [inputMsg, setInputMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversationMeta, setConversationMeta] = useState<ConversationMeta | null>(null);
  const [togglingMode, setTogglingMode] = useState(false);
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversationId");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createBrowserSupabaseClient());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    const supabase = supabaseRef.current;
    setLoadingMessages(true);
    setMessages([]);

    fetch(`/api/dashboard/chat/conversation?id=${conversationId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setConversationMeta(data.conversation as ConversationMeta);
          setMessages(data.messages as Message[]);
        }
        setLoadingMessages(false);
        setTimeout(scrollToBottom, 100);
      })
      .catch((err) => {
        setLoadingMessages(false);
      });

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (!payload.new || !('content' in payload.new)) return;
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === payload.new.id);
            if (exists) return prev;
            return [...prev, payload.new as Message];
          });
          setTimeout(scrollToBottom, 50);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, scrollToBottom]);

  const handleSend = async () => {
    if (!inputMsg.trim() || !conversationId || sending) return;
    const text = inputMsg.trim();
    setInputMsg("");
    setSending(true);

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });
      if (!res.ok) throw new Error("Failed to send");
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch {
      toast.error("Message failed to send.");
      setInputMsg(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMsg(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + "px";
    }
  };

  const toggleHumanMode = async () => {
    if (!conversationId || !conversationMeta) return;
    const newPaused = !conversationMeta.bot_paused;
    setTogglingMode(true);
    try {
      const res = await fetch(`/api/dashboard/chat/conversation?id=${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_paused: newPaused }),
      });
      const data = await res.json();
      if (data.success) {
        setConversationMeta(prev => prev ? { ...prev, bot_paused: newPaused } : null);
      }
    } finally {
      setTogglingMode(false);
    }
  };

  const displayName = conversationMeta?.leads?.name
    || conversationMeta?.leads?.phone
    || conversationMeta?.sender_name
    || conversationId?.slice(0, 8)
    || "Unknown";
    
  const initial = displayName.charAt(0).toUpperCase();

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#EFEAE2] dark:bg-[#0B1120] font-sans">
        <p className="text-[15px] font-medium text-muted-foreground">Select a conversation to start messaging</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#EFEAE2] dark:bg-[#0B1120] font-sans relative z-10">
      
      {/* Premium Header */}
      <div className="h-[72px] flex items-center justify-between px-6 bg-white dark:bg-[#1A1D21] border-b border-[#E5E7EB] dark:border-white/10 z-20">
        
        {/* Left: Identity */}
        <div className="flex items-center gap-4 cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-[#F2FDF5] text-[#12B76A] flex items-center justify-center font-semibold text-[16px]">
            {initial}
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-foreground tracking-tight leading-none mb-1">
              {displayName}
            </h2>
            <p className="text-[13px] font-medium text-muted-foreground tracking-tight">
              Active now
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          {/* Subtle Human/AI Toggle */}
          <div 
            onClick={toggleHumanMode}
            className={cn(
              "flex items-center gap-3 px-3 py-1.5 rounded-full cursor-pointer transition-all border",
              togglingMode ? "opacity-50 pointer-events-none" : "opacity-100",
              "bg-white dark:bg-[#22252A] border-[#E5E7EB] dark:border-white/10 shadow-sm"
            )}
          >
            <span className={cn("text-[12px] font-semibold transition-colors", !conversationMeta?.bot_paused ? "text-foreground" : "text-muted-foreground")}>AI</span>
            
            <div className="w-8 h-4 rounded-full bg-muted/50 border border-border relative flex items-center">
              <motion.div 
                layout
                className="w-3 h-3 rounded-full bg-foreground absolute"
                animate={{ left: conversationMeta?.bot_paused ? "16px" : "3px" }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </div>
            
            <span className={cn("text-[12px] font-semibold transition-colors", conversationMeta?.bot_paused ? "text-foreground" : "text-muted-foreground")}>Human</span>
          </div>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Minimal Icon Buttons */}
          <button className="text-muted-foreground hover:text-foreground transition-colors p-1"><Search className="w-[20px] h-[20px] stroke-[1.75]" /></button>
          <button className="text-muted-foreground hover:text-foreground transition-colors p-1"><Phone className="w-[20px] h-[20px] stroke-[1.75]" /></button>
          <button className="text-muted-foreground hover:text-foreground transition-colors p-1"><MoreVertical className="w-[20px] h-[20px] stroke-[1.75]" /></button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-[860px] mx-auto w-full space-y-4">
          
          {loadingMessages ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                  <Skeleton className={cn("h-12 rounded-[18px]", i % 2 === 0 ? "w-48" : "w-64")} />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex justify-center py-16">
              <p className="text-[14px] text-muted-foreground">No messages yet.</p>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                const isInbound = msg.direction === "inbound";
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex", isInbound ? "justify-start" : "justify-end")}
                  >
                    <div className={cn(
                      "max-w-[75%] px-5 py-3 rounded-[18px] shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
                      isInbound 
                        ? "bg-white dark:bg-[#1A1D21] text-foreground border border-[#E5E7EB] dark:border-white/5 rounded-tl-sm"
                        : "bg-[#F2FDF5] dark:bg-[#005C4B] text-[#111B21] dark:text-[#E9EDEF] border border-[#E4F4E8] dark:border-transparent rounded-tr-sm"
                    )}>
                      <p className="text-[15px] leading-relaxed font-normal">{msg.content}</p>
                      <div className="flex justify-end mt-1">
                        <span className="text-[11px] font-medium opacity-50">{formatTime(msg.created_at)}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}

          {/* Clean Quick Replies Demo (Visible at bottom of chat if AI suggests options) */}
          {/* <div className="flex flex-wrap gap-2 mt-4 justify-start">
            <button className="px-4 py-2 bg-[#f5f5f5] text-foreground rounded-full text-[14px] font-medium hover:bg-[#111] hover:text-white transition-colors">Reserve Table</button>
            <button className="px-4 py-2 bg-[#f5f5f5] text-foreground rounded-full text-[14px] font-medium hover:bg-[#111] hover:text-white transition-colors">Plan Event</button>
          </div> */}

        </div>
      </div>

      {/* Modern Input Bar */}
      <div className="pb-6 pt-2 px-6 bg-transparent">
        <div className="max-w-[860px] mx-auto w-full">
          <div className="flex items-end gap-3 bg-white dark:bg-[#1A1D21] border border-[#E5E7EB] dark:border-white/10 rounded-[20px] p-2 shadow-[0_2px_12px_rgba(0,0,0,0.04)] focus-within:shadow-[0_4px_20px_rgba(0,0,0,0.08)] transition-all">
            
            <button className="p-3 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
              <Plus className="w-[22px] h-[22px] stroke-[1.75]" />
            </button>

            <textarea
              ref={textareaRef}
              value={inputMsg}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 max-h-32 min-h-[44px] bg-transparent border-0 resize-none focus:ring-0 py-3 px-1 text-[15px] text-foreground placeholder:text-muted-foreground/60 outline-none font-normal"
              rows={1}
              disabled={sending}
            />

            <button
              disabled={!inputMsg.trim() || sending}
              onClick={handleSend}
              className={cn(
                "p-3 rounded-xl transition-all flex items-center justify-center flex-shrink-0 mb-[2px] mr-[2px]",
                inputMsg.trim() && !sending
                  ? "bg-foreground text-background hover:opacity-90"
                  : "bg-transparent text-muted-foreground"
              )}
            >
              {sending ? (
                <div className="w-[20px] h-[20px] border-2 border-background/40 border-t-background rounded-full animate-spin" />
              ) : (
                <Send className="w-[20px] h-[20px] ml-0.5 stroke-[1.75]" />
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
