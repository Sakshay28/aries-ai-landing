"use client";

import {
  Send, Bot, User, Check, CheckCheck, Clock, AlertCircle, ArrowDown, Paperclip, Smile,
  Sparkles, Search, MoreVertical, Copy, Reply, MoreHorizontal, X, Loader2, Trash2, HelpCircle,
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
import AIAssistPanel from "./AIAssistPanel";
import AttachmentBubble, { PendingAttachment } from "./AttachmentBubble";

// ── helpers ────────────────────────────────────────────────────────────
// Consistent with ChatSidebar: same palette, same seed strategy
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
  'linear-gradient(135deg, #14b8a6 0%, #0ea5e9 100%)',
];

function avatarGradient(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  if (local.length === 10) return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  return `+${digits}`;
}

// Fix: format time always in IST (Asia/Kolkata) to avoid UTC/local confusion
function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

function dateSeparatorLabel(dateStr: string): string {
  // Compare in IST date
  const toISTDate = (d: Date) =>
    new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const d = toISTDate(new Date(dateStr));
  const today = toISTDate(new Date());
  const yesterday = toISTDate(new Date(Date.now() - 86_400_000));
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
    const msgDay = new Date(msg.created_at).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replyToMsg, setReplyToMsg] = useState<Message | null>(null);
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabaseRef = useRef(createBrowserSupabaseClient());
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const optimisticIdRef = useRef(0);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  // Common emojis for the picker
  const [emojiCategory, setEmojiCategory] = useState(0);
  const EMOJI_CATEGORIES = [
    { label: '😊', name: 'Smileys', emojis: ['😊','😂','🤣','😍','😘','😅','😆','😁','🙂','😉','😋','😎','🤩','🥰','😇','🤗','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤔','🤭','🤫','🤥','😶','😐','😑','🙄','😬','🤐','🤢','🤮','🤧','😷','🤒','🤕'] },
    { label: '👋', name: 'Gestures', emojis: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🙏','🤝','💪','🦾','🫁','🦵','🦶','👀','👁️','👅','👂','🫂'] },
    { label: '❤️', name: 'Love', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','♥️','💌','💋','💑','👫','👬','👭','💏','👨‍❤️‍👨','👩‍❤️‍👩','🌹','🌷','🌸','💐'] },
    { label: '🎉', name: 'Celebrate', emojis: ['🎉','🎊','🎈','🎁','🥳','🎂','🎀','🎗️','🎟️','🎫','🏆','🥇','🥈','🥉','🏅','🎖️','🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎵','🎶','🎯','🎮','🕹️','✨','💫','⭐','🌟','💥','🔥','🎆','🎇','🧨','🪅','🪩','🥂','🍾','🍰'] },
    { label: '💼', name: 'Business', emojis: ['💼','📊','📈','📉','📋','📌','📍','📎','🖇️','📏','📐','✂️','🗂️','🗃️','🗄️','🗑️','💰','💳','💵','💴','💶','💷','🏦','💹','📄','📃','📑','📜','📝','✏️','🖊️','🖋️','📅','📆','🗓️','📇','📓','📔','📒','📕','📗','📘','📙','📚','🔖','🏷️','📧','📨','📩','📤','📥','💬','📞','☎️','📟','📠','📲','💻','🖥️','🖨️'] },
    { label: '⏰', name: 'Objects', emojis: ['⏰','⌚','⏱️','⏲️','🕰️','📱','💡','🔦','🕯️','🪔','🔋','🪫','💿','📀','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📺','📻','🎙️','🔎','🔬','🔭','📡','🚨','🔐','🔑','🗝️','🔒','🔓','🚪','🪞','🪟','💊','💉','🩺','🩹','🏥','🚑','⚗️','🔧','🔨','⚒️','🛠️','⛏️','🪛','🔩','🪤','💣','🔗','📿','🧲','🪜','🪣','🧹','🧺'] },
    { label: '🚀', name: 'Travel', emojis: ['🚀','✈️','🛸','🚁','⛵','🚢','🛳️','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖','🚗','🚘','🚙','🛻','🚚','🚛','🚜','🏎️','🏍️','🛵','🚲','🛴','🛹','🛼','🚏','🛣️','🗺️','🏔️','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️','🏗️','🏘️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🌍','🌎','🌏','🌐'] },
    { label: '🍕', name: 'Food', emojis: ['🍕','🍔','🍟','🌭','🍿','🧂','🥓','🥚','🍳','🧇','🥞','🧈','🍞','🥐','🥨','🥯','🧀','🥗','🥙','🥪','🌮','🌯','🫔','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍢','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🧋','☕','🍵','🧉','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧊'] },
  ];

  const handleAIInsert = useCallback((text: string) => {
    setInputMsg(text);
    // Resize textarea
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 128) + 'px';
        el.focus();
      }
    }, 30);
  }, []);

  const handleEmojiInsert = (emoji: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? inputMsg.length;
      const end = el.selectionEnd ?? inputMsg.length;
      const next = inputMsg.slice(0, start) + emoji + inputMsg.slice(end);
      setInputMsg(next);
      setTimeout(() => { el.focus(); el.setSelectionRange(start + emoji.length, start + emoji.length); }, 10);
    } else {
      setInputMsg(prev => prev + emoji);
    }
    setEmojiOpen(false);
  };




  // ── File attach: store as pending (DO NOT convert to text) ───────────────
  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
    if (file.size > MAX_SIZE) {
      toast.error('File too large', { description: 'Maximum file size is 50 MB.' });
      e.target.value = '';
      return;
    }

    console.log('[attachment] File selected:', file.name, file.type, file.size);
    setPendingFile(file);
    e.target.value = '';
  };

  // ── Send attachment: real upload pipeline ─────────────────────────────────
  const handleSendAttachment = useCallback(async () => {
    if (!pendingFile || !conversationId || uploading) return;

    const file = pendingFile;
    setPendingFile(null);
    setUploading(true);

    // Optimistic message bubble
    const optimisticId = `__optimistic__${++optimisticIdRef.current}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      conversation_id: conversationId,
      tenant_id: '',
      content: file.name,
      direction: 'outbound',
      message_type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'document',
      channel: 'whatsapp',
      sender_id: null,
      wa_message_id: null,
      status: 'pending',
      error_message: null,
      ai_generated: false,
      ai_latency_ms: null,
      created_at: new Date().toISOString(),
      media_url: URL.createObjectURL(file), // local preview while uploading
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      media_caption: inputMsg.trim() || null,
      reply_to_message_id: replyToMsg?.id || null,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 30);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversationId', conversationId);
      if (inputMsg.trim()) formData.append('caption', inputMsg.trim());
      if (replyToMsg) formData.append('replyToMessageId', replyToMsg.id);

      console.log('[attachment] Uploading:', file.name, file.type, file.size);

      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      console.log('[attachment] Upload response:', data);

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      // Replace optimistic with real message
      const realMsg: Message = data.message;
      setMessages(prev => {
        const withoutOpt = prev.filter(m => m.id !== optimisticId);
        const exists = withoutOpt.some(m => m.id === realMsg.id);
        if (exists) return withoutOpt;
        return [...withoutOpt, realMsg];
      });

      // Clear caption and reply state after successful send
      setInputMsg('');
      setReplyToMsg(null);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';

      console.log('[attachment] ✅ Sent successfully:', realMsg.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      console.error('[attachment] ❌ Upload error:', err);
      toast.error('Attachment failed', { description: msg });
      setMessages(prev => prev.map(m =>
        m.id === optimisticId ? { ...m, status: 'failed' as Message['status'] } : m
      ));
    } finally {
      setUploading(false);
    }
  }, [pendingFile, conversationId, uploading, inputMsg, replyToMsg, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }, []);

  // Open search panel
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 60);
  }, [searchOpen]);

  // ── Effect 1: Load initial messages from API ─────────────────────────────
  useEffect(() => {
    if (!conversationId) { setConversationMeta(null); setMessages([]); onDataLoaded?.(null, []); return; }
    setLoadingMessages(true);
    setMessages([]);
    setSearchOpen(false);
    setSearchQuery('');

    fetch(`/api/dashboard/chat/conversation?id=${conversationId}&_t=${Date.now()}`)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // ── Effect 2: Supabase Realtime — live INSERT + UPDATE ────────────────────
  // Server-side filter on conversation_id (REPLICA IDENTITY FULL is enabled).
  // JS-side filter kept as extra safety check.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`realtime-messages-${conversationId}-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (!payload.new || !('id' in payload.new)) return;
          const incoming = payload.new as Message;
          // JS-side filter: only care about this conversation
          if (incoming.conversation_id !== conversationId) return;
          setMessages(prev => {
            // Remove any optimistic placeholder that matches this content + direction
            const withoutOptimistic = prev.filter(m =>
              !(m.id.startsWith('__optimistic__') && m.content === incoming.content && m.direction === incoming.direction)
            );
            const exists = withoutOptimistic.some(m => m.id === incoming.id);
            if (exists) return withoutOptimistic;
            return [...withoutOptimistic, incoming];
          });
          setTimeout(() => scrollToBottom(true), 50);
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (!payload.new || !('id' in payload.new)) return;
          const updatedMsg = payload.new as Message;
          setMessages(prev => {
            const exists = prev.some(m => m.id === updatedMsg.id);
            if (!exists) return prev;
            return prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m);
          });
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          if (!payload.old || !('id' in payload.old)) return;
          const deletedId = payload.old.id;
          setMessages(prev => prev.filter(m => m.id !== deletedId));
        })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] ✅ Subscribed to messages for conversation:', conversationId);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] ❌ Channel error/timeout for conversation:', conversationId, status);
        }
      });

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Status polling: every 3s, always run — picks up delivered/read from Meta webhook DB updates
  useEffect(() => {
    if (!conversationId) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/dashboard/chat/statuses?conversationId=${conversationId}`);
        const data = await res.json();
        if (!data.success) return;
        const map: Record<string, string> = {};
        for (const s of data.statuses as { id: string; status: string }[]) map[s.id] = s.status;
        // Apply status updates to all messages that have a DB id (not optimistic)
        setMessages(prev => prev.map(m => {
          if (m.id.startsWith('__optimistic__')) return m;
          return map[m.id] ? { ...m, status: map[m.id] as Message['status'] } : m;
        }));
      } catch { /* ignore */ }
    };
    // Poll immediately on mount, then every 3s
    poll();
    const interval = setInterval(poll, 3_000);
    return () => clearInterval(interval);
  }, [conversationId]);

  // Track latest message timestamp via ref (avoids stale closure in poll)
  const lastMsgTsRef = useRef('');
  useEffect(() => {
    const realMsgs = messages.filter(m => !m.id.startsWith('__optimistic__'));
    if (realMsgs.length > 0) {
      const latest = realMsgs.reduce((a, b) => (a.created_at > b.created_at ? a : b));
      lastMsgTsRef.current = latest.created_at;
    }
  }, [messages]);

  // ── Effect 3: Fast polling — guaranteed real-time message delivery ─────────
  // Polls every 2s for messages newer than the last known one.
  // Works even if Supabase Realtime is not configured/enabled.
  // Pauses when tab is hidden (saves bandwidth). Deduplicates in-flight requests.
  useEffect(() => {
    if (!conversationId) return;
    let inFlight = false;

    const poll = async () => {
      // Skip if tab is hidden or a request is already in progress
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const params = new URLSearchParams({ conversationId });
        if (lastMsgTsRef.current) params.set('after', lastMsgTsRef.current);

        const res = await fetch(`/api/dashboard/chat/new-messages?${params}`);
        const data = await res.json();
        if (!data.success || !data.messages?.length) return;

        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const incoming = (data.messages as Message[]).filter(m => !existingIds.has(m.id));
          if (incoming.length === 0) return prev;

          // Remove optimistic placeholders that match incoming real messages
          const cleaned = prev.filter(m => {
            if (!m.id.startsWith('__optimistic__')) return true;
            return !incoming.some(n => n.content === m.content && n.direction === m.direction);
          });

          return [...cleaned, ...incoming];
        });
        setTimeout(() => scrollToBottom(true), 50);
      } catch { /* ignore polling errors */ }
      finally { inFlight = false; }
    };

    // Poll immediately on focus/visibility change for instant catch-up
    const onVisible = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVisible);

    const interval = setInterval(poll, 2_000);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, scrollToBottom]);

  // Modified handleSend: also handles attachment send
  const handleSend = async () => {
    // If there's a pending file, send it as attachment
    if (pendingFile) {
      await handleSendAttachment();
      return;
    }
    if (!inputMsg.trim() || !conversationId || sending) return;
    const text = inputMsg.trim();
    setInputMsg('');
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Add optimistic bubble immediately (shows clock icon while API processes)
    const optimisticId = `__optimistic__${++optimisticIdRef.current}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      conversation_id: conversationId,
      content: text,
      direction: 'outbound',
      status: 'pending',
      created_at: new Date().toISOString(),
      ai_generated: false,
      reply_to_message_id: replyToMsg?.id || null,
    } as unknown as Message;
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom(true), 30);

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: text, replyToMessageId: replyToMsg?.id }),
      });
      const apiData = await res.json();
      if (!res.ok || !apiData.success) throw new Error(apiData.error || 'Failed');

      // Replace optimistic bubble with the real saved message from DB
      // This gives us the real UUID, correct timestamp, and 'sent' status (✓)
      const realMsg: Message | null = apiData.message;
      setMessages(prev => {
        const withoutOptimistic = prev.filter(m => m.id !== optimisticId);
        if (!realMsg) {
          // Fallback: just mark optimistic as sent
          return prev.map(m => m.id === optimisticId ? { ...m, status: 'sent' as Message['status'] } : m);
        }
        const exists = withoutOptimistic.some(m => m.id === realMsg.id);
        if (exists) return withoutOptimistic;
        return [...withoutOptimistic, realMsg];
      });
      
      // Clear reply state after successful send
      setReplyToMsg(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Message failed to send.';
      toast.error(msg);
      setMessages(prev => prev.map(m =>
        m.id === optimisticId ? { ...m, status: 'failed' as Message['status'] } : m
      ));
      setInputMsg(text);
    } finally { setSending(false); }
  };

  const handleResend = async (msg: Message) => {
    if (!conversationId) return;
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, message: msg.content }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      toast.error('Resend failed.');
      setMessages(prev => [...prev, { ...msg, status: 'failed' as Message['status'] }]);
    }
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
  // Consistent avatar seed with sidebar (phone → fallback to conversationId)
  const avatarSeed = rawPhone || conversationId || 'x';
  // Consistent initial: prefer first letter of name, else last digit of phone number (same as sidebar getInitial)
  const initial = lead?.name
    ? lead.name.charAt(0).toUpperCase()
    : rawPhone
      ? (() => { const d = rawPhone.replace(/\D/g, ''); const loc = d.startsWith('91') && d.length === 12 ? d.slice(2) : d; return loc.charAt(0) || '?'; })()
      : '?';

  // Search-filtered messages
  const filteredFeed = buildFeed(
    searchQuery.trim()
      ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
      : messages
  );

  const copyMessage = (msgId: string, text: string) => {
    // If it is an image URL, try to copy it as an actual image blob
    if (text.startsWith('http') && (text.includes('.png') || text.includes('.jpg') || text.includes('.jpeg') || text.includes('.webp'))) {
      const toastId = toast.loading('Copying image...');
      fetch(text)
        .then(res => {
          if (!res.ok) throw new Error('Fetch failed');
          return res.blob();
        })
        .then(blob => {
          // ClipboardItem only reliably supports png/webp or standard mime types.
          // Convert or copy the link directly as fallback
          const mimeType = blob.type.startsWith('image/') ? blob.type : 'image/png';
          navigator.clipboard?.write([
            new ClipboardItem({ [mimeType]: blob })
          ]).then(
            () => {
              setCopiedMessageId(msgId);
              toast.success('Image copied directly to clipboard!', { id: toastId });
              setTimeout(() => setCopiedMessageId(null), 2000);
            },
            (err) => {
              console.error('Failed to copy image blob:', err);
              // Fallback to copying URL
              navigator.clipboard?.writeText(text).then(() => {
                setCopiedMessageId(msgId);
                toast.success('Image link copied to clipboard', { id: toastId });
                setTimeout(() => setCopiedMessageId(null), 2000);
              });
            }
          );
        })
        .catch(err => {
          console.error('Failed to fetch image blob:', err);
          // Fallback to copying URL
          navigator.clipboard?.writeText(text).then(() => {
            setCopiedMessageId(msgId);
            toast.success('Image link copied to clipboard', { id: toastId });
            setTimeout(() => setCopiedMessageId(null), 2000);
          });
        });
      return;
    }

    navigator.clipboard?.writeText(text).then(
      () => {
        setCopiedMessageId(msgId);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopiedMessageId(null), 2000);
      },
      () => toast.error('Copy failed'),
    );
  };

  const handleEmojiReaction = async (msgId: string, emoji: string | null) => {
    try {
      const supabase = supabaseRef.current;
      const { error } = await supabase.from('messages').update({ reaction: emoji }).eq('id', msgId);
      if (error) throw error;

      // Optimistically update locally
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reaction: emoji } : m));
      toast.success(emoji ? 'Reaction updated' : 'Reaction removed');
    } catch (err) {
      console.error('Failed to react:', err);
      toast.error('Failed to update reaction');
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      const supabase = supabaseRef.current;
      const { error } = await supabase.from('messages').delete().eq('id', msgId);
      if (error) throw error;

      // Optimistically delete locally
      setMessages(prev => prev.filter(m => m.id !== msgId));
      toast.success('Message deleted');
    } catch (err) {
      console.error('Failed to delete:', err);
      toast.error('Failed to delete message');
    }
  };

  const handleSaveToFAQ = async (msg: Message) => {
    try {
      // Find the previous inbound message as the question
      const index = messages.findIndex(m => m.id === msg.id);
      let question = '';
      let answer = '';

      if (msg.direction === 'inbound') {
        question = msg.content;
        answer = 'Placeholder Answer (Please update in settings)';
      } else {
        // Find the last inbound message before this one
        const prevInbound = messages.slice(0, index).reverse().find(m => m.direction === 'inbound');
        question = prevInbound ? prevInbound.content : 'Placeholder Question (Please update in settings)';
        answer = msg.content;
      }

      // Fetch the settings first
      const getRes = await fetch('/api/dashboard/settings');
      const getData = await getRes.json();
      if (!getRes.ok || !getData.success) throw new Error('Failed to fetch settings');

      const existingFaqs = getData.data.custom_faqs || [];
      const updatedFaqs = [...existingFaqs, { question, answer }];

      // PATCH the updated custom_faqs
      const patchRes = await fetch('/api/dashboard/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_faqs: updatedFaqs }),
      });
      const patchData = await patchRes.json();
      if (!patchRes.ok || !patchData.success) throw new Error(patchData.error || 'Failed to update settings');

      toast.success('Saved to FAQs!', { description: 'You can customize it in the Settings tab.' });
    } catch (err) {
      console.error('Failed to save FAQ:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save FAQ');
    }
  };

  const chatBgStyle: React.CSSProperties = {
    background: 'var(--background)',
    backgroundImage:
      'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.04), transparent 50%), ' +
      'radial-gradient(circle at 0% 100%, rgba(139, 92, 246, 0.04), transparent 50%), ' +
      'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'40\' height=\'40\' viewBox=\'0 0 40 40\'%3E%3Cg fill=\'%23888\' fill-opacity=\'0.015\'%3E%3Ccircle cx=\'20\' cy=\'20\' r=\'1.2\'/%3E%3Ccircle cx=\'0\' cy=\'0\' r=\'1.2\'/%3E%3Ccircle cx=\'40\' cy=\'0\' r=\'1.2\'/%3E%3Ccircle cx=\'0\' cy=\'40\' r=\'1.2\'/%3E%3Ccircle cx=\'40\' cy=\'40\' r=\'1.2\'/%3E%3C/g%3E%3C/svg%3E")',
    backgroundSize: '40px 40px, 40px 40px',
  };

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

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden" style={chatBgStyle}>

      {/* ── Header ── */}
      <div className="h-[60px] flex items-center justify-between px-5 bg-white dark:bg-[#1C2333] shadow-[0_1px_3px_rgba(0,0,0,0.06)] z-20 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
                style={{ background: avatarGradient(avatarSeed) }}
                className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0 shadow-sm"
              >
                {initial}
              </div>
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border-2 border-white dark:border-[#1C2333]" />
          </div>
          <div>
            {conversationMeta ? (
              <>
                <p className="text-[13.5px] font-semibold text-foreground leading-none">{displayName}</p>
                <p className="text-[11.5px] text-muted-foreground/70 mt-0.5">
                  {conversationMeta.bot_paused ? 'Human mode active' : 'AI responding'}
                </p>
              </>
            ) : (
              <>
                <div className="h-3.5 w-28 rounded bg-muted animate-pulse mb-1.5" />
                <div className="h-2.5 w-20 rounded bg-muted/60 animate-pulse" />
              </>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1">
          {/* Search toggle */}
          <button
            title="Search in chat"
            onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQuery(''); }}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
              searchOpen
                ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
            )}
          >
            <Search className="w-4 h-4" />
          </button>


          {/* More options */}
          <div className="relative">
            <button
              title="More options"
              onClick={() => setMoreMenuOpen(v => !v)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {moreMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-10 z-50 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[160px]"
                >
                  {[
                    { label: '✅ Mark resolved', action: () => { toggleHumanMode(); setMoreMenuOpen(false); } },
                    { label: '📋 Copy chat link', action: () => { navigator.clipboard.writeText(window.location.href); toast.success('Chat link copied!'); setMoreMenuOpen(false); } },
                    { label: '🔇 Mute notifications', action: () => { toast.success('Conversation muted for 24h'); setMoreMenuOpen(false); } },
                  ].map(item => (
                    <button key={item.label} onClick={item.action}
                      className="w-full text-left px-4 py-2 text-[12.5px] hover:bg-muted transition-colors"
                    >{item.label}</button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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

      {/* ── Inline Search Bar ── */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 44, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 overflow-hidden bg-white/90 dark:bg-[#1C2333]/90 backdrop-blur-md border-b border-border z-10"
          >
            <div className="flex items-center gap-2 px-4 h-full">
              <Search className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search in conversation…"
                className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none"
              />
              {searchQuery && (
                <span className="text-[11px] text-muted-foreground/50 flex-shrink-0">
                  {messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase())).length} results
                </span>
              )}
              <button
                onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
                className="w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        ) : filteredFeed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-20">
            <p className="text-[13px] text-muted-foreground">
              {searchQuery ? `No messages matching "${searchQuery}"` : 'No messages yet. Start the conversation.'}
            </p>
          </div>
        ) : (
          filteredFeed.map((item, i) => {
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
                  const isOptimistic = msg.id.startsWith('__optimistic__');

                  const hoverToolbar = (
                    <div className={cn(
                      "transition-opacity duration-150 flex items-center gap-0.5 bg-white dark:bg-[#1F2B3E] rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.1)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] px-0.5 py-0.5 flex-shrink-0 self-center",
                      activeMessageMenuId === msg.id ? "opacity-100 z-50" : "opacity-0 group-hover:opacity-100"
                    )}>
                      <button 
                        onClick={() => copyMessage(msg.id, msg.media_url || msg.content || '')} 
                        title="Copy" 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                      >
                        {copiedMessageId === msg.id ? (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <button 
                        onClick={() => setReplyToMsg(msg)} 
                        title="Reply" 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                      >
                        <Reply className="w-3 h-3" />
                      </button>
                      
                      <div className="relative">
                        <button 
                          onClick={() => setActiveMessageMenuId(activeMessageMenuId === msg.id ? null : msg.id)} 
                          title="More options" 
                          className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors",
                            activeMessageMenuId === msg.id && "bg-black/[0.04] dark:bg-white/[0.06] text-foreground"
                          )}
                        >
                          <MoreHorizontal className="w-3 h-3" />
                        </button>
                        
                        <AnimatePresence>
                          {activeMessageMenuId === msg.id && (
                            <>
                              {/* Backdrop */}
                              <div 
                                className="fixed inset-0 z-40 cursor-default" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMessageMenuId(null);
                                }}
                              />
                              <motion.div
                                initial={{ opacity: 0, scale: 0.92, y: 4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.92, y: 4 }}
                                transition={{ duration: 0.1 }}
                                className={cn(
                                  "absolute z-50 bg-[#1C2333]/95 backdrop-blur-md border border-border rounded-xl shadow-xl p-1 min-w-[170px] flex flex-col gap-0.5 bottom-8 cursor-default",
                                  isInbound ? "left-0" : "right-0"
                                )}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* Quick Reactions grid */}
                                <div className="flex items-center justify-between border-b border-white/5 pb-1 px-1 mb-1 gap-1">
                                  {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                                    <button
                                      key={emoji}
                                      onClick={() => {
                                        handleEmojiReaction(msg.id, msg.reaction === emoji ? null : emoji);
                                        setActiveMessageMenuId(null);
                                      }}
                                      className={cn(
                                        "hover:scale-125 transition-transform p-1 text-[15px] rounded-md hover:bg-white/5",
                                        msg.reaction === emoji && "bg-white/10"
                                      )}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                                
                                <button
                                  onClick={() => {
                                    setReplyToMsg(msg);
                                    setActiveMessageMenuId(null);
                                  }}
                                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] hover:bg-white/5 transition-colors rounded-lg text-left text-foreground/90 font-medium"
                                >
                                  <Reply className="w-3.5 h-3.5 text-muted-foreground/80" />
                                  Reply
                                </button>

                                <button
                                  onClick={() => {
                                    copyMessage(msg.id, msg.media_url || msg.content || '');
                                    setActiveMessageMenuId(null);
                                  }}
                                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] hover:bg-white/5 transition-colors rounded-lg text-left text-foreground/90 font-medium"
                                >
                                  <Copy className="w-3.5 h-3.5 text-muted-foreground/80" />
                                  {msg.media_url ? 'Copy link' : 'Copy text'}
                                </button>

                                <button
                                  onClick={() => {
                                    handleSaveToFAQ(msg);
                                    setActiveMessageMenuId(null);
                                  }}
                                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] hover:bg-white/5 transition-colors rounded-lg text-left text-foreground/90 font-medium"
                                >
                                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/80" />
                                  Save to FAQ
                                </button>

                                <button
                                  onClick={() => {
                                    handleDeleteMessage(msg.id);
                                    setActiveMessageMenuId(null);
                                  }}
                                  className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors rounded-lg text-left font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete
                                </button>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  );

                  // Tick icon: WhatsApp-style
                  // pending → clock, sent → single grey tick, delivered → double grey tick, read → double BLUE tick, failed → red alert
                  const tickIcon = (() => {
                    if (msg.status === 'read')
                      return <CheckCheck className="w-3.5 h-3.5 text-sky-300" />;
                    if (msg.status === 'delivered')
                      return <CheckCheck className="w-3.5 h-3.5 text-white/60" />;
                    if (msg.status === 'sent')
                      return <Check className="w-3.5 h-3.5 text-white/60" />;
                    if (msg.status === 'pending' || isOptimistic)
                      return <Clock className="w-3 h-3 text-white/40" />;
                    if (msg.status === 'failed')
                      return (
                        <button onClick={() => handleResend(msg)} title="Retry" className="flex items-center cursor-pointer hover:opacity-70 transition-opacity">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      );
                    // Default fallback: single tick
                    return <Check className="w-3.5 h-3.5 text-white/60" />;
                  })();

                  const parentMsg = msg.reply_to_message_id 
                    ? messages.find(m => m.id === msg.reply_to_message_id)
                    : null;

                  const replyPreviewCard = parentMsg && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        const parentEl = document.getElementById(`msg-${parentMsg.id}`);
                        if (parentEl) {
                          parentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          parentEl.classList.add('bg-indigo-500/10', 'ring-1', 'ring-indigo-500/30');
                          setTimeout(() => {
                            parentEl.classList.remove('bg-indigo-500/10', 'ring-1', 'ring-indigo-500/30');
                          }, 1500);
                        }
                      }}
                      className={cn(
                        "mb-1.5 rounded-lg border-l-4 p-2 text-[12px] bg-black/5 dark:bg-white/5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/10 transition-all select-none text-left border-l-solid",
                        parentMsg.direction === 'inbound' 
                          ? "border-emerald-500 text-emerald-600 dark:text-emerald-400" 
                          : "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                      )}
                    >
                      <div className="font-semibold text-[11px] mb-0.5">
                        {parentMsg.direction === 'inbound' ? displayName : 'You'}
                      </div>
                      <div className="text-muted-foreground line-clamp-2">
                        {parentMsg.content || (parentMsg.media_url ? 'Attachment' : '')}
                      </div>
                    </div>
                  );

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 5, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className={cn('group w-full flex items-end gap-1 relative', isInbound ? 'justify-start' : 'justify-end', msg.reaction && 'mb-2.5')}
                    >
                      {/* Outbound: toolbar floats LEFT of bubble */}
                      {!isInbound && hoverToolbar}

                      {msg.media_url ? (
                        /* ── Attachment bubble ── */
                        <div 
                          id={`msg-${msg.id}`}
                          className={cn(
                            'max-w-[65%] px-2.5 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.08)] border transition-all duration-150 relative break-words',
                            isInbound
                              ? cn(
                                  'bg-white dark:bg-white/5 dark:backdrop-blur-md border-black/5 dark:border-white/10',
                                  isFirst ? 'rounded-2xl rounded-tl-sm' : 'rounded-2xl',
                                  isLast && !isFirst ? 'rounded-bl-sm' : ''
                                )
                              : cn(
                                  isOptimistic
                                    ? 'bg-gradient-to-r from-indigo-400/70 to-violet-500/70 border-indigo-400/10'
                                    : 'bg-gradient-to-r from-indigo-500/90 to-violet-600/90 border-indigo-400/20',
                                  'shadow-[0_0_12px_rgba(99,102,241,0.15)]',
                                  isFirst ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl',
                                  isLast && !isFirst ? 'rounded-br-sm' : '',
                                  msg.status === 'failed' ? 'ring-1 ring-red-300 dark:ring-red-800 opacity-80' : ''
                                )
                          )}
                        >
                          {replyPreviewCard}
                          <AttachmentBubble
                            mediaUrl={msg.media_url}
                            fileName={msg.file_name || msg.content || 'file'}
                            fileSize={msg.file_size}
                            mimeType={msg.mime_type || 'application/octet-stream'}
                            caption={msg.media_caption}
                            isOutbound={!isInbound}
                            isOptimistic={isOptimistic}
                          />
                          {/* Timestamp + ticks */}
                          <div className={cn('flex items-center gap-1 mt-1', isInbound ? 'justify-start' : 'justify-end')}>
                            <span className={cn(
                              'text-[10.5px]',
                              isInbound ? 'text-black/30 dark:text-white/30' : 'text-white/60'
                            )}>
                              {formatTime(msg.created_at)}
                            </span>
                            {!isInbound && tickIcon}
                          </div>

                          {/* Reaction badge */}
                          {msg.reaction && (
                            <div className={cn(
                              "absolute bottom-[-10px] bg-white dark:bg-[#1C2333] border border-border rounded-full px-1.5 py-0.5 text-[12px] shadow-sm flex items-center justify-center select-none z-10",
                              isInbound ? "right-2" : "left-2"
                            )}>
                              {msg.reaction}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* ── Text bubble ── */
                        <div 
                          id={`msg-${msg.id}`}
                          className={cn(
                            'max-w-[65%] px-3.5 py-2 text-[14px] leading-relaxed shadow-[0_1px_2px_rgba(0,0,0,0.08)] border transition-all duration-150 relative break-words',
                            isInbound
                              ? cn(
                                  'bg-white dark:bg-white/5 dark:backdrop-blur-md border-black/5 dark:border-white/10 text-foreground',
                                  isFirst ? 'rounded-2xl rounded-tl-sm' : 'rounded-2xl',
                                  isLast && !isFirst ? 'rounded-bl-sm' : ''
                                )
                              : cn(
                                  isOptimistic
                                    ? 'bg-gradient-to-r from-indigo-400/70 to-violet-500/70 border-indigo-400/10'
                                    : 'bg-gradient-to-r from-indigo-500/90 to-violet-600/90 border-indigo-400/20',
                                  'text-white shadow-[0_0_12px_rgba(99,102,241,0.15)]',
                                  isFirst ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl',
                                  isLast && !isFirst ? 'rounded-br-sm' : '',
                                  msg.status === 'failed' ? 'ring-1 ring-red-300 dark:ring-red-800 opacity-80' : ''
                                )
                          )}
                        >
                          {replyPreviewCard}
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>

                          {/* Timestamp + ticks — shown on every bubble */}
                          <div className={cn('flex items-center gap-1 mt-0.5', isInbound ? 'justify-start' : 'justify-end')}>
                            <span className={cn(
                              'text-[10.5px]',
                              isInbound ? 'text-black/30 dark:text-white/30' : 'text-white/60'
                            )}>
                              {formatTime(msg.created_at)}
                            </span>
                            {/* Only show ticks for outbound messages — no bot icon, no extras */}
                            {!isInbound && tickIcon}
                          </div>

                          {/* Reaction badge */}
                          {msg.reaction && (
                            <div className={cn(
                              "absolute bottom-[-10px] bg-white dark:bg-[#1C2333] border border-border rounded-full px-1.5 py-0.5 text-[12px] shadow-sm flex items-center justify-center select-none z-10",
                              isInbound ? "right-2" : "left-2"
                            )}>
                              {msg.reaction}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Inbound: toolbar floats RIGHT of bubble */}
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
      <div className="flex-shrink-0 px-4 pb-4 pt-3 relative">
        {/* AI Assist floating panel */}
        <AIAssistPanel
          open={aiPanelOpen}
          onClose={() => setAiPanelOpen(false)}
          currentText={inputMsg}
          messages={messages}
          onInsert={handleAIInsert}
        />
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx"
          className="hidden"
          onChange={handleFileAttach}
        />

        {/* Reply preview strip */}
        <AnimatePresence>
          {replyToMsg && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: 10 }}
              animate={{ height: 'auto', opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-2"
            >
              <div className="flex items-center justify-between bg-white dark:bg-[#1C2333] border border-border rounded-xl p-2.5 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.04]">
                <div className="flex-1 flex gap-2 border-l-4 border-indigo-500 pl-2">
                  <div className="flex flex-col text-left">
                    <span className="text-[11px] font-semibold text-indigo-500">
                      Replying to {replyToMsg.direction === 'inbound' ? displayName : 'You'}
                    </span>
                    <span className="text-[12px] text-muted-foreground line-clamp-1">
                      {replyToMsg.content || (replyToMsg.media_url ? 'Attachment' : '')}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setReplyToMsg(null)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pending attachment preview strip */}
        <AnimatePresence>
          {pendingFile && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.15 }}
              className="mb-2"
            >
              <PendingAttachment
                file={pendingFile}
                onRemove={() => setPendingFile(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-1 bg-white dark:bg-[#1C2333] rounded-2xl px-2 py-2 shadow-[0_2px_16px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04] dark:ring-white/[0.04]">
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Attach file"
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors flex-shrink-0 mb-0.5"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setAiPanelOpen(v => !v); setEmojiOpen(false); }}
            title="AI Assistant ✨"
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-0.5",
              aiPanelOpen
                ? "bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 shadow-[0_0_0_2px_rgba(139,92,246,0.2)]"
                : "text-violet-500/70 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30"
            )}
          >
            <Sparkles className={cn("w-4 h-4", aiPanelOpen && "fill-current opacity-80")} />
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
            placeholder={pendingFile ? 'Add a caption… (optional)' : 'Type a message…'}
            rows={1}
            disabled={sending || uploading}
            className="flex-1 bg-transparent border-0 resize-none outline-none text-[13.5px] text-foreground placeholder:text-muted-foreground/50 py-1.5 px-1 min-h-[36px] max-h-32"
          />

          {/* Emoji picker */}
          <div className="relative flex-shrink-0 mb-0.5">
            <button
              onClick={() => setEmojiOpen(v => !v)}
              title="Emoji"
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                emojiOpen ? "bg-amber-50 dark:bg-amber-950/30 text-amber-500" : "text-muted-foreground/50 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
              )}
            >
              <Smile className="w-4 h-4" />
            </button>
            <AnimatePresence>
              {emojiOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute bottom-12 right-0 z-50 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden w-[300px]"
                >
                  {/* Header */}
                  <div className="px-3 pt-2.5 pb-1.5 border-b border-border">
                    <p className="text-[11px] font-semibold text-muted-foreground">{EMOJI_CATEGORIES[emojiCategory].name}</p>
                  </div>

                  {/* Category tabs */}
                  <div className="flex border-b border-border bg-muted/30">
                    {EMOJI_CATEGORIES.map((cat, i) => (
                      <button
                        key={cat.name}
                        onClick={() => setEmojiCategory(i)}
                        title={cat.name}
                        className={cn(
                          'flex-1 py-1.5 text-[15px] transition-colors',
                          i === emojiCategory
                            ? 'bg-card border-b-2 border-indigo-500'
                            : 'hover:bg-muted/60 text-muted-foreground/60'
                        )}
                      >{cat.label}</button>
                    ))}
                  </div>

                  {/* Scrollable emoji grid */}
                  <div className="overflow-y-auto" style={{ maxHeight: '200px' }}>
                    <div className="grid grid-cols-8 gap-0.5 p-2">
                      {EMOJI_CATEGORIES[emojiCategory].emojis.map(e => (
                        <button
                          key={e}
                          onClick={() => handleEmojiInsert(e)}
                          className="w-8 h-8 flex items-center justify-center text-[18px] hover:bg-muted rounded-lg transition-colors"
                        >{e}</button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Send button — active when text typed OR file pending */}
          <button
            disabled={(!inputMsg.trim() && !pendingFile) || sending || uploading}
            onClick={() => handleSend()}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 transition-all duration-150",
              (inputMsg.trim() || pendingFile) && !sending && !uploading
                ? "bg-[#00A884] text-white hover:bg-[#009874]"
                : "text-muted-foreground/30 cursor-not-allowed"
            )}
          >
            {(sending || uploading) ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
