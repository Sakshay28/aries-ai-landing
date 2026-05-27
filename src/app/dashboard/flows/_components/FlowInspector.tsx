"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Settings2, Edit3, X, Layers, Code2, AlertTriangle } from "lucide-react";
import { useFlowStore } from "../store";
import { NODE_CATEGORY } from "./CustomNodes";
import { getUpstreamButtonsNode, getFlowVariables, validateNode, WA_LIMITS, type FlowVariable } from "../utils";
import { buildVariableRegistry, findUnknownVariables } from "@/lib/flows/variables";
import VariableTextarea from "./VariableTextarea";

// ─── STATIC STYLE CONSTANTS (never recreated in render) ────────────────────────
const INPUT_CLS =
  "w-full rounded-[12px] px-3.5 py-2.5 text-[13px] focus:outline-none focus:ring-0 border";
const SELECT_CLS = INPUT_CLS + " appearance-none";
const INP_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  color: "rgba(255,255,255,0.85)",
};
const INP_FOCUS_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.15)",
  color: "rgba(255,255,255,0.92)",
};
const BTN_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.75)",
  fontSize: 12,
  fontWeight: 500,
  padding: "6px 10px",
  borderRadius: 8,
  cursor: "pointer",
};
const BADGE_STYLE: React.CSSProperties = {
  display: "inline-block",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase" as const,
  padding: "2px 8px",
  borderRadius: 99,
};

type TabId = "general" | "content" | "advanced";

// ─── FIELD WRAPPER ─────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label
        className="text-[10.5px] font-semibold tracking-[0.08em] uppercase"
        style={{ color: "rgba(255,255,255,0.3)" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── HOOKS FOR FOCUS STYLING ───────────────────────────────────────────────────
function useFocusStyle() {
  const [focused, setFocused] = useState(false);
  return {
    style: focused ? INP_FOCUS_STYLE : INP_STYLE,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
// ARCHITECTURE: Subscribe only to selectedNodeId (a string scalar).
// ALL node/edge array state is read imperatively via getState() — never
// subscribed. This means drag position updates (60/sec) do NOT rerender
// this component. Local React state is used for all form fields.
export default function FlowInspector() {
  // ── CRITICAL: Subscribe ONLY to selectedNodeId (a stable string scalar).
  // nodeCount/edgeCount subscriptions were removed — they updated on every
  // drag frame (60x/sec) and caused full inspector rerenders during panning.
  // Canvas summary stats are now read imperatively via getState() once on mount.
  const selectedNodeId = useFlowStore(s => s.selectedNodeId);
  const setSelectedNodeId = useFlowStore(s => s.setSelectedNodeId);

  // ── Canvas summary stats — read once, not subscribed ───────────────────────
  const [canvasStats, setCanvasStats] = useState({ nodes: 0, edges: 0 });
  useEffect(() => {
    if (!selectedNodeId) {
      const s = useFlowStore.getState();
      setCanvasStats({ nodes: s.nodes.length, edges: s.edges.length });
    }
  }, [selectedNodeId]);

  // ── Local state buffer — decoupled from Zustand node array ─────────────────
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [nodeType, setNodeType] = useState("");
  const [nodeIdStr, setNodeIdStr] = useState("");
  const [localData, setLocalData] = useState<Record<string, any>>({});
  const [inCount, setInCount] = useState(0);
  const [outCount, setOutCount] = useState(0);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initialize local state when selected node changes ──────────────────────
  // Only runs when selectedNodeId changes — NOT on every drag frame.
  useEffect(() => {
    if (!selectedNodeId) {
      setLocalData({});
      setNodeType("");
      setNodeIdStr("");
      setInCount(0);
      setOutCount(0);
      return;
    }
    const s = useFlowStore.getState();
    const node = s.nodes.find(n => n.id === selectedNodeId);
    if (!node) return;
    setLocalData({ ...(node.data as Record<string, any>) });
    setNodeType(node.type || "standard");
    setNodeIdStr(node.id);
    setActiveTab("general");
    // Edge counts at snapshot time — imperative read, not subscription
    setInCount(s.edges.filter(e => e.target === selectedNodeId).length);
    setOutCount(s.edges.filter(e => e.source === selectedNodeId).length);
  }, [selectedNodeId]);

  // ── Debounced write to store — canvas does NOT rerender while typing ────────
  // 200ms debounce: fast enough to feel instant, long enough to batch keystrokes.
  const commitField = useCallback((field: string, value: any) => {
    setLocalData(prev => ({ ...prev, [field]: value }));
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      const id = useFlowStore.getState().selectedNodeId;
      if (id) useFlowStore.getState().updateNodeData(id, { [field]: value });
    }, 200);
  }, []);

  // ── Immediate write on blur (ensures nothing is lost) ──────────────────────
  const flushField = useCallback((field: string, value: any) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    const id = useFlowStore.getState().selectedNodeId;
    if (id) useFlowStore.getState().updateNodeData(id, { [field]: value });
  }, []);

  // ── No node selected: show canvas summary (stats from snapshot, not live sub) 
  if (!selectedNodeId) {
    return (
      <div className="w-full flex flex-col h-full overflow-hidden">
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5 mb-6">
            <Settings2 className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.25)" }} />
            <h2 className="text-[12.5px] font-semibold" style={{ color: "rgba(255,255,255,0.45)" }}>
              Inspector
            </h2>
          </div>
          <div
            className="rounded-[14px] p-4 space-y-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Total Nodes</span>
              <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>{canvasStats.nodes}</span>
            </div>
            <div className="h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Connections</span>
              <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>{canvasStats.edges}</span>
            </div>
            <div className="h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Status</span>
              <span className="text-[11.5px] font-semibold" style={{ color: "rgba(52,211,153,0.85)" }}>Ready</span>
            </div>
          </div>
          <div
            className="mt-5 rounded-[14px] p-4"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
          >
            <p className="text-[11.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.22)" }}>
              Click a node on the canvas to configure its properties.
            </p>
            <p className="text-[10px] mt-2.5 leading-relaxed" style={{ color: "rgba(255,255,255,0.14)" }}>
              F — fit view · Del — delete · ⌘D — duplicate · ⌘C/V — copy/paste
            </p>
          </div>
        </div>
      </div>
    );
  }

  const cat = NODE_CATEGORY[nodeType as keyof typeof NODE_CATEGORY] || {
    color: "#3b82f6",
    label: "NODE",
  };

  const TABS = [
    { id: "general" as TabId, label: "General", icon: <Layers className="w-3 h-3" /> },
    { id: "content" as TabId, label: "Content", icon: <Edit3 className="w-3 h-3" /> },
    { id: "advanced" as TabId, label: "Advanced", icon: <Code2 className="w-3 h-3" /> },
  ];

  return (
    <div className="w-full flex flex-col h-full overflow-hidden" style={{ animation: 'inspectorIn 0.15s cubic-bezier(0.16,1,0.3,1) both' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-[9px] flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${cat.color}22 0%, ${cat.color}0a 100%)`,
                border: `1px solid ${cat.color}30`,
              }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
            </div>
            <div>
              <h2 className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>
                Configure
              </h2>
              <p className="text-[10px] mt-0.5" style={{ color: cat.color + "bb" }}>{cat.label}</p>
            </div>
          </div>
          <button
            onClick={() => setSelectedNodeId(null)}
            className="p-1.5 rounded-lg"
            style={{ color: "rgba(255,255,255,0.25)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex p-1 rounded-[14px]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-[10px] text-[11.5px] font-medium"
              style={{
                background: activeTab === tab.id ? "rgba(255,255,255,0.09)" : "transparent",
                color: activeTab === tab.id ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
                boxShadow: activeTab === tab.id ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
                transition: "background 0.12s, color 0.12s",
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px mx-5 mt-4" style={{ background: "rgba(255,255,255,0.05)" }} />

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {activeTab === "general" && (
          <GeneralTab
            localData={localData}
            nodeType={nodeType}
            nodeIdStr={nodeIdStr}
            cat={cat}
            commitField={commitField}
            flushField={flushField}
          />
        )}
        {activeTab === "content" && (
          <ContentTab
            nodeType={nodeType}
            localData={localData}
            commitField={commitField}
            flushField={flushField}
          />
        )}
        {activeTab === "advanced" && (
          <AdvancedTab
            nodeIdStr={nodeIdStr}
            inCount={inCount}
            outCount={outCount}
          />
        )}
      </div>
    </div>
  );
}

// ─── GENERAL TAB ───────────────────────────────────────────────────────────────
function GeneralTab({
  localData, nodeType, nodeIdStr, cat, commitField, flushField,
}: {
  localData: Record<string, any>;
  nodeType: string;
  nodeIdStr: string;
  cat: { color: string; label: string };
  commitField: (field: string, value: any) => void;
  flushField: (field: string, value: any) => void;
}) {
  const focus = useFocusStyle();
  return (
    <>
      <Field label="Node Name">
        <input
          type="text"
          value={(localData.label as string) || ""}
          onChange={e => commitField("label", e.target.value)}
          onBlur={e => flushField("label", e.target.value)}
          className={INPUT_CLS}
          style={focus.style}
          onFocus={focus.onFocus}
          placeholder="Node name..."
        />
      </Field>
      <Field label="Type">
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[12px]"
          style={{ background: `${cat.color}12`, border: `1px solid ${cat.color}25` }}
        >
          <span className="text-[12px] font-bold tracking-wide" style={{ color: cat.color }}>{cat.label}</span>
          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>{nodeType}</span>
        </div>
      </Field>
      <Field label="Node ID">
        <div
          className="px-3.5 py-2.5 rounded-[12px] text-[11px] font-mono select-all"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.28)" }}
        >
          {nodeIdStr}
        </div>
      </Field>
      <NodeValidationDisplay nodeId={nodeIdStr} />
    </>
  );
}

// ─── VARIABLE HINT (shows available variables) ──────────────────────────────
function VariableHint() {
  const [expanded, setExpanded] = React.useState(false);
  const vars = React.useMemo(() => {
    const { nodes } = useFlowStore.getState();
    return getFlowVariables(nodes);
  }, []);
  if (vars.length === 0) return null;
  return (
    <div className="rounded-[12px] overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <button onClick={() => setExpanded(v => !v)} className="w-full flex items-center justify-between px-3 py-2 text-left" style={{ color: "rgba(255,255,255,0.3)" }}>
        <span className="text-[10.5px] font-semibold tracking-[0.06em] uppercase">Available Variables ({vars.length})</span>
        <span className="text-[10px]">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {vars.map((v, i) => (
            <div key={`${v.name}-${i}`} className="flex items-center justify-between py-0.5">
              <code className="text-[10.5px] font-mono" style={{ color: "rgba(52,211,153,0.8)" }}>{`{{${v.name}}}`}</code>
              <span className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.18)" }}>{v.source}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── NODE VALIDATION DISPLAY ─────────────────────────────────────────────────
function NodeValidationDisplay({ nodeId }: { nodeId: string }) {
  const validation = React.useMemo(() => {
    const { nodes, edges } = useFlowStore.getState();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return null;
    return validateNode(node, nodes, edges);
  }, [nodeId]);
  if (!validation || validation.status === 'ok') return null;
  return (
    <div className="space-y-1.5">
      {validation.issues.map((issue, i) => (
        <div key={i} className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg" style={{
          background: issue.severity === 'error' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
          border: `1px solid ${issue.severity === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)'}`,
        }}>
          <span className="text-[10px] mt-0.5">{issue.severity === 'error' ? '🔴' : '🟡'}</span>
          <span className="text-[10.5px]" style={{ color: issue.severity === 'error' ? '#f87171' : '#fbbf24' }}>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── CONTENT TAB ───────────────────────────────────────────────────────────────
function ContentTab({
  nodeType, localData, commitField, flushField,
}: {
  nodeType: string;
  localData: Record<string, any>;
  commitField: (field: string, value: any) => void;
  flushField: (field: string, value: any) => void;
}) {
  const f1 = useFocusStyle();
  const f2 = useFocusStyle();
  const f3 = useFocusStyle();

  if (nodeType === "trigger" || nodeType === "keyword_trigger") {
    return (
      <>
        <Field label="Trigger Type">
          <select
            value={(localData.triggerType as string) || "keyword"}
            onChange={e => commitField("triggerType", e.target.value)}
            className={SELECT_CLS}
            style={INP_STYLE}
          >
            <option value="keyword">Keyword Match</option>
            <option value="first_message">First Message (any)</option>
            <option value="all_messages">All Messages</option>
          </select>
        </Field>
        {((localData.triggerType as string) || "keyword") === "keyword" && (
          <Field label="Keywords">
            <input
              type="text"
              value={(localData.keywords as string) || ""}
              onChange={e => commitField("keywords", e.target.value)}
              onBlur={e => flushField("keywords", e.target.value)}
              placeholder="book, appointment, price"
              className={INPUT_CLS}
              style={f1.style}
              onFocus={f1.onFocus}
            />
            <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.2)" }}>
              Comma-separated. Any match activates the flow.
            </p>
          </Field>
        )}
      </>
    );
  }

  if (nodeType === "standard") {
    const contentVal = (localData.content as string) || "";
    const contentLen = contentVal.length;
    const overMsgLimit = contentLen > WA_LIMITS.MESSAGE_LENGTH;
    const allVars = buildVariableRegistry(useFlowStore.getState().nodes);
    const allVarNames = new Set(allVars.map(v => v.name));
    const unknownVars = findUnknownVariables(contentVal, allVarNames);
    return (
      <>
        <Field label="Message Content">
          <VariableTextarea
            value={contentVal}
            onChange={val => { commitField("content", val); flushField("content", val); }}
            variables={allVars}
            placeholder="Type your message... Use {{ to insert variables"
            rows={5}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.18)" }}>{contentLen}/{WA_LIMITS.MESSAGE_LENGTH}</span>
            {overMsgLimit && <span className="text-[10px]" style={{ color: "#f87171" }}>⚠ Over limit</span>}
          </div>
        </Field>
        {unknownVars.length > 0 && (
          <div className="rounded-xl px-3 py-2.5 space-y-1" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3 h-3 text-amber-400" />
              <span className="text-[10.5px] font-semibold text-amber-400">Unknown variables</span>
            </div>
            {unknownVars.map(name => (
              <p key={name} className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <code className="font-mono text-amber-300">{`{{${name}}}`}</code> — not defined in this flow
              </p>
            ))}
          </div>
        )}
        <VariableHint />
      </>
    );
  }

  if (nodeType === "send_media" || nodeType === "send_audio") {
    return (
      <>
        <Field label="Media Type">
          <select
            value={(localData.mediaType as string) || (nodeType === "send_audio" ? "audio" : "image")}
            onChange={e => commitField("mediaType", e.target.value)}
            className={SELECT_CLS}
            style={INP_STYLE}
          >
            <option value="image">Image (JPG / PNG / WebP)</option>
            <option value="video">Video (MP4)</option>
            <option value="audio">Audio (MP3 / OGG)</option>
            <option value="file">File / Document (PDF)</option>
          </select>
        </Field>
        <Field label="Media URL">
          <input type="url" value={(localData.mediaUrl as string) || ""} onChange={e => commitField("mediaUrl", e.target.value)} onBlur={e => flushField("mediaUrl", e.target.value)} placeholder="https://cdn.example.com/image.jpg" className={INPUT_CLS} style={f1.style} onFocus={f1.onFocus} />
        </Field>
        <Field label="Caption">
          <input type="text" value={(localData.caption as string) || ""} onChange={e => commitField("caption", e.target.value)} onBlur={e => flushField("caption", e.target.value)} placeholder="Optional caption..." className={INPUT_CLS} style={f2.style} onFocus={f2.onFocus} />
        </Field>
      </>
    );
  }

  if (nodeType === "interruption") {
    return (
      <>
        <Field label="User Query Trigger">
          <input type="text" value={(localData.userQuery as string) || ""} onChange={e => commitField("userQuery", e.target.value)} onBlur={e => flushField("userQuery", e.target.value)} className={INPUT_CLS} style={f1.style} onFocus={f1.onFocus} />
        </Field>
        <Field label="AI Auto-Response">
          <textarea value={(localData.aiResponse as string) || ""} onChange={e => commitField("aiResponse", e.target.value)} onBlur={e => flushField("aiResponse", e.target.value)} rows={3} className={INPUT_CLS + " resize-none"} style={f2.style} onFocus={f2.onFocus} />
        </Field>
      </>
    );
  }

  if (nodeType === "condition") {
    return (
      <>
        <Field label="Variable Field">
          <input type="text" value={(localData.field as string) || ""} onChange={e => commitField("field", e.target.value)} onBlur={e => flushField("field", e.target.value)} placeholder="e.g., guest_count, intent, status" className={INPUT_CLS} style={f1.style} onFocus={f1.onFocus} />
        </Field>
        <Field label="Operator">
          <select value={(localData.operator as string) || "=="} onChange={e => commitField("operator", e.target.value)} className={SELECT_CLS} style={INP_STYLE}>
            <option value="==">Equals (==)</option>
            <option value="!=">Not Equals (!=)</option>
            <option value=">">Greater Than (&gt;)</option>
            <option value="<">Less Than (&lt;)</option>
            <option value=">=">Greater Than or Equal (&gt;=)</option>
            <option value="<=">Less Than or Equal (&lt;=)</option>
            <option value="contains">Contains (text)</option>
            <option value="startsWith">Starts With</option>
            <option value="endsWith">Ends With</option>
            <option value="exists">Exists / Not Null</option>
            <option value="empty">Empty / Null</option>
          </select>
        </Field>
        {((localData.operator as string) || "==") !== "exists" && ((localData.operator as string) || "==") !== "empty" && (
          <Field label="Target Value">
            <input type="text" value={(localData.value as string) || ""} onChange={e => commitField("value", e.target.value)} onBlur={e => flushField("value", e.target.value)} placeholder="Compare against..." className={INPUT_CLS} style={f2.style} onFocus={f2.onFocus} />
          </Field>
        )}
      </>
    );
  }

  if (nodeType === "webhook") {
    return (
      <>
        <Field label="Method">
          <select value={(localData.method as string) || "POST"} onChange={e => commitField("method", e.target.value)} className={SELECT_CLS} style={INP_STYLE}>
            <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
          </select>
        </Field>
        <Field label="Endpoint URL">
          <input type="url" value={(localData.url as string) || ""} onChange={e => commitField("url", e.target.value)} onBlur={e => flushField("url", e.target.value)} placeholder="https://api..." className={INPUT_CLS} style={f1.style} onFocus={f1.onFocus} />
        </Field>
      </>
    );
  }

  if (nodeType === "delay") {
    return (
      <Field label="Delay (seconds)">
        <input type="number" min="1" value={(localData.duration as string) || "2"} onChange={e => commitField("duration", e.target.value)} onBlur={e => flushField("duration", e.target.value)} className={INPUT_CLS} style={f1.style} onFocus={f1.onFocus} />
      </Field>
    );
  }

  if (nodeType === "handoff") {
    return (
      <Field label="Assign to Team">
        <select value={(localData.team as string) || "Support Team"} onChange={e => commitField("team", e.target.value)} className={SELECT_CLS} style={INP_STYLE}>
          <option>Support Team</option><option>Sales Team</option><option>Billing Team</option>
        </select>
      </Field>
    );
  }

  if (nodeType === "knowledge") {
    return (
      <Field label="Knowledge Source">
        <select value={(localData.source as string) || "Help Center Docs"} onChange={e => commitField("source", e.target.value)} className={SELECT_CLS} style={INP_STYLE}>
          <option>Help Center Docs</option><option>Pricing Policies</option><option>Internal Knowledge Base</option>
        </select>
      </Field>
    );
  }

  if (nodeType === "send_buttons") {
    const buttons: any[] = Array.isArray(localData.buttons) ? localData.buttons : [];
    return <InteractiveButtonsConfig localData={localData} commitField={commitField} flushField={flushField} />;
  }

  if (nodeType === "button_trigger") {
    const state = useFlowStore.getState();
    const selectedId = state.selectedNodeId;
    const upstreamBtns = selectedId ? getUpstreamButtonsNode(selectedId, state.nodes, state.edges) : null;
    const availableButtons: any[] = upstreamBtns && Array.isArray((upstreamBtns.data as any)?.buttons) ? (upstreamBtns.data as any).buttons : [];
    const isSpecific = ((localData.mode as string) || "specific") === "specific";
    return (
      <>
        <Field label="Listening Mode">
          <select value={(localData.mode as string) || "specific"} onChange={e => commitField("mode", e.target.value)} className={SELECT_CLS} style={INP_STYLE}>
            <option value="specific">Specific Button</option>
            <option value="any">Any Button Click</option>
          </select>
        </Field>
        {isSpecific && availableButtons.length > 0 && (
          <Field label="Select Button">
            <select value={(localData.button as string) || ""} onChange={e => commitField("button", e.target.value)} className={SELECT_CLS} style={INP_STYLE}>
              <option value="">— Select a button —</option>
              {availableButtons.map((b: any) => (
                <option key={b.id || b.value} value={b.value || b.id}>{b.label} ({b.value || b.id})</option>
              ))}
            </select>
            <p className="text-[10px] mt-1.5" style={{ color: "rgba(52,211,153,0.6)" }}>Auto-populated from upstream Interactive Buttons node.</p>
          </Field>
        )}
        {isSpecific && availableButtons.length === 0 && (
          <Field label="Button Value">
            <input type="text" value={(localData.button as string) || ""} onChange={e => commitField("button", e.target.value)} onBlur={e => flushField("button", e.target.value)} placeholder="e.g., opt_1" className={INPUT_CLS} style={f1.style} onFocus={f1.onFocus} />
            <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.15)" }}>
              <span className="text-[10px]" style={{ color: "#f59e0b" }}>⚠ No upstream Interactive Buttons node found. Connect one to auto-populate options.</span>
            </div>
          </Field>
        )}
      </>
    );
  }

  if (nodeType === "intent_routing") {
    return <IntentRoutingConfig localData={localData} commitField={commitField} flushField={flushField} />;
  }

  if (nodeType === "intake_form") {
    return <IntakeFormConfig localData={localData} commitField={commitField} flushField={flushField} />;
  }

  if (nodeType === "collect_data") {
    return <FormFieldListConfig localData={localData} commitField={commitField} flushField={flushField} />;
  }

  return (
    <div
      className="rounded-[12px] p-4"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
    >
      <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.28)" }}>
        No additional configuration for this node type.
      </p>
    </div>
  );
}

// ─── ADVANCED TAB ──────────────────────────────────────────────────────────────
function AdvancedTab({
  nodeIdStr, inCount, outCount,
}: {
  nodeIdStr: string;
  inCount: number;
  outCount: number;
}) {
  return (
    <>
      <Field label="Connections">
        <div
          className="rounded-[12px] p-3.5 space-y-2.5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>Incoming</span>
            <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.75)" }}>{inCount}</span>
          </div>
          <div className="h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
          <div className="flex items-center justify-between">
            <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>Outgoing</span>
            <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.75)" }}>{outCount}</span>
          </div>
        </div>
      </Field>
      <Field label="Node ID">
        <div
          className="px-3.5 py-2.5 rounded-[12px] text-[11px] font-mono select-all"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.28)" }}
        >
          {nodeIdStr}
        </div>
      </Field>
    </>
  );
}

// ─── CONFIG COMPONENT: INTERACTIVE BUTTONS ───────────────────────────────────
function InteractiveButtonsConfig({ localData, commitField, flushField }: { localData: Record<string, any>; commitField: (f: string, v: any) => void; flushField: (f: string, v: any) => void }) {
  const buttons: any[] = Array.isArray(localData.buttons) ? localData.buttons : [];
  const f1 = useFocusStyle();
  const overLimit = buttons.length > WA_LIMITS.REPLY_BUTTONS_MAX;

  const addButton = () => {
    const next = [...buttons, { id: `btn_${Date.now()}`, label: "New Button", value: `opt_${buttons.length + 1}` }];
    commitField("buttons", next);
  };
  const updateButton = (idx: number, key: string, val: any) => {
    const next = buttons.map((b, i) => (i === idx ? { ...b, [key]: val } : b));
    commitField("buttons", next);
  };
  const removeButton = (idx: number) => {
    const next = buttons.filter((_, i) => i !== idx);
    commitField("buttons", next);
  };

  return (
    <>
      <Field label="Message Text">
        <VariableTextarea
          value={(localData.message as string) || ""}
          onChange={val => { commitField("message", val); flushField("message", val); }}
          variables={buildVariableRegistry(useFlowStore.getState().nodes)}
          placeholder="How many guests? Use {{ to insert variables"
          rows={3}
        />
      </Field>
      <Field label="Routing Mode">
        <select value={(localData.routingMode as string) || "split"} onChange={e => commitField("routingMode", e.target.value)} className={SELECT_CLS} style={INP_STYLE}>
          <option value="split">Split Path Per Button (each button → own route)</option>
          <option value="continue">Continue Same Path (all buttons → one route)</option>
        </select>
      </Field>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10.5px] font-semibold tracking-[0.08em] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>
            Buttons <span style={{ color: overLimit ? "#ef4444" : "rgba(255,255,255,0.2)" }}>({buttons.length}/{WA_LIMITS.REPLY_BUTTONS_MAX})</span>
          </label>
          <button onClick={addButton} style={BTN_STYLE}>+ Add Button</button>
        </div>
        {overLimit && (
          <div className="mb-2 px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}>
            <span className="text-[10px] font-medium" style={{ color: "#f87171" }}>⚠ WhatsApp allows max {WA_LIMITS.REPLY_BUTTONS_MAX} reply buttons. Reduce to publish.</span>
          </div>
        )}
        <div className="space-y-2">
          {buttons.map((b, i) => (
            <div key={b.id} className="rounded-[12px] p-3 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>Button {i + 1}</span>
                <button onClick={() => removeButton(i)} style={{ ...BTN_STYLE, fontSize: 10, padding: "3px 8px", opacity: 0.8 }}>Remove</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={b.label || ""} onChange={e => updateButton(i, "label", e.target.value)} placeholder="Label (visible)" className={INPUT_CLS} style={INP_STYLE} maxLength={WA_LIMITS.BUTTON_LABEL_MAX} />
                <input type="text" value={b.value || ""} onChange={e => updateButton(i, "value", e.target.value)} placeholder="Value (internal)" className={INPUT_CLS} style={INP_STYLE} />
              </div>
              {b.label && b.label.length > WA_LIMITS.BUTTON_LABEL_MAX - 3 && (
                <p className="text-[9px]" style={{ color: "#f59e0b" }}>{b.label.length}/{WA_LIMITS.BUTTON_LABEL_MAX} chars</p>
              )}
            </div>
          ))}
          {buttons.length === 0 && <p className="text-[11px] py-2" style={{ color: "rgba(255,255,255,0.3)" }}>No buttons. Click Add Button.</p>}
        </div>
      </div>
      {/* WhatsApp Preview */}
      {(localData.message || buttons.length > 0) && (
        <div className="mt-3">
          <label className="text-[10.5px] font-semibold tracking-[0.08em] uppercase mb-2 block" style={{ color: "rgba(255,255,255,0.3)" }}>WhatsApp Preview</label>
          <div className="rounded-[16px] p-3" style={{ background: "#202C33" }}>
            <div className="rounded-[12px] px-3 py-2" style={{ background: "#005C4B" }}>
              <p className="text-[13px] leading-relaxed" style={{ color: "#E9EDEF" }}>{localData.message || "Your message here..."}</p>
            </div>
            <div className="mt-2 space-y-1.5">
              {buttons.slice(0, WA_LIMITS.REPLY_BUTTONS_MAX).map((b: any, i: number) => (
                <div key={b.id || i} className="text-center py-2 rounded-lg text-[13px] font-medium" style={{ background: "rgba(255,255,255,0.06)", color: "#53bdeb", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {b.label || `Option ${i + 1}`}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── CONFIG COMPONENT: INTENT ROUTING ────────────────────────────────────────
function IntentRoutingConfig({ localData, commitField, flushField }: { localData: Record<string, any>; commitField: (f: string, v: any) => void; flushField: (f: string, v: any) => void }) {
  const intents: any[] = Array.isArray(localData.intents) ? localData.intents : [];
  const f1 = useFocusStyle();

  const addIntent = () => {
    const next = [...intents, { id: `intent_${Date.now()}`, name: "New Intent", keywords: ["keyword"] }];
    commitField("intents", next);
  };
  const updateIntentName = (idx: number, val: string) => {
    const next = intents.map((it, i) => (i === idx ? { ...it, name: val } : it));
    commitField("intents", next);
  };
  const updateIntentKeywords = (idx: number, val: string) => {
    const next = intents.map((it, i) => (i === idx ? { ...it, keywords: val.split(",").map((s: string) => s.trim()).filter(Boolean) } : it));
    commitField("intents", next);
  };
  const removeIntent = (idx: number) => {
    const next = intents.filter((_, i) => i !== idx);
    commitField("intents", next);
  };

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10.5px] font-semibold tracking-[0.08em] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Intents</label>
          <button onClick={addIntent} style={BTN_STYLE}>+ Add Intent</button>
        </div>
        <div className="space-y-2">
          {intents.map((it, i) => (
            <div key={it.id || i} className="rounded-[12px] p-3 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center justify-between">
                <input type="text" value={it.name || ""} onChange={e => updateIntentName(i, e.target.value)} placeholder="Intent Name" className={INPUT_CLS} style={{ ...INP_STYLE, flex: 1 }} />
                <button onClick={() => removeIntent(i)} style={{ ...BTN_STYLE, fontSize: 10, padding: "3px 8px", opacity: 0.8, marginLeft: 8 }}>Remove</button>
              </div>
              <Field label="Keywords (comma separated)">
                <input type="text" value={(it.keywords || []).join(", ")} onChange={e => updateIntentKeywords(i, e.target.value)} placeholder="book, reserve, schedule" className={INPUT_CLS} style={f1.style} onFocus={f1.onFocus} />
              </Field>
              <p className="text-[9.5px]" style={{ color: "rgba(255,255,255,0.22)" }}>Output handle: {it.name || "unnamed"}</p>
            </div>
          ))}
          {intents.length === 0 && <p className="text-[11px] py-2" style={{ color: "rgba(255,255,255,0.3)" }}>No intents. Click Add Intent.</p>}
        </div>
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Confidence Threshold">
          <div className="flex items-center gap-3">
            <input type="range" min="0" max="100" step="5" value={Math.round(((localData.confidenceThreshold as number) ?? 0.7) * 100)} onChange={e => commitField("confidenceThreshold", parseInt(e.target.value) / 100)} className="flex-1 accent-purple-500" style={{ height: 4 }} />
            <span className="text-[12px] font-semibold w-10 text-right" style={{ color: "rgba(255,255,255,0.65)" }}>{Math.round(((localData.confidenceThreshold as number) ?? 0.7) * 100)}%</span>
          </div>
          <p className="text-[9.5px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>Below this threshold, message goes to fallback route.</p>
        </Field>
        <Field label="Fallback Message">
          <input type="text" value={(localData.fallbackMessage as string) || ""} onChange={e => commitField("fallbackMessage", e.target.value)} placeholder="Sorry, I didn't understand. Could you rephrase?" className={INPUT_CLS} style={INP_STYLE} />
        </Field>
        <div className="px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.12)" }}>
          <p className="text-[10px]" style={{ color: "rgba(139,92,246,0.7)" }}>All intent routing nodes include a "fallback" output for unmatched intents.</p>
        </div>
      </div>
    </>
  );
}

// ─── CONFIG COMPONENT: INTAKE FORM ───────────────────────────────────────────
function IntakeFormConfig({ localData, commitField, flushField }: { localData: Record<string, any>; commitField: (f: string, v: any) => void; flushField: (f: string, v: any) => void }) {
  const fields: any[] = Array.isArray(localData.fields) ? localData.fields : [];

  const addField = () => {
    const next = [...fields, { id: `f_${Date.now()}`, name: "New Field", type: "text", required: true, saveAs: "", placeholder: "", errorMessage: "" }];
    commitField("fields", next);
  };
  const updateField = (idx: number, key: string, val: any) => {
    const next = fields.map((f, i) => (i === idx ? { ...f, [key]: val } : f));
    commitField("fields", next);
  };
  const removeField = (idx: number) => {
    const next = fields.filter((_, i) => i !== idx);
    commitField("fields", next);
  };

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10.5px] font-semibold tracking-[0.08em] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Form Fields</label>
          <button onClick={addField} style={BTN_STYLE}>+ Add Field</button>
        </div>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={f.id || i} className="rounded-[12px] p-3 space-y-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2">
                <input type="text" value={f.name || ""} onChange={e => updateField(i, "name", e.target.value)} placeholder="Field Name" className={INPUT_CLS} style={{ ...INP_STYLE, flex: 1 }} />
                <select value={f.type || "text"} onChange={e => updateField(i, "type", e.target.value)} className={SELECT_CLS} style={{ ...INP_STYLE, width: 110 }}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="time">Time</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="dropdown">Dropdown</option>
                </select>
                <button onClick={() => removeField(i)} style={{ ...BTN_STYLE, fontSize: 10, padding: "3px 8px", opacity: 0.8 }}>×</button>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input type="checkbox" checked={f.required !== false} onChange={e => updateField(i, "required", e.target.checked)} className="accent-emerald-500 w-3.5 h-3.5" />
                  <span className="text-[10.5px] font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Required</span>
                </label>
              </div>
              <input type="text" value={f.saveAs || ""} onChange={e => updateField(i, "saveAs", e.target.value)} placeholder={`Save as: ${f.name?.toLowerCase().replace(/\s+/g, '_') || 'variable_name'}`} className={INPUT_CLS} style={{ ...INP_STYLE, fontSize: 11 }} />
              <input type="text" value={f.placeholder || ""} onChange={e => updateField(i, "placeholder", e.target.value)} placeholder="Prompt text: e.g., What's your name?" className={INPUT_CLS} style={{ ...INP_STYLE, fontSize: 11 }} />
              <input type="text" value={f.errorMessage || ""} onChange={e => updateField(i, "errorMessage", e.target.value)} placeholder="Error: e.g., Please enter a valid email" className={INPUT_CLS} style={{ ...INP_STYLE, fontSize: 11 }} />
            </div>
          ))}
          {fields.length === 0 && <p className="text-[11px] py-2" style={{ color: "rgba(255,255,255,0.3)" }}>No fields. Click Add Field.</p>}
        </div>
      </div>
      <div className="mt-3 px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)" }}>
        <p className="text-[10px]" style={{ color: "rgba(245,158,11,0.7)" }}>Each field is saved as a variable. Use <code className="font-mono">{"{{variable_name}}"}</code> in downstream messages.</p>
      </div>
    </>
  );
}

// ─── CONFIG COMPONENT: FORM FIELD LIST (for collect_data) ────────────────────
function FormFieldListConfig({ localData, commitField, flushField }: { localData: Record<string, any>; commitField: (f: string, v: any) => void; flushField: (f: string, v: any) => void }) {
  const fields: string[] = Array.isArray(localData.fields) ? localData.fields : [];

  const addField = () => {
    const next = [...fields, "New Field"];
    commitField("fields", next);
  };
  const updateField = (idx: number, val: string) => {
    const next = fields.map((f, i) => (i === idx ? val : f));
    commitField("fields", next);
  };
  const removeField = (idx: number) => {
    const next = fields.filter((_, i) => i !== idx);
    commitField("fields", next);
  };

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10.5px] font-semibold tracking-[0.08em] uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>Fields to Collect</label>
          <button onClick={addField} style={BTN_STYLE}>+ Add Field</button>
        </div>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="text" value={f} onChange={e => updateField(i, e.target.value)} placeholder="Field name" className={INPUT_CLS} style={{ ...INP_STYLE, flex: 1 }} />
              <button onClick={() => removeField(i)} style={{ ...BTN_STYLE, fontSize: 10, padding: "3px 8px", opacity: 0.8 }}>×</button>
            </div>
          ))}
          {fields.length === 0 && <p className="text-[11px] py-2" style={{ color: "rgba(255,255,255,0.3)" }}>No fields. Click Add Field.</p>}
        </div>
      </div>
    </>
  );
}
