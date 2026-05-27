"use client";

import React, { useMemo } from "react";
import { Lightbulb, AlertTriangle, TrendingDown, CheckCircle2, X, Zap } from "lucide-react";
import { type AppNode } from "../store";
import { type Edge } from "@xyflow/react";

// ── Types ────────────────────────────────────────────────────────────────────
export type Recommendation = {
  id:       string;
  type:     "warning" | "tip" | "insight" | "success";
  title:    string;
  detail:   string;
  nodeId?:  string;
};

// ── Analysis engine ──────────────────────────────────────────────────────────
export function analyzeFlow(
  nodes: AppNode[],
  edges: Edge[],
  nodeStats?: { nodeId: string; pct: number; nodeType: string }[],
): Recommendation[] {
  const recs: Recommendation[] = [];
  if (nodes.length === 0) return recs;

  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
  const outDegree: Record<string, number> = {};
  const inDegree:  Record<string, number> = {};
  nodes.forEach(n => { outDegree[n.id] = 0; inDegree[n.id] = 0; });
  edges.forEach(e => { outDegree[e.source] = (outDegree[e.source] ?? 0) + 1; inDegree[e.target] = (inDegree[e.target] ?? 0) + 1; });

  // ── 1. No trigger ────────────────────────────────────────────────────────
  const hasTrigger = nodes.some(n => n.type === "trigger");
  if (!hasTrigger) {
    recs.push({ id: "no_trigger", type: "warning", title: "No trigger node", detail: "Your flow has no entry point. Add a Message Trigger or Keyword Trigger." });
  }

  // ── 2. No end node ──────────────────────────────────────────────────────
  const hasEnd = nodes.some(n => n.type === "end");
  if (!hasEnd) {
    recs.push({ id: "no_end", type: "tip", title: "Missing End node", detail: "Flows without an End node may keep users waiting indefinitely." });
  }

  // ── 3. Condition without fallback ───────────────────────────────────────
  nodes.filter(n => n.type === "condition").forEach(n => {
    const outs = edges.filter(e => e.source === n.id);
    const handles = new Set(outs.map(e => e.sourceHandle));
    if (!handles.has("false") && !handles.has("fallback")) {
      recs.push({ id: `cond_no_fallback_${n.id}`, type: "warning", title: `Condition missing false branch`, detail: `"${(n.data as any)?.label ?? "Condition"}" has no false/fallback path — users hitting this branch will get stuck.`, nodeId: n.id });
    }
  });

  // ── 4. Orphan nodes (not connected to anything) ─────────────────────────
  const orphans = nodes.filter(n => n.type !== "trigger" && inDegree[n.id] === 0 && outDegree[n.id] === 0);
  if (orphans.length > 0) {
    recs.push({ id: "orphans", type: "tip", title: `${orphans.length} disconnected node${orphans.length > 1 ? "s" : ""}`, detail: `${orphans.map(n => (n.data as any)?.label ?? n.type).join(", ")} ${orphans.length > 1 ? "are" : "is"} not connected. Connect or delete them.` });
  }

  // ── 5. No message before handoff ───────────────────────────────────────
  nodes.filter(n => n.type === "handoff").forEach(n => {
    const parents = edges.filter(e => e.target === n.id).map(e => nodeById[e.source]);
    const hasMsg = parents.some(p => p?.type === "standard" || p?.type === "send_buttons");
    if (!hasMsg) {
      recs.push({ id: `handoff_no_msg_${n.id}`, type: "tip", title: "Handoff without prior message", detail: `"${(n.data as any)?.label ?? "Handoff"}" transfers without telling the user. Add a message like "Connecting you to an agent…"`, nodeId: n.id });
    }
  });

  // ── 6. Very long linear chain without condition ────────────────────────
  const conditionCount = nodes.filter(n => n.type === "condition" || n.type === "interruption" || n.type === "intent_routing").length;
  if (nodes.length > 8 && conditionCount === 0) {
    recs.push({ id: "no_branching", type: "tip", title: "No branching logic", detail: `This ${nodes.length}-node flow has no conditions. Consider adding Intent Routing or a Condition node to personalise the experience.` });
  }

  // ── 7. Analytics-driven: high dropoff nodes ────────────────────────────
  if (nodeStats) {
    nodeStats.filter(s => s.pct < 50 && s.pct > 0).slice(0, 2).forEach(s => {
      const node = nodeById[s.nodeId];
      const label = (node?.data as any)?.label ?? s.nodeType;
      recs.push({
        id:     `dropoff_${s.nodeId}`,
        type:   "insight",
        title:  `${label} has ${100 - s.pct}% drop-off`,
        detail: s.nodeType === "intake_form"
          ? `Try reducing required fields or replacing with interactive buttons.`
          : s.nodeType === "send_buttons"
          ? `Users may be ignoring buttons. Try rewording the prompt above them.`
          : `High abandonment here. Consider adding a fallback path or simplifying the step.`,
        nodeId: s.nodeId,
      });
    });
  }

  // ── 8. Healthy flow ─────────────────────────────────────────────────────
  if (recs.length === 0 && nodes.length > 3) {
    recs.push({ id: "healthy", type: "success", title: "Flow looks healthy", detail: "No structural issues found. All branches connected, trigger present, end node set." });
  }

  return recs;
}

// ── Component ─────────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  warning: { icon: AlertTriangle,  color: "#f59e0b", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.18)" },
  tip:     { icon: Lightbulb,      color: "#6366f1", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.18)" },
  insight: { icon: TrendingDown,   color: "#ef4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.18)" },
  success: { icon: CheckCircle2,   color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.18)" },
};

interface Props {
  nodes:      AppNode[];
  edges:      Edge[];
  nodeStats?: { nodeId: string; pct: number; nodeType: string }[];
  onNodeFocus?: (nodeId: string) => void;
  onClose?: () => void;
}

export default function FlowRecommendations({ nodes, edges, nodeStats, onNodeFocus, onClose }: Props) {
  const recs = useMemo(() => analyzeFlow(nodes, edges, nodeStats), [nodes, edges, nodeStats]);

  const warnings = recs.filter(r => r.type === "warning").length;
  const insights = recs.filter(r => r.type === "insight").length;

  return (
    <div style={{
      position: "absolute", bottom: 16, right: 16, zIndex: 40,
      width: 320, maxHeight: 480,
      background: "rgba(10,12,18,0.96)", border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.55)",
      backdropFilter: "blur(20px)", overflow: "hidden",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <Zap size={13} color="#6366f1" />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>Smart Recommendations</span>
        {warnings > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
            {warnings} warning{warnings > 1 ? "s" : ""}
          </span>
        )}
        {insights > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>
            {insights} insight{insights > 1 ? "s" : ""}
          </span>
        )}
        {onClose && (
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 2 }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Rec list */}
      <div style={{ overflowY: "auto", padding: "10px 12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {recs.map(rec => {
          const cfg = TYPE_CONFIG[rec.type];
          const Icon = cfg.icon;
          return (
            <div key={rec.id} style={{
              background: cfg.bg, border: `1px solid ${cfg.border}`,
              borderRadius: 10, padding: "10px 12px",
              cursor: rec.nodeId && onNodeFocus ? "pointer" : "default",
            }}
              onClick={() => rec.nodeId && onNodeFocus?.(rec.nodeId)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <Icon size={12} color={cfg.color} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{rec.title}</span>
              </div>
              <p style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5, margin: 0 }}>{rec.detail}</p>
              {rec.nodeId && onNodeFocus && (
                <div style={{ marginTop: 6, fontSize: 10, color: cfg.color, opacity: 0.8 }}>Click to focus node →</div>
              )}
            </div>
          );
        })}
        {recs.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#1e293b", fontSize: 12 }}>Add nodes to see recommendations</div>
        )}
      </div>
    </div>
  );
}
