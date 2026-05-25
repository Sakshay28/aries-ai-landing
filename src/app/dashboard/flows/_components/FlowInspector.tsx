"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Settings2, Edit3, X, Layers, Code2 } from "lucide-react";
import { useFlowStore } from "../store";
import { NODE_CATEGORY } from "./CustomNodes";

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
  // ── Granular selectors — only scalars, never arrays ─────────────────────────
  const selectedNodeId = useFlowStore(s => s.selectedNodeId);
  const setSelectedNodeId = useFlowStore(s => s.setSelectedNodeId);
  const nodeCount = useFlowStore(s => s.nodes.length);
  const edgeCount = useFlowStore(s => s.edges.length);

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
    // Edge counts at snapshot time
    setInCount(s.edges.filter(e => e.target === selectedNodeId).length);
    setOutCount(s.edges.filter(e => e.source === selectedNodeId).length);
  }, [selectedNodeId]);

  // ── Debounced write to store — canvas does NOT rerender while typing ────────
  const commitField = useCallback((field: string, value: any) => {
    setLocalData(prev => ({ ...prev, [field]: value }));
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      const id = useFlowStore.getState().selectedNodeId;
      if (id) useFlowStore.getState().updateNodeData(id, { [field]: value });
    }, 350);
  }, []);

  // ── Immediate write on blur (ensures nothing is lost) ──────────────────────
  const flushField = useCallback((field: string, value: any) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    const id = useFlowStore.getState().selectedNodeId;
    if (id) useFlowStore.getState().updateNodeData(id, { [field]: value });
  }, []);

  // ── No node selected: show canvas summary ──────────────────────────────────
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
              <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>{nodeCount}</span>
            </div>
            <div className="h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
            <div className="flex items-center justify-between">
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Connections</span>
              <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.7)" }}>{edgeCount}</span>
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
    <div className="w-full flex flex-col h-full overflow-hidden">
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
    </>
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
    return (
      <Field label="Message Content">
        <textarea
          value={(localData.content as string) || ""}
          onChange={e => commitField("content", e.target.value)}
          onBlur={e => flushField("content", e.target.value)}
          rows={5}
          className={INPUT_CLS + " resize-none"}
          placeholder="Type your message here..."
          style={f1.style}
          onFocus={f1.onFocus}
        />
      </Field>
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
          <input type="text" value={(localData.field as string) || ""} onChange={e => commitField("field", e.target.value)} onBlur={e => flushField("field", e.target.value)} className={INPUT_CLS} style={f1.style} onFocus={f1.onFocus} />
        </Field>
        <Field label="Operator">
          <select value={(localData.operator as string) || "=="} onChange={e => commitField("operator", e.target.value)} className={SELECT_CLS} style={INP_STYLE}>
            <option value="==">Equals (==)</option>
            <option value="!=">Not Equals (!=)</option>
            <option value=">">&gt; Greater Than</option>
            <option value="<">&lt; Less Than</option>
          </select>
        </Field>
        <Field label="Target Value">
          <input type="text" value={(localData.value as string) || ""} onChange={e => commitField("value", e.target.value)} onBlur={e => flushField("value", e.target.value)} className={INPUT_CLS} style={f2.style} onFocus={f2.onFocus} />
        </Field>
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
