"use client";

import { Send, X, Phone, Mail, Tag, Star, Calendar, Bot, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Message } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";

interface LeadInfo {
  name: string | null;
  phone: string | null;
  email: string | null;
  lead_status: string | null;
  lead_score: number | null;
  tags: string[] | null;
  created_at: string | null;
  first_message_at: string | null;
}

interface ConversationMeta {
  id: string;
  is_active: boolean;
  bot_paused: boolean;
  sender_name: string | null;
  sender_id: string | null;   // phone number of the WhatsApp sender
  leads?: LeadInfo | null;
}

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  // Strip leading 91 for Indian numbers
  const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  if (local.length === 10) return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  return `+${digits}`;
}

const STATUS_COLORS: Record<string, string> = {
  hot:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  warm: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  cold: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  new:  'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-400',
};

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
  const [infoOpen, setInfoOpen] = useState(false);
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

  const lead = conversationMeta?.leads;
  // sender_id is the raw phone stored on the conversation row itself — always available
  const rawPhone = lead?.phone || conversationMeta?.sender_id || conversationMeta?.sender_name || '';
  const displayName = lead?.name || formatPhone(rawPhone) || conversationId?.slice(0, 8) || 'Unknown';
  const initial = (lead?.name ?? rawPhone)?.charAt(0)?.toUpperCase() || '?';

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#EFEAE2] dark:bg-[#0B1120] font-sans">
        <p className="text-[15px] font-medium text-muted-foreground">Select a conversation to start messaging</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#EFEAE2] dark:bg-[#0B1120] font-sans relative z-10">
      
      {/* Header */}
      <div className="h-[72px] flex items-center justify-between px-6 bg-white dark:bg-[#1A1D21] border-b border-[#E5E7EB] dark:border-white/10 z-20">
        
        {/* Left: Identity — click to open info panel */}
        <button
          onClick={() => setInfoOpen(true)}
          className="flex items-center gap-4 hover:opacity-80 transition-opacity text-left"
        >
          <div className="w-10 h-10 rounded-full bg-[#F2FDF5] text-[#12B76A] flex items-center justify-center font-semibold text-[16px] ring-2 ring-[#12B76A]/20">
            {initial}
          </div>
          <div>
            <h2 className="text-[16px] font-semibold text-foreground tracking-tight leading-none mb-1">
              {displayName}
            </h2>
            <p className="text-[13px] font-medium text-muted-foreground tracking-tight flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              {formatPhone(rawPhone) || 'Tap for info'}
            </p>
          </div>
        </button>

        {/* Right: AI / Human toggle */}
        <motion.button
          onClick={toggleHumanMode}
          disabled={togglingMode}
          whileTap={{ scale: 0.96 }}
          className={cn(
            "relative flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold transition-all duration-300 border shadow-sm select-none",
            conversationMeta?.bot_paused
              ? "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300"
              : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
            togglingMode && "opacity-50 pointer-events-none"
          )}
        >
          <motion.div
            animate={{ rotate: togglingMode ? 360 : 0 }}
            transition={{ duration: 0.4, ease: "easeInOut" }}
          >
            {conversationMeta?.bot_paused
              ? <User className="w-4 h-4" />
              : <Bot className="w-4 h-4" />
            }
          </motion.div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={conversationMeta?.bot_paused ? 'human' : 'ai'}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
            >
              {conversationMeta?.bot_paused ? 'Human Mode' : 'AI Mode'}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Contact Info Slide-in Panel */}
      <AnimatePresence>
        {infoOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30"
              onClick={() => setInfoOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 right-0 h-full w-[320px] bg-white dark:bg-[#1A1D21] border-l border-[#E5E7EB] dark:border-white/10 z-40 shadow-2xl flex flex-col"
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] dark:border-white/10">
                <h3 className="text-[15px] font-semibold text-foreground">Contact Info</h3>
                <button onClick={() => setInfoOpen(false)} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {/* Avatar + Name */}
              <div className="flex flex-col items-center py-8 px-5 border-b border-[#E5E7EB] dark:border-white/10">
                <div className="w-20 h-20 rounded-full bg-[#F2FDF5] text-[#12B76A] flex items-center justify-center font-bold text-[32px] ring-4 ring-[#12B76A]/15 mb-4">
                  {initial}
                </div>
                <p className="text-[18px] font-semibold text-foreground tracking-tight">{lead?.name || formatPhone(rawPhone) || 'Unknown'}</p>
                <p className="text-[13px] text-muted-foreground mt-1">{formatPhone(rawPhone)}</p>
                {lead?.lead_status && (
                  <span className={cn('mt-2 px-3 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide', STATUS_COLORS[lead.lead_status] || STATUS_COLORS.new)}>
                    {lead.lead_status}
                  </span>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {lead?.email && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Email</p>
                      <p className="text-[14px] text-foreground">{lead.email}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Phone</p>
                    <p className="text-[14px] text-foreground">{formatPhone(rawPhone) || '—'}</p>
                  </div>
                </div>

                {typeof lead?.lead_score === 'number' && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Star className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Lead Score</p>
                      <p className="text-[14px] text-foreground">{lead.lead_score} / 100</p>
                    </div>
                  </div>
                )}

                {lead?.tags && lead.tags.length > 0 && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Tag className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {lead.tags.map(t => (
                          <span key={t} className="px-2 py-0.5 bg-muted rounded-full text-[12px] font-medium text-foreground">{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {lead?.first_message_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">First Contact</p>
                      <p className="text-[14px] text-foreground">{new Date(lead.first_message_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
