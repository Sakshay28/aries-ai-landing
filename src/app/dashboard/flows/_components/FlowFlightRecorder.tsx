"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Radio, ChevronRight, CheckCircle2, AlertCircle, Clock, ArrowLeft, RefreshCw, Zap, GitBranch, MessageSquare, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Execution {
  id: string;
  conversation_id: string;
  outcome: "completed" | "handoff" | "error" | "wait";
  duration_ms: number;
  total_nodes: number;
  node_path: string[];
  created_at: string;
}

interface TraceStep {
  node_id: string;
  node_type: string;
  action: string;
  payload?: string;
  latency_ms?: number;
  created_at: string;
}

const OUTCOME_STYLE: Record<string, { color: string; label: string }> = {
  completed: { color: "#10b981", label: "Completed" },
  handoff:   { color: "#8b5cf6", label: "Handoff"   },
  error:     { color: "#ef4444", label: "Error"      },
  wait:      { color: "#06b6d4", label: "Waiting"    },
};

function fmtDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

const ACTION_ICON: Record<string, React.ElementType> = {
  node_executed: Zap,
  node_error:    AlertCircle,
  branch_taken:  GitBranch,
  message_sent:  MessageSquare,
};

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  flowId:      string;
  flowName:    string;
  nodeLabels?: Record<string, string>;
  onClose:     () => void;
}

export default function FlowFlightRecorder({ flowId, flowName, nodeLabels = {}, onClose }: Props) {
  const [executions, setExecutions]   = useState<Execution[]>([]);
  const [traces, setTraces]           = useState<TraceStep[]>([]);
  const [selected, setSelected]       = useState<Execution | null>(null);
  const [loading, setLoading]         = useState(false);
  const [traceLoading, setTraceLoading] = useState(false);

  const loadExecutions = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/dashboard/flows/${flowId}/executions`);
      const json = await res.json();
      if (json.success) setExecutions(json.data.executions);
    } finally { setLoading(false); }
  }, [flowId]);

  const loadTrace = useCallback(async (exec: Execution) => {
    setSelected(exec);
    setTraceLoading(true);
    try {
      const res  = await fetch(`/api/dashboard/flows/${flowId}/executions?conversation_id=${exec.conversation_id}`);
      const json = await res.json();
      if (json.success) setTraces(json.data.traces);
    } finally { setTraceLoading(false); }
  }, [flowId]);

  useEffect(() => { loadExecutions(); }, [loadExecutions]);

  const outcomeStyle = (o: string) => OUTCOME_STYLE[o] ?? { color: "#64748b", label: o };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 60,
      background: "rgba(3,3,3,0.88)", backdropFilter: "blur(16px)",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        height: 56, flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", padding: "0 24px", gap: 14,
        background: "rgba(10,12,18,0.95)",
      }}>
        {selected && (
          <button onClick={() => { setSelected(null); setTraces([]); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4, display: "flex", alignItems: "center" }}>
            <ArrowLeft size={16} />
          </button>
        )}
        <Radio size={16} color="#ef4444" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>
            {selected ? `Replay · ${selected.conversation_id.slice(-8)}` : "Flight Recorder"}
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{flowName}</div>
        </div>
        <button onClick={loadExecutions} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569" }}><RefreshCw size={14} /></button>
        <button onClick={onClose}        style={{ background: "none", border: "none", cursor: "pointer", color: "#475569" }}><X size={18} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px 48px" }}>
        {!selected ? (
          /* ── Execution list ── */
          <>
            <div style={{ fontSize: 12, color: "#475569", marginBottom: 16 }}>
              Last {executions.length} conversation executions — click any to replay the full node path.
            </div>
            {loading ? (
              <div style={{ color: "#475569", fontSize: 13 }}>Loading…</div>
            ) : executions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#1e293b" }}>
                <Radio size={36} color="#1e293b" style={{ margin: "0 auto 12px" }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>No executions yet</div>
                <div style={{ fontSize: 12, color: "#1e293b", marginTop: 6 }}>Flight recorder activates once this flow receives real conversations.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {executions.map(ex => {
                  const os = outcomeStyle(ex.outcome);
                  return (
                    <button key={ex.id} onClick={() => loadTrace(ex)}
                      style={{
                        background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left",
                        display: "flex", alignItems: "center", gap: 14,
                        transition: "background 0.12s, border-color 0.12s",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.045)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.025)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.06)"; }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: os.color, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0", marginBottom: 3 }}>
                          Conversation {ex.conversation_id.slice(-8)}
                        </div>
                        <div style={{ fontSize: 11, color: "#475569" }}>
                          {ex.total_nodes} nodes · {fmtDuration(ex.duration_ms)} · {fmtTime(ex.created_at)}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: `${os.color}14`, color: os.color }}>
                        {os.label}
                      </span>
                      <ChevronRight size={14} color="#334155" />
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* ── Trace replay ── */
          <>
            <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
              {[
                { label: "Outcome",    value: outcomeStyle(selected.outcome).label, color: outcomeStyle(selected.outcome).color },
                { label: "Duration",   value: fmtDuration(selected.duration_ms),    color: "#f59e0b" },
                { label: "Nodes",      value: selected.total_nodes,                 color: "#6366f1" },
                { label: "Conv. ID",   value: selected.conversation_id.slice(-12),  color: "#64748b" },
              ].map(s => (
                <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 16px", minWidth: 110 }}>
                  <div style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: s.color as string }}>{s.value}</div>
                </div>
              ))}
            </div>

            {traceLoading ? (
              <div style={{ color: "#475569", fontSize: 13 }}>Loading trace…</div>
            ) : traces.length === 0 ? (
              <div style={{ color: "#334155", fontSize: 13 }}>No detailed trace available for this execution.</div>
            ) : (
              <div style={{ position: "relative" }}>
                {/* Vertical line */}
                <div style={{ position: "absolute", left: 15, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.06)" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {traces.map((step, i) => {
                    const Icon = ACTION_ICON[step.action] ?? Zap;
                    const label = nodeLabels[step.node_id] ?? step.node_type;
                    const isError = step.action === "node_error";
                    let payload: Record<string, unknown> | null = null;
                    try { if (step.payload) payload = JSON.parse(step.payload); } catch {}
                    return (
                      <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingLeft: 8 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                          background: isError ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.12)",
                          border: `1px solid ${isError ? "rgba(239,68,68,0.4)" : "rgba(16,185,129,0.25)"}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <Icon size={8} color={isError ? "#ef4444" : "#10b981"} />
                        </div>
                        <div style={{
                          flex: 1, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
                          borderRadius: 9, padding: "8px 12px",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: payload ? 6 : 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: isError ? "#f87171" : "#e2e8f0" }}>{label}</span>
                            <span style={{ fontSize: 10, color: "#334155", textTransform: "uppercase", letterSpacing: "0.06em" }}>{step.action.replace(/_/g, " ")}</span>
                            {step.latency_ms != null && (
                              <span style={{ marginLeft: "auto", fontSize: 10, color: "#334155" }}>{step.latency_ms}ms</span>
                            )}
                          </div>
                          {payload && (
                            <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", background: "rgba(0,0,0,0.25)", borderRadius: 6, padding: "5px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "pre-wrap", maxHeight: 80, overflowY: "auto" }}>
                              {JSON.stringify(payload, null, 2)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
