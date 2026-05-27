"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, CheckCheck, Loader2, RotateCcw, Activity, Database, ChevronRight } from "lucide-react";
import { useParams } from "next/navigation";
import { useFlowStore } from "../store";

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
  const [traceLog, setTraceLog] = useState<TraceStep[]>([]);
  const [liveVars, setLiveVars] = useState<Record<string, string>>({});
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'trace' | 'vars'>('trace');
  const params = useParams();
  const flowId = params.id as string;
  const bottomRef = useRef<HTMLDivElement>(null);
  const { setSelectedNodeId } = useFlowStore();

  useEffect(() => {
    setMessages([{ id: "init", type: "system", text: "Send a message to test this flow." }]);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const reset = useCallback(() => {
    setMessages([{ id: "init", type: "system", text: "Send a message to test this flow." }]);
    setInputText("");
    setIsLoading(false);
    setTraceLog([]);
    setLiveVars({});
    setActiveNodeId(null);
  }, []);

  const handleSend = useCallback(async () => {
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

      // Append to trace log
      setTraceLog(prev => [...prev, ...trace]);

      // Update live variables
      const varStr: Record<string, string> = {};
      for (const [k, v] of Object.entries(variables)) varStr[k] = String(v);
      setLiveVars(prev => ({ ...prev, ...varStr }));

      if (trace.length === 0) {
        setMessages(prev => [...prev, { id: `empty-${Date.now()}`, type: "system", text: "Flow ran but executed no actions. Check your node connections." }]);
        setIsLoading(false);
        return;
      }

      // Animate steps with staggered delays + highlight active node
      let delay = 300;
      trace.forEach((step, idx) => {
        const isMsg = step.action === "send_message";
        setTimeout(() => {
          setActiveNodeId(step.nodeId);
          setMessages(prev => [...prev, {
            id: `step-${idx}-${Date.now()}`,
            type: isMsg ? "bot" : "action",
            text: String(step.payload ?? ""),
            action: step.action,
          }]);
        }, delay);
        delay += isMsg ? 900 : 420;
      });

      setTimeout(() => { setIsLoading(false); setActiveNodeId(null); }, delay);
    } catch {
      setMessages(prev => [...prev, { id: `err-${Date.now()}`, type: "system", text: "⚠️ Network error — could not reach simulation API." }]);
      setIsLoading(false);
    }
  }, [inputText, flowId]);

  return (
    <div className="flex-shrink-0 border-r border-white/10 bg-[#0A0A0A] flex flex-row z-10 shadow-2xl" style={{ width: 720 }}>

      {/* LEFT: Chat simulator (WhatsApp-style) */}
      <div className="w-[320px] flex-shrink-0 flex flex-col border-r border-white/[0.06]">
        {/* Header */}
        <div className="p-4 border-b border-white/5 bg-white/[0.02] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center font-bold text-white text-[12px] shadow-[0_0_15px_rgba(16,185,129,0.3)]">AI</div>
            <div>
              <h3 className="text-[13px] font-semibold text-white">Flow Simulator</h3>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-500 font-medium tracking-widest uppercase">Live</span>
              </div>
            </div>
          </div>
          <button onClick={reset} title="Reset" className="p-1.5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/5 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: "linear-gradient(180deg, #0A0A0A 0%, #0D1117 100%)" }}>
          <AnimatePresence initial={false}>
            {messages.map(msg => (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
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
                {msg.type === "bot" && (
                  <div className="flex justify-start">
                    <div className="bg-[#202C33] text-[#E9EDEF] px-3 py-2 rounded-[12px] rounded-tl-sm max-w-[85%] shadow-sm">
                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      <span className="text-[9px] text-white/30 mt-0.5 block text-right">Now</span>
                    </div>
                  </div>
                )}
                {msg.type === "action" && (() => {
                  const meta = ACTION_META[msg.action ?? ""] ?? ACTION_META.node_executed;
                  return (
                    <div className="flex justify-center">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium" style={{ background: `${meta.color}14`, border: `1px solid ${meta.color}30`, color: meta.color }}>
                        <span>{meta.icon}</span><span>{meta.label}</span>
                        {msg.text && <span className="text-white/40 font-normal truncate max-w-[120px]">— {msg.text}</span>}
                      </div>
                    </div>
                  );
                })()}
                {msg.type === "system" && (
                  <div className="flex justify-center">
                    <p className="text-[11px] text-white/35 text-center leading-relaxed whitespace-pre-wrap px-2 max-w-[260px]">{msg.text}</p>
                  </div>
                )}
              </motion.div>
            ))}
            {isLoading && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="px-4 py-3 rounded-[12px] bg-[#202C33] text-white/40 rounded-tl-sm flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="text-[12px]">Simulating…</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-3 bg-[#202C33] border-t border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2 bg-[#2A3942] rounded-full px-4 py-2">
            <input
              type="text" value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              placeholder={flowId === "new" ? "Save flow first…" : "Type a message…"}
              disabled={flowId === "new"}
              className="flex-1 bg-transparent border-none text-[14px] text-white placeholder:text-white/35 focus:outline-none disabled:opacity-40"
            />
            <button onClick={handleSend} disabled={!inputText.trim() || flowId === "new"} className="p-1.5 bg-emerald-500 rounded-full text-white disabled:opacity-40 transition-opacity hover:bg-emerald-400">
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT: Trace log + Variable inspector */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-white/[0.06] flex-shrink-0" style={{ background: 'rgba(255,255,255,0.02)' }}>
          {(['trace', 'vars'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex items-center gap-2 px-4 py-3 text-[12px] font-medium transition-all"
              style={{
                color: activeTab === tab ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)',
                borderBottom: activeTab === tab ? '2px solid #22c55e' : '2px solid transparent',
              }}
            >
              {tab === 'trace' ? <Activity className="w-3.5 h-3.5" /> : <Database className="w-3.5 h-3.5" />}
              {tab === 'trace' ? 'Execution Trace' : 'Variables'}
              {tab === 'trace' && traceLog.length > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>{traceLog.length}</span>
              )}
              {tab === 'vars' && Object.keys(liveVars).length > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>{Object.keys(liveVars).length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Trace Panel */}
        {activeTab === 'trace' && (
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {traceLog.length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Activity className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.1)' }} />
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>Send a message to see execution trace</p>
              </div>
            )}
            {traceLog.map((step, i) => {
              const meta = ACTION_META[step.action] ?? ACTION_META.node_executed;
              const isActive = step.nodeId === activeNodeId;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-all"
                  style={{
                    background: isActive ? `${meta.color}12` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isActive ? meta.color + '30' : 'rgba(255,255,255,0.04)'}`,
                  }}
                  onClick={() => { if (step.nodeId) setSelectedNodeId(step.nodeId); }}
                  title="Click to select node"
                >
                  <span className="text-[13px] flex-shrink-0 mt-0.5">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                      <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>{step.nodeType}</span>
                    </div>
                    {step.payload != null && String(step.payload).length > 0 && (
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{String(step.payload).slice(0, 60)}</p>
                    )}
                  </div>
                  <ChevronRight className="w-3 h-3 flex-shrink-0 mt-1" style={{ color: 'rgba(255,255,255,0.15)' }} />
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Variables Panel */}
        {activeTab === 'vars' && (
          <div className="flex-1 overflow-y-auto p-3">
            {Object.keys(liveVars).length === 0 && (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <Database className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.1)' }} />
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>No variables captured yet</p>
              </div>
            )}
            <div className="space-y-1.5">
              {Object.entries(liveVars).map(([key, val]) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}
                >
                  <span className="font-mono text-[11px] font-semibold" style={{ color: '#c084fc', minWidth: 100 }}>{`{{${key}}}`}</span>
                  <span className="text-[12px] truncate" style={{ color: 'rgba(255,255,255,0.7)' }}>{val}</span>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
