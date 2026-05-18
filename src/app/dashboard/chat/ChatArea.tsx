"use client";

import {
  Phone, Video, Search, MoreVertical,
  Paperclip, Smile, Mic, Send, Sparkles, CheckCheck, Bot, User
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

  // Load conversation and messages securely via backend API
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
        } else {
          console.error("Failed to fetch conversation:", data.error);
        }
        setLoadingMessages(false);
        setTimeout(scrollToBottom, 100);
      })
      .catch((err) => {
        console.error("Error fetching chat:", err);
        setLoadingMessages(false);
      });

    // Realtime: subscribe to new messages for this conversation
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
          // Verify it's a message row (partitions might have dynamic names like messages_2026_05_17)
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
      setInputMsg("");
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch {
      toast.error("Message failed to send. Please try again.");
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

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMsg(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + "px";
    }
  };

  const displayName = conversationMeta?.leads?.name
    || conversationMeta?.leads?.phone
    || conversationMeta?.sender_name
    || conversationId?.slice(0, 8)
    || "Unknown";

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
        toast.success(newPaused ? '🙋 Human mode ON — AI is paused' : '🤖 AI is back in control');
      } else {
        toast.error('Failed to switch mode');
      }
    } catch {
      toast.error('Network error — try again');
    } finally {
      setTogglingMode(false);
    }
  };

  const initial = displayName.charAt(0).toUpperCase();
  const isActive = conversationMeta?.is_active;

  // Empty state — no conversation selected
  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#F0F2F5] dark:bg-[#0B141A] min-w-0">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4 mx-auto">
            <Sparkles className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-base font-medium text-foreground mb-1">Select a conversation</p>
          <p className="text-sm text-muted-foreground">Choose from your chats on the left to start messaging</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#F0F2F5] dark:bg-[#0B141A] relative shadow-[-10px_0_30px_rgba(0,0,0,0.02)] z-10">
      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.015] pointer-events-none"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}
      />

      {/* Header */}
      <div className="h-[60px] flex items-center justify-between px-6 bg-background/95 backdrop-blur-md border-b border-border/40 relative z-20 transition-colors">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          key={conversationId}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-emerald-500 text-white shadow-sm flex items-center justify-center font-medium text-[14px]">
              {initial}
            </div>
            {isActive && (
              <div className="absolute bottom-0 right-0 w-[10px] h-[10px] bg-emerald-500 border-2 border-background rounded-full" />
            )}
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-foreground tracking-tight leading-none mb-1">
              {displayName}
            </h2>
            <div className="flex items-center gap-1.5">
              <p className={cn("text-[12px] font-medium tracking-tight", isActive ? "text-emerald-500" : "text-muted-foreground")}>
                {isActive ? "Active" : "Inactive"}
              </p>
              <span className="text-muted-foreground/30 text-[10px]">•</span>
              {conversationMeta?.bot_paused ? (
                <span className="text-[12px] text-amber-500 tracking-tight flex items-center gap-1">
                  <User className="w-3 h-3" /> Human mode
                </span>
              ) : (
                <span className="text-[12px] text-cyan-500 tracking-tight flex items-center gap-1">
                  <Bot className="w-3 h-3" /> AI handling
                </span>
              )}
            </div>
          </div>
        </motion.div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {/* Human / AI Mode Toggle — most important button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={toggleHumanMode}
            disabled={togglingMode}
            className={cn(
              "flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-semibold transition-all mr-2 border",
              conversationMeta?.bot_paused
                ? "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20"
                : "bg-cyan-500/10 text-cyan-600 border-cyan-500/30 hover:bg-cyan-500/20"
            )}
          >
            {togglingMode ? (
              <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : conversationMeta?.bot_paused ? (
              <><Bot className="w-3.5 h-3.5" /> Hand to AI</>
            ) : (
              <><User className="w-3.5 h-3.5" /> Take Over</>
            )}
          </motion.button>

          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-full transition-colors hidden sm:flex">
            <Video className="w-[18px] h-[18px]" />
          </motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-full transition-colors hidden sm:flex">
            <Phone className="w-[18px] h-[18px]" />
          </motion.button>
          <div className="w-px h-4 bg-border/60 mx-2 hidden sm:block" />
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-full transition-colors">
            <Search className="w-[18px] h-[18px]" />
          </motion.button>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-full transition-colors">
            <MoreVertical className="w-[18px] h-[18px]" />
          </motion.button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 relative z-10">
        {loadingMessages ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                <Skeleton className={cn("h-12 rounded-2xl", i % 2 === 0 ? "w-48" : "w-64")} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center py-16">
            <p className="text-[13px] text-muted-foreground">No messages yet in this conversation.</p>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const isInbound = msg.direction === "inbound";
              const isAI = msg.ai_generated;
              const showDate =
                idx === 0 ||
                new Date(messages[idx - 1].created_at).toDateString() !==
                new Date(msg.created_at).toDateString();

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="flex justify-center mb-4 mt-2">
                      <span className="px-3 py-1 bg-background/80 backdrop-blur-md border border-border/30 rounded-lg text-[11px] font-medium uppercase tracking-widest text-muted-foreground shadow-sm">
                        {new Date(msg.created_at).toLocaleDateString("en-IN", {
                          weekday: "long", day: "numeric", month: "long",
                        })}
                      </span>
                    </div>
                  )}

                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className={cn("flex mb-2 group", isInbound ? "justify-start" : "justify-end")}
                  >
                    {isInbound ? (
                      /* Inbound (customer) */
                      <div className="bg-background border border-border/30 text-foreground px-4 py-2 rounded-2xl rounded-tl-sm shadow-sm max-w-[85%] sm:max-w-[75%]">
                        <p className="text-[14px] leading-relaxed tracking-tight">{msg.content}</p>
                        <div className="flex justify-end items-center gap-1 mt-0.5 -mb-0.5">
                          <span className="text-[10px] font-medium text-muted-foreground/60">{formatTime(msg.created_at)}</span>
                        </div>
                      </div>
                    ) : isAI ? (
                      /* Outbound AI */
                      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10 border border-emerald-500/10 dark:border-emerald-500/20 text-foreground px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-[0_2px_10px_rgba(0,0,0,0.03)] max-w-[85%] sm:max-w-[75%]">
                        <div className="flex items-center gap-1.5 mb-1.5 opacity-90">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
                          <span className="text-[11px] font-bold tracking-wide text-emerald-600 dark:text-emerald-500 uppercase">Aries AI</span>
                        </div>
                        <p className="text-[14px] leading-relaxed tracking-tight">{msg.content}</p>
                        <div className="flex justify-end items-center gap-1 mt-1 -mb-0.5">
                          <span className="text-[10px] font-medium text-emerald-600/50">{formatTime(msg.created_at)}</span>
                          <CheckCheck className={cn("w-3.5 h-3.5", msg.status === "read" ? "text-blue-500" : "text-muted-foreground/40")} />
                        </div>
                      </div>
                    ) : (
                      /* Outbound Human */
                      <div className="bg-[#D9FDD3] dark:bg-[#005C4B] text-[#111B21] dark:text-[#E9EDEF] px-4 py-2 rounded-2xl rounded-tr-sm shadow-sm max-w-[85%] sm:max-w-[75%] border border-transparent dark:border-white/5">
                        <p className="text-[14px] leading-relaxed tracking-tight">{msg.content}</p>
                        <div className="flex justify-end items-center gap-1 mt-0.5 -mb-0.5">
                          <span className="text-[10px] font-medium text-black/40 dark:text-white/40">{formatTime(msg.created_at)}</span>
                          <CheckCheck className={cn("w-3.5 h-3.5", msg.status === "read" ? "text-blue-500" : "text-black/30 dark:text-white/30")} />
                        </div>
                      </div>
                    )}
                  </motion.div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Bar */}
      <div className="p-3 bg-background/95 backdrop-blur-md border-t border-border/40 relative z-20">
        <div className="flex items-end gap-2 bg-muted/40 border border-border/40 rounded-2xl p-1.5 focus-within:ring-1 focus-within:ring-emerald-500/30 focus-within:bg-background transition-all duration-300 shadow-sm">
          <div className="flex items-center gap-1 pb-1 px-1">
            <motion.button onClick={() => toast("Emoji picker coming soon")} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-full transition-colors">
              <Smile className="w-[20px] h-[20px]" />
            </motion.button>
            <motion.button onClick={() => toast("Attachments coming soon")} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-full transition-colors">
              <Paperclip className="w-[20px] h-[20px]" />
            </motion.button>
          </div>

          <textarea
            ref={textareaRef}
            value={inputMsg}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message or use AI assist..."
            className="flex-1 max-h-32 min-h-[40px] bg-transparent border-0 resize-none focus:ring-0 py-2.5 px-2 text-[15px] text-foreground placeholder:text-muted-foreground/60 tracking-tight outline-none"
            rows={1}
            disabled={sending}
          />

          <div className="flex items-center gap-1 pb-1 px-1">
            <motion.button onClick={() => toast("AI Co-pilot coming soon")} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="p-2 text-emerald-500 hover:text-emerald-600 dark:hover:bg-emerald-500/10 rounded-full transition-colors" title="AI Assist">
              <Sparkles className="w-[20px] h-[20px]" />
            </motion.button>
            <AnimatePresence>
              {!inputMsg && (
                <motion.button
                  onClick={() => toast("Voice notes coming soon")}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-full transition-colors hidden sm:block"
                >
                  <Mic className="w-[20px] h-[20px]" />
                </motion.button>
              )}
            </AnimatePresence>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={!inputMsg.trim() || sending}
              onClick={handleSend}
              className={cn(
                "p-2 ml-1 rounded-full transition-colors shadow-sm flex items-center justify-center",
                inputMsg.trim() && !sending
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {sending ? (
                <div className="w-[18px] h-[18px] border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-[18px] h-[18px] ml-0.5" />
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
