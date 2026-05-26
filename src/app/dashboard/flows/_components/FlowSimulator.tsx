"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, CheckCheck, Loader2, RotateCcw } from "lucide-react";
import { useParams } from "next/navigation";

interface TraceStep {
  nodeId: string;
  nodeType: string;
  action: string;
  payload?: unknown;
  variables?: Record<string, unknown>;
}

type MsgType = "user" | "bot" | "action" | "system";

interface SimMessage {
  id: string;
  type: MsgType;
  text: string;
  action?: string;
}

// ── Visual config for each trace action ──────────────────────
const ACTION_META: Record<string, { icon: string; label: string; color: string }> = {
  trigger_matched:  { icon: "▶", label: "Flow triggered",       color: "#3B82F6" },
  condition_true:   { icon: "✓", label: "Condition: TRUE",       color: "#10B981" },
  condition_false:  { icon: "✗", label: "Condition: FALSE",      color: "#EF4444" },
  webhook_call:     { icon: "🔗", label: "API Call",             color: "#06B6D4" },
  tag_lead:         { icon: "🏷", label: "Tag Added",            color: "#F59E0B" },
  delay:            { icon: "⏱", label: "Delay",                color: "#6366F1" },
  handoff:          { icon: "🤝", label: "Human Handoff",        color: "#EC4899" },
  wait_for_reply:   { icon: "⏳", label: "Waiting for reply",    color: "#64748B" },
  ai_intent:        { icon: "🧠", label: "AI Analysis",          color: "#8B5CF6" },
  memory_saved:     { icon: "💾", label: "Memory Saved",         color: "#8B5CF6" },
  knowledge_search: { icon: "📚", label: "Knowledge Search",     color: "#A855F7" },
  extract_entities: { icon: "🔍", label: "Entities Extracted",   color: "#14B8A6" },
  format_message:   { icon: "✏", label: "Message Formatted",    color: "#0EA5E9" },
  book_appointment: { icon: "📅", label: "Appointment",          color: "#F79009" },
  collect_data:     { icon: "📋", label: "Collecting Data",      color: "#F59E0B" },
  end_flow:         { icon: "🏁", label: "Flow Complete",        color: "#64748B" },
  resume_flow:      { icon: "↩", label: "Return to Listen",      color: "#22C55E" },
  node_executed:    { icon: "⚙", label: "Node Executed",         color: "#94A3B8" },
};

export default function FlowSimulator() {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const params = useParams();
  const flowId = params.id as string;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([{ id: "init", type: "system", text: "Send a message to test this flow." }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const reset = () => {
    setMessages([{ id: "init", type: "system", text: "Send a message to test this flow." }]);
    setInputText("");
    setIsLoading(false);
  };

  const handleSend = async () => {
    if (!inputText.trim() || !flowId || flowId === "new") return;

    const userMsg = inputText.trim();
    setMessages(prev => [...prev, { id: Date.now().toString(), type: "user", text: userMsg }]);
    setInputText("");
    setIsLoading(true);

    try {
      const res = await fetch(`/api/dashboard/flows/${flowId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();

      if (!res.ok) {
        const hint = res.status === 404
          ? "No trigger node found — add a Message Trigger to start your flow."
          : data.error || "Simulation error.";
        setMessages(prev => [...prev, { id: `err-${Date.now()}`, type: "system", text: `⚠️ ${hint}` }]);
        setIsLoading(false);
        return;
      }

      const trace: TraceStep[] = data.data?.trace ?? [];
      const variables: Record<string, unknown> = data.data?.variables ?? {};

      if (trace.length === 0) {
        setMessages(prev => [...prev, { id: `empty-${Date.now()}`, type: "system", text: "Flow ran but executed no actions. Check your node connections." }]);
        setIsLoading(false);
        return;
      }

      // Animate steps with staggered delays
      let delay = 300;
      trace.forEach((step, idx) => {
        const isMsg = step.action === "send_message";
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: `step-${idx}-${Date.now()}`,
            type: isMsg ? "bot" : "action",
            text: String(step.payload ?? ""),
            action: step.action,
          }]);
        }, delay);
        delay += isMsg ? 900 : 420;
      });

      // Variables summary if any were captured
      const varKeys = Object.keys(variables);
      if (varKeys.length > 0) {
        setTimeout(() => {
          const lines = varKeys.slice(0, 5)
            .map(k => `  ${k}: ${String(variables[k]).slice(0, 40)}`)
            .join("\n");
          setMessages(prev => [...prev, {
            id: `vars-${Date.now()}`,
            type: "system",
            text: `📊 Variables captured:\n${lines}`,
          }]);
        }, delay + 200);
      }

      setTimeout(() => setIsLoading(false), delay + (varKeys.length > 0 ? 500 : 0));
    } catch {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, type: "system", text: "⚠️ Network error — could not reach simulation API." }]);
      setIsLoading(false);
    }
  };

  return (
    <div className="w-[360px] flex-shrink-0 border-r border-white/10 bg-[#0A0A0A] flex flex-col z-10 shadow-2xl relative">
      {/* Header */}
      <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-white text-[12px] shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            AI
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-white tracking-tight">Aries AI Simulation</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-emerald-500 font-medium tracking-widest uppercase">Live</span>
            </div>
          </div>
        </div>
        <button
          onClick={reset}
          title="Reset chat"
          className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-3 relative"
        style={{ background: "linear-gradient(180deg, #0A0A0A 0%, #0D1117 100%)" }}
      >
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
            >
              {/* User message */}
              {msg.type === "user" && (
                <div className="flex justify-end">
                  <div className="bg-[#005C4B] text-[#E9EDEF] px-3 py-2 rounded-[12px] rounded-tr-sm max-w-[85%] shadow-sm">
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    <div className="flex justify-end items-center gap-1 mt-0.5">
                      <span className="text-[9px] text-white/40">Now</span>
                      <CheckCheck className="w-3 h-3 text-[#53bdeb]" />
                    </div>
                  </div>
                </div>
              )}

              {/* Bot message (send_message actions) */}
              {msg.type === "bot" && (
                <div className="flex justify-start">
                  <div className="bg-[#202C33] text-[#E9EDEF] px-3 py-2 rounded-[12px] rounded-tl-sm max-w-[85%] shadow-sm">
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    <span className="text-[9px] text-white/30 mt-0.5 block text-right">Now</span>
                  </div>
                </div>
              )}

              {/* Action chip (all non-message trace steps) */}
              {msg.type === "action" && (() => {
                const meta = ACTION_META[msg.action ?? ""] ?? ACTION_META.node_executed;
                return (
                  <div className="flex justify-center">
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium"
                      style={{
                        background: `${meta.color}14`,
                        border: `1px solid ${meta.color}30`,
                        color: meta.color,
                      }}
                    >
                      <span>{meta.icon}</span>
                      <span>{meta.label}</span>
                      {msg.text && (
                        <span className="text-white/40 font-normal truncate max-w-[160px]">
                          — {msg.text}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* System / info message */}
              {msg.type === "system" && (
                <div className="flex justify-center">
                  <p className="text-[11px] text-white/35 text-center leading-relaxed whitespace-pre-wrap px-2 max-w-[280px]">
                    {msg.text}
                  </p>
                </div>
              )}
            </motion.div>
          ))}

          {isLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="px-4 py-3 rounded-[12px] bg-[#202C33] text-white/40 rounded-tl-sm flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-[12px]">Simulating flow…</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-[#202C33] border-t border-white/5">
        <div className="flex items-center gap-2 bg-[#2A3942] rounded-full px-4 py-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder={flowId === "new" ? "Save flow first…" : "Type a message…"}
            disabled={flowId === "new"}
            className="flex-1 bg-transparent border-none text-[14px] text-white placeholder:text-white/35 focus:outline-none disabled:opacity-40"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || flowId === "new"}
            className="p-1.5 bg-emerald-500 rounded-full text-white disabled:opacity-40 transition-opacity hover:bg-emerald-400"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
