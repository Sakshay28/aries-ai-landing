"use client";

import { Send, Bot, User, Check, CheckCheck, ArrowDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Message } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import type { SharedConversationMeta } from "./page";

// ── helpers ────────────────────────────────────────────────────────────
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

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function dateSeparatorLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface MessageGroup {
  direction: 'inbound' | 'outbound';
  messages: Message[];
}

type FeedItem = { type: 'date'; label: string } | { type: 'group'; group: MessageGroup };

function buildFeed(messages: Message[]): FeedItem[] {
  const feed: FeedItem[] = [];
  let lastDay = '';
  let currentGroup: MessageGroup | null = null;

  const pushGroup = () => { if (currentGroup) feed.push({ type: 'group', group: currentGroup }); };

  for (const msg of messages) {
    const msgDay = new Date(msg.created_at).toDateString();
    if (msgDay !== lastDay) {
      pushGroup(); currentGroup = null;
      feed.push({ type: 'date', label: dateSeparatorLabel(msg.created_at) });
      lastDay = msgDay;
    }
    const timeDiff = currentGroup?.messages.length
      ? new Date(msg.created_at).getTime() - new Date(currentGroup.messages.at(-1)!.created_at).getTime()
      : Infinity;
    if (!currentGroup || currentGroup.direction !== msg.direction || timeDiff > 120_000) {
      pushGroup();
      currentGroup = { direction: msg.direction, messages: [msg] };
    } else {
      currentGroup.messages.push(msg);
    }
  }
  pushGroup();
  return feed;
}

// ── props ────────────────────────────────────────────────────────────
interface ChatAreaProps {
  onDataLoaded?: (meta: SharedConversationMeta | null, messages: Message[]) => void;
}

// ── component ───────────────────────────────────────────────────────
export default function ChatArea({ onDataLoaded }: ChatAreaProps) {
  const [inputMsg, setInputMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [conversationMeta, setConversationMeta] = useState<SharedConversationMeta | null>(null);
  const [togglingMode, setTogglingMode] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createBrowserSupabaseClient());
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }, []);

  useEffect(() => {
    if (!conversationId) { setConversationMeta(null); setMessages([]); onDataLoaded?.(null, []); return; }
    const supabase = supabaseRef.current;
    setLoadingMessages(true);
    setMessages([]);

    fetch(`/api/dashboard/chat/conversation?id=${conversationId}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const meta = data.conversation as SharedConversationMeta;
          const msgs = data.messages as Message[];
          setConversationMeta(meta);
          setMessages(msgs);
          onDataLoaded?.(meta, msgs);
        }
        setLoadingMessages(false);
        setTimeout(() => scrollToBottom(false), 80);
      })
      .catch(() => setLoadingMessages(false));

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (!payload.new || !('content' in payload.new)) return;
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            const updated = [...prev, payload.new as Message];
            onDataLoaded?.(conversationMeta, updated);
            return updated;
          });
          setTimeout(() => scrollToBottom(true), 50);
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handleSend = async () => {
    if (!inputMsg.trim() || !conversationId || sending) return;
    const text = inputMsg.trim();
    setInputMsg('');
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: text }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Message failed to send.');
      setInputMsg(text);
    } finally { setSending(false); }
  };

  const toggleHumanMode = async () => {
    if (!conversationId || !conversationMeta || togglingMode) return;
    const newPaused = !conversationMeta.bot_paused;
    setTogglingMode(true);
    try {
      const res = await fetch(`/api/dashboard/chat/conversation?id=${conversationId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_paused: newPaused }),
      });
      if ((await res.json()).success) {
        const updated = { ...conversationMeta, bot_paused: newPaused };
        setConversationMeta(updated);
        onDataLoaded?.(updated, messages);
      }
    } finally { setTogglingMode(false); }
  };

  const lead = conversationMeta?.leads;
  const rawPhone = lead?.phone || conversationMeta?.sender_id || conversationMeta?.sender_name || '';
  const displayName = lead?.name || formatPhone(rawPhone) || conversationId?.slice(0, 8) || 'Unknown';
  const initial = (lead?.name ?? rawPhone)?.charAt(0)?.toUpperCase() || '?';
  const feed = buildFeed(messages);

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20">
        <div className="flex flex-col items-center gap-3 text-center px-8">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-2">
            <Bot className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-[15px] font-semibold text-foreground">No conversation selected</p>
          <p className="text-[13px] text-muted-foreground">Pick a conversation from the left to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-muted/10 relative overflow-hidden">

      {/* ── Header ── */}
      <div className="h-16 flex items-center justify-between px-5 bg-background border-b border-border z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
            <img
              src={avatarUrl(rawPhone || conversationId || 'x')}
              alt="avatar"
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="text-[13px] font-semibold text-muted-foreground" aria-hidden>{initial}</span>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-foreground leading-none">{displayName}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              {conversationMeta?.bot_paused ? 'Human mode active' : 'AI responding'}
            </p>
          </div>
        </div>

        {/* AI / Human toggle */}
        <motion.button
          onClick={toggleHumanMode}
          disabled={togglingMode}
          whileTap={{ scale: 0.95 }}
          className={cn(
            'flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[12px] font-semibold transition-all duration-300 border select-none',
            conversationMeta?.bot_paused
              ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
            togglingMode && 'opacity-40 pointer-events-none'
          )}
        >
          <motion.div animate={{ rotate: togglingMode ? 360 : 0 }} transition={{ duration: 0.4 }}>
            {conversationMeta?.bot_paused ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
          </motion.div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={conversationMeta?.bot_paused ? 'human' : 'ai'}
              initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.12 }}
            >
              {conversationMeta?.bot_paused ? 'Human Mode' : 'AI Mode'}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ── Message list ── */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-5 space-y-1"
      >
        {loadingMessages ? (
          <div className="space-y-3 pt-2">
            {['w-48', 'w-64', 'w-40', 'w-72', 'w-56'].map((w, i) => (
              <div key={i} className={cn('flex', i % 2 ? 'justify-end' : 'justify-start')}>
                <Skeleton className={cn('h-11 rounded-2xl', w)} />
              </div>
            ))}
          </div>
        ) : feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-20">
            <p className="text-[13px] text-muted-foreground">No messages yet. Start the conversation.</p>
          </div>
        ) : (
          feed.map((item, i) => {
            if (item.type === 'date') {
              return (
                <div key={`d-${i}`} className="flex items-center justify-center py-3">
                  <span className="text-[11px] font-semibold text-muted-foreground bg-background/70 backdrop-blur-sm px-3 py-1 rounded-full border border-border/50">
                    {item.label}
                  </span>
                </div>
              );
            }

            const { group } = item;
            const isInbound = group.direction === 'inbound';

            return (
              <div key={`g-${i}`} className={cn('flex flex-col gap-0.5', isInbound ? 'items-start' : 'items-end')}>
                {group.messages.map((msg, mi) => {
                  const isLast = mi === group.messages.length - 1;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className={cn('max-w-[72%] flex', isInbound ? 'justify-start' : 'justify-end')}
                    >
                      <div className={cn(
                        'px-4 py-2.5 text-[14px] leading-relaxed',
                        isInbound
                          ? 'bg-background text-foreground border border-border/60 rounded-2xl rounded-tl-md'
                          : cn(
                            'text-white rounded-2xl rounded-tr-md',
                            msg.ai_generated
                              ? 'bg-emerald-600 dark:bg-emerald-700'
                              : 'bg-foreground dark:bg-white dark:text-black'
                          )
                      )}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        {isLast && (
                          <div className={cn('flex items-center gap-1 mt-1', isInbound ? 'justify-start' : 'justify-end')}>
                            <span className={cn('text-[10px]', isInbound ? 'text-muted-foreground' : 'text-white/60')}>
                              {formatTime(msg.created_at)}
                            </span>
                            {!isInbound && (
                              msg.status === 'read'
                                ? <CheckCheck className="w-3 h-3 text-sky-300" />
                                : msg.status === 'delivered'
                                  ? <CheckCheck className="w-3 h-3 text-white/60" />
                                  : <Check className="w-3 h-3 text-white/60" />
                            )}
                            {!isInbound && msg.ai_generated && (
                              <Bot className="w-3 h-3 text-white/50 ml-0.5" />
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Scroll to bottom FAB ── */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-24 right-6 w-9 h-9 rounded-full bg-background border border-border shadow-lg flex items-center justify-center z-20 hover:bg-muted transition-colors"
          >
            <ArrowDown className="w-4 h-4 text-foreground" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Composer ── */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2 bg-background border-t border-border">
        <div className="flex items-end gap-2 bg-muted/40 rounded-2xl px-4 py-2 focus-within:bg-muted/60 transition-colors">
          <textarea
            ref={textareaRef}
            value={inputMsg}
            onChange={e => {
              setInputMsg(e.target.value);
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + 'px';
              }
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type a message…"
            rows={1}
            disabled={sending}
            className="flex-1 bg-transparent border-0 resize-none outline-none text-[14px] text-foreground placeholder:text-muted-foreground py-1.5 min-h-[36px] max-h-32"
          />
          <button
            disabled={!inputMsg.trim() || sending}
            onClick={handleSend}
            className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mb-0.5 transition-all',
              inputMsg.trim() && !sending
                ? 'bg-foreground text-background hover:opacity-90'
                : 'bg-transparent text-muted-foreground/40'
            )}
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
