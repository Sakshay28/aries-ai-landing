"use client";

import {
  Send, Bot, User, Check, CheckCheck, ArrowDown, Paperclip, Smile,
  Mic, Sparkles, Search, MoreVertical, Copy, Reply, MoreHorizontal,
} from "lucide-react";
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
const HEADER_AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
];
function headerAvatarColor(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return HEADER_AVATAR_COLORS[h % HEADER_AVATAR_COLORS.length];
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (!payload.new || !('content' in payload.new)) return;
          setMessages(prev => {
            const exists = prev.some(m => m.id === (payload.new as Message).id);
            if (exists) return prev;
            return [...prev, payload.new as Message];
          });
          setTimeout(() => scrollToBottom(true), 50);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (!payload.new || !('id' in payload.new)) return;
          setMessages(prev =>
            prev.map(m => m.id === (payload.new as Message).id ? { ...m, status: (payload.new as Message).status } : m)
          );
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
      <div
        className="flex-1 flex flex-col items-center justify-center"
        style={{ background: 'var(--chat-surface, #EAEDF0)' }}
      >
        <div className="flex flex-col items-center gap-2.5 text-center px-8">
          <div className="w-12 h-12 rounded-2xl bg-white/80 dark:bg-white/5 flex items-center justify-center mb-1 shadow-sm">
            <Bot className="w-5 h-5 text-muted-foreground/60" />
          </div>
          <p className="text-[14px] font-medium text-foreground/70">Select a conversation</p>
        </div>
      </div>
    );
  }

  const chatBgStyle: React.CSSProperties = {
    background: 'var(--chat-surface, #EAEDF0)',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cg fill='%23000' fill-opacity='0.025'%3E%3Ccircle cx='20' cy='20' r='1.2'/%3E%3Ccircle cx='0' cy='0' r='1.2'/%3E%3Ccircle cx='40' cy='0' r='1.2'/%3E%3Ccircle cx='0' cy='40' r='1.2'/%3E%3Ccircle cx='40' cy='40' r='1.2'/%3E%3C/g%3E%3C/svg%3E\")",
    backgroundSize: '40px 40px',
  };

  const copyMessage = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success('Copied'),
      () => toast.error('Copy failed'),
    );
  };

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden" style={chatBgStyle}>

      {/* ── Header ── */}
      <div className="h-[60px] flex items-center justify-between px-5 bg-white dark:bg-[#1C2333] shadow-[0_1px_3px_rgba(0,0,0,0.06)] z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 ${headerAvatarColor(rawPhone || conversationId || 'x')}`}>
              {initial}
            </div>
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border-2 border-white dark:border-[#1C2333]" />
          </div>
          <div>
            <p className="text-[13.5px] font-semibold text-foreground leading-none">{displayName}</p>
            <p className="text-[11.5px] text-muted-foreground/70 mt-0.5">
              {conversationMeta?.bot_paused ? 'Human mode active' : 'AI responding'}
            </p>
          </div>
        </div>

        {/* Right side: actions + AI/Human toggle */}
        <div className="flex items-center gap-1">
          {/* Quick action icons */}
          {[
            { icon: Search, label: 'Search in chat' },
            { icon: Sparkles, label: 'AI assist' },
            { icon: MoreVertical, label: 'More' },
          ].map(({ icon: Icon, label }) => (
            <button
              key={label}
              title={label}
              onClick={() => toast(label, { description: 'Coming soon' })}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
            >
              <Icon className="w-4 h-4" />
            </button>
          ))}

          {/* Divider */}
          <div className="w-px h-5 bg-black/[0.06] dark:bg-white/[0.06] mx-1" />

          {/* AI / Human toggle */}
          <motion.button
            onClick={toggleHumanMode}
            disabled={togglingMode}
            whileTap={{ scale: 0.95 }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition-all duration-300 select-none',
              conversationMeta?.bot_paused
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800 shadow-[0_0_0_3px_rgba(96,165,250,0.08)]'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800 shadow-[0_0_0_3px_rgba(52,211,153,0.08)]',
              togglingMode && 'opacity-40 pointer-events-none'
            )}
          >
            <motion.div animate={{ rotate: togglingMode ? 360 : 0 }} transition={{ duration: 0.4 }}>
              {conversationMeta?.bot_paused ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
            </motion.div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={conversationMeta?.bot_paused ? 'human' : 'ai'}
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.12 }}
              >
                {conversationMeta?.bot_paused ? 'Human' : 'AI'}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* ── Message list ── */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
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
                <div key={`d-${i}`} className="flex items-center justify-center py-3 sticky top-0 z-10 pointer-events-none">
                  <span className="pointer-events-auto text-[10.5px] font-semibold text-foreground/60 bg-white/70 dark:bg-[#1C2333]/70 backdrop-blur-md px-3 py-1 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                    {item.label}
                  </span>
                </div>
              );
            }

            const { group } = item;
            const isInbound = group.direction === 'inbound';

            return (
              <div key={`g-${i}`} className={cn('flex flex-col gap-px mb-1', isInbound ? 'items-start' : 'items-end')}>
                {group.messages.map((msg, mi) => {
                  const isFirst = mi === 0;
                  const isLast = mi === group.messages.length - 1;
                  const hoverToolbar = (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-0.5 bg-white dark:bg-[#1F2B3E] rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] px-0.5 py-0.5 flex-shrink-0 self-center">
                      <button onClick={() => copyMessage(msg.content)} title="Copy" className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors">
                        <Copy className="w-3 h-3" />
                      </button>
                      <button onClick={() => toast('Reply', { description: 'Coming soon' })} title="Reply" className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors">
                        <Reply className="w-3 h-3" />
                      </button>
                      <button onClick={() => toast('More', { description: 'Coming soon' })} title="More" className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors">
                        <MoreHorizontal className="w-3 h-3" />
                      </button>
                    </div>
                  );

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 5, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className={cn('group w-full flex items-end gap-1', isInbound ? 'justify-start' : 'justify-end')}
                    >
                      {/* Outbound: toolbar floats to the LEFT of bubble */}
                      {!isInbound && hoverToolbar}

                      <div className={cn(
                        'max-w-[65%] px-3.5 py-2 text-[14px] leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.08)]',
                        isInbound
                          ? cn(
                              'bg-white dark:bg-[#1F2B3E] text-foreground',
                              isFirst ? 'rounded-2xl rounded-tl-sm' : 'rounded-2xl',
                              isLast && !isFirst ? 'rounded-bl-sm' : ''
                            )
                          : cn(
                              'bg-[#D9FDD3] dark:bg-[#054640] text-[#111B21] dark:text-[#E9EDEF]',
                              isFirst ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl',
                              isLast && !isFirst ? 'rounded-br-sm' : ''
                            )
                      )}>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                        {/* Timestamp + ticks on EVERY bubble */}
                        <div className={cn('flex items-center gap-1 mt-0.5', isInbound ? 'justify-start' : 'justify-end')}>
                          <span className={cn(
                            'text-[10.5px]',
                            isInbound ? 'text-black/30 dark:text-white/30' : 'text-black/40 dark:text-white/40'
                          )}>
                            {formatTime(msg.created_at)}
                          </span>
                          {!isInbound && (
                            msg.status === 'read'
                              ? <CheckCheck className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                              : msg.status === 'delivered'
                                ? <CheckCheck className="w-3.5 h-3.5 text-black/35 dark:text-white/35" />
                                : <Check className="w-3.5 h-3.5 text-black/35 dark:text-white/35" />
                          )}
                          {!isInbound && msg.ai_generated && (
                            <Bot className="w-2.5 h-2.5 text-black/25 dark:text-white/25 ml-0.5" />
                          )}
                        </div>
                      </div>

                      {/* Inbound: toolbar floats to the RIGHT of bubble */}
                      {isInbound && hoverToolbar}
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
            className="absolute bottom-24 right-5 w-8 h-8 rounded-full bg-white dark:bg-[#1C2333] shadow-md flex items-center justify-center z-20 hover:shadow-lg transition-shadow"
          >
            <ArrowDown className="w-3.5 h-3.5 text-foreground" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Composer ── */}
      <div className="flex-shrink-0 px-4 pb-4 pt-3">
        <div className="flex items-end gap-1 bg-white dark:bg-[#1C2333] rounded-2xl px-2 py-2 shadow-[0_2px_16px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04] dark:ring-white/[0.04]">
          <button
            onClick={() => toast('Attach', { description: 'Coming soon' })}
            title="Attach"
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex-shrink-0 mb-0.5"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            onClick={() => toast('AI assist', { description: 'Coming soon' })}
            title="AI assist"
            className="w-8 h-8 rounded-full flex items-center justify-center text-violet-500/70 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors flex-shrink-0 mb-0.5"
          >
            <Sparkles className="w-4 h-4" />
          </button>
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
            className="flex-1 bg-transparent border-0 resize-none outline-none text-[13.5px] text-foreground placeholder:text-muted-foreground/50 py-1.5 px-1 min-h-[36px] max-h-32"
          />
          <button
            onClick={() => toast('Emoji', { description: 'Coming soon' })}
            title="Emoji"
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex-shrink-0 mb-0.5"
          >
            <Smile className="w-4 h-4" />
          </button>

          {/* Mic OR Send (swaps based on input) */}
          <AnimatePresence mode="wait" initial={false}>
            {inputMsg.trim() ? (
              <motion.button
                key="send"
                initial={{ scale: 0.7, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.7, opacity: 0, rotate: 30 }}
                transition={{ duration: 0.15 }}
                whileTap={{ scale: 0.92 }}
                disabled={sending}
                onClick={handleSend}
                className="w-8 h-8 rounded-full bg-[#00A884] text-white hover:bg-[#009874] flex items-center justify-center flex-shrink-0 mb-0.5 transition-colors"
              >
                {sending
                  ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Send className="w-3.5 h-3.5" />
                }
              </motion.button>
            ) : (
              <motion.button
                key="mic"
                initial={{ scale: 0.7, opacity: 0, rotate: 30 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.7, opacity: 0, rotate: -30 }}
                transition={{ duration: 0.15 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => toast('Voice', { description: 'Coming soon' })}
                className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex-shrink-0 mb-0.5"
              >
                <Mic className="w-4 h-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
