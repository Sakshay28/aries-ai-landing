"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, CheckCircle2, Briefcase, Smile, TrendingUp, AlignLeft,
  Zap, Languages, ArrowLeftRight, MessageSquareReply, Lightbulb,
  FileText, Send, Target, X, RotateCcw, Check, Loader2, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────
export type AssistMode =
  | 'correct' | 'professional' | 'friendly' | 'sales' | 'shorter'
  | 'persuasive' | 'translate_en' | 'hinglish_to_en' | 'en_to_hinglish' | 'better_reply'
  | 'smart_reply' | 'summarize' | 'followup' | 'suggest' | 'lead_intent';

interface Action {
  mode: AssistMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
}

// ─── Action definitions ───────────────────────────────────────────────────────
const TEXT_ACTIONS: Action[] = [
  {
    mode: 'correct',
    label: 'Correct Sentence',
    description: 'Fix grammar & structure',
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  {
    mode: 'professional',
    label: 'Professional',
    description: 'Formal business tone',
    icon: Briefcase,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
  },
  {
    mode: 'friendly',
    label: 'Friendly',
    description: 'Warm & approachable',
    icon: Smile,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
  },
  {
    mode: 'sales',
    label: 'Sales Tone',
    description: 'Persuasive & engaging',
    icon: TrendingUp,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
  },
  {
    mode: 'shorter',
    label: 'Make Shorter',
    description: 'Concise & crisp',
    icon: AlignLeft,
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-50 dark:bg-slate-950/30',
  },
  {
    mode: 'persuasive',
    label: 'More Persuasive',
    description: 'Compelling & confident',
    icon: Zap,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
  },
  {
    mode: 'translate_en',
    label: 'Translate to English',
    description: 'Any language → English',
    icon: Languages,
    color: 'text-cyan-600 dark:text-cyan-400',
    bg: 'bg-cyan-50 dark:bg-cyan-950/30',
  },
  {
    mode: 'hinglish_to_en',
    label: 'Hinglish → English',
    description: 'Convert to English',
    icon: ArrowLeftRight,
    color: 'text-indigo-600 dark:text-indigo-400',
    bg: 'bg-indigo-50 dark:bg-indigo-950/30',
  },
  {
    mode: 'en_to_hinglish',
    label: 'English → Hinglish',
    description: 'Casual Indian style',
    icon: ArrowLeftRight,
    color: 'text-pink-600 dark:text-pink-400',
    bg: 'bg-pink-50 dark:bg-pink-950/30',
  },
  {
    mode: 'better_reply',
    label: 'Better Reply',
    description: 'Context-aware reply',
    icon: MessageSquareReply,
    color: 'text-teal-600 dark:text-teal-400',
    bg: 'bg-teal-50 dark:bg-teal-950/30',
  },
];

const NO_TEXT_ACTIONS: Action[] = [
  {
    mode: 'smart_reply',
    label: 'Smart Reply',
    description: '3 quick reply options',
    icon: Lightbulb,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
  },
  {
    mode: 'suggest',
    label: 'Suggest Response',
    description: 'AI-crafted reply',
    icon: MessageSquareReply,
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
  },
  {
    mode: 'followup',
    label: 'Generate Follow-up',
    description: 'Context-based follow-up',
    icon: Send,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
  },
  {
    mode: 'summarize',
    label: 'Summarize Chat',
    description: 'Quick conversation summary',
    icon: FileText,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  {
    mode: 'lead_intent',
    label: 'Lead Intent',
    description: 'Analyze lead quality',
    icon: Target,
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/30',
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface AIAssistPanelProps {
  open: boolean;
  onClose: () => void;
  currentText: string;
  messages: Message[];
  onInsert: (text: string) => void;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
}

// ─── Panel Component ──────────────────────────────────────────────────────────
export default function AIAssistPanel({
  open,
  onClose,
  currentText,
  messages,
  onInsert,
}: AIAssistPanelProps) {
  const hasText = currentText.trim().length > 0;
  const actions = hasText ? TEXT_ACTIONS : NO_TEXT_ACTIONS;

  const [loading, setLoading] = useState<AssistMode | null>(null);
  const [results, setResults] = useState<Map<AssistMode, string | string[]>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset when panel opens/closes or text changes
  useEffect(() => {
    if (open) {
      setResults(new Map());
      setError(null);
      setLoading(null);
    }
  }, [open, currentText]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const callAssist = useCallback(async (mode: AssistMode) => {
    // If we already have a result, just insert it
    const existing = results.get(mode);
    if (existing) {
      if (mode === 'lead_intent' || mode === 'summarize') return; // info modes
      const text = Array.isArray(existing) ? existing[0] : existing;
      onInsert(text);
      onClose();
      return;
    }

    setLoading(mode);
    setError(null);

    const recentMessages = messages.slice(-20).map(m => ({
      direction: m.direction,
      content: m.content,
      created_at: m.created_at,
    }));

    try {
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          currentText: currentText.trim(),
          recentMessages,
          languagePreference: 'auto',
        }),
      });

      if (!res.ok) throw new Error('AI request failed');
      const data = await res.json();

      // Handle different response shapes
      let resultValue: string | string[];
      if (data.suggestions) {
        resultValue = data.suggestions as string[];
      } else if (data.result) {
        resultValue = data.result as string;
      } else {
        throw new Error('Empty response');
      }

      setResults(prev => new Map(prev).set(mode, resultValue));

      // For info-only modes (lead_intent, summarize), don't auto-insert
      const infoModes: AssistMode[] = ['lead_intent', 'summarize'];
      if (!infoModes.includes(mode)) {
        // Auto-insert single results
        if (!Array.isArray(resultValue)) {
          onInsert(resultValue);
          onClose();
        }
        // For smart_reply (array), show options — don't auto-insert
      }
    } catch {
      setError('AI request failed. Please try again.');
    } finally {
      setLoading(null);
    }
  }, [currentText, messages, results, onInsert, onClose]);

  const handleInsertSuggestion = (text: string) => {
    onInsert(text);
    onClose();
  };

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "absolute bottom-full left-0 right-0 mb-2 z-50",
            "mx-4 rounded-2xl overflow-hidden",
            "bg-white dark:bg-[#1C2333]",
            "shadow-[0_8px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.4)]",
            "ring-1 ring-black/[0.06] dark:ring-white/[0.08]",
          )}
          style={{ maxHeight: '70vh' }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground leading-none">AI Assistant</p>
                <p className="text-[10.5px] text-muted-foreground mt-0.5">
                  {hasText ? `Rewriting your message…` : 'Generate from conversation'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Current text preview (if any) ── */}
          {hasText && (
            <div className="px-4 pt-3 pb-0">
              <div className="flex items-start gap-2 p-2.5 bg-black/[0.03] dark:bg-white/[0.04] rounded-xl">
                <div className="w-1 rounded-full bg-violet-400 self-stretch flex-shrink-0" />
                <p className="text-[12px] text-foreground/70 leading-relaxed line-clamp-2 flex-1">
                  {currentText}
                </p>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="mx-4 mt-3 px-3 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-[12px] rounded-lg flex items-center gap-2">
              <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* ── Smart Reply Suggestions (when results available) ── */}
          {(() => {
            const smartReplies = results.get('smart_reply');
            if (!smartReplies || !Array.isArray(smartReplies)) return null;
            return (
              <div className="px-4 pt-3">
                <p className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Quick Replies
                </p>
                <div className="space-y-1.5">
                  {smartReplies.map((reply, i) => (
                    <button
                      key={i}
                      onClick={() => handleInsertSuggestion(reply)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50 transition-colors group text-left"
                    >
                      <p className="text-[13px] text-foreground leading-relaxed flex-1">{reply}</p>
                      <ChevronRight className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Lead Intent / Summary display ── */}
          {(() => {
            const leadResult = results.get('lead_intent') || results.get('summarize');
            if (!leadResult || Array.isArray(leadResult)) return null;
            const mode = results.has('lead_intent') ? 'lead_intent' : 'summarize';
            return (
              <div className="px-4 pt-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {mode === 'lead_intent' ? 'Lead Analysis' : 'Summary'}
                    </p>
                    <button
                      onClick={() => handleCopy(leadResult)}
                      className="text-muted-foreground/50 hover:text-foreground transition-colors"
                    >
                      {copied === leadResult ? <Check className="w-3 h-3 text-emerald-500" /> : <FileText className="w-3 h-3" />}
                    </button>
                  </div>
                  <p className="text-[12.5px] text-foreground/80 leading-relaxed whitespace-pre-line">{leadResult}</p>
                </div>
              </div>
            );
          })()}

          {/* ── Action List ── */}
          <div className="p-3 overflow-y-auto" style={{ maxHeight: '300px' }}>
            {!hasText && (
              <p className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
                Generate
              </p>
            )}
            <div className="grid grid-cols-1 gap-1">
              {actions.map((action) => {
                const Icon = action.icon;
                const isLoading = loading === action.mode;
                const hasResult = results.has(action.mode);
                const isInfoMode = action.mode === 'lead_intent' || action.mode === 'summarize';

                return (
                  <button
                    key={action.mode}
                    onClick={() => callAssist(action.mode)}
                    disabled={loading !== null}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 text-left group",
                      "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
                      "disabled:opacity-60 disabled:cursor-not-allowed",
                      isLoading && "bg-black/[0.03] dark:bg-white/[0.04]",
                    )}
                  >
                    {/* Icon */}
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                      action.bg,
                    )}>
                      {isLoading ? (
                        <Loader2 className={cn("w-3.5 h-3.5 animate-spin", action.color)} />
                      ) : hasResult && !isInfoMode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Icon className={cn("w-3.5 h-3.5", action.color)} />
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground leading-none">{action.label}</p>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5">{action.description}</p>
                    </div>

                    {/* Arrow */}
                    {!isLoading && (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 flex-shrink-0 group-hover:text-muted-foreground/60 group-hover:translate-x-0.5 transition-all" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="px-4 pb-3 pt-1 border-t border-border/40">
            <p className="text-[10.5px] text-muted-foreground/40 text-center">
              Powered by Gemini AI · Results are editable before sending
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
