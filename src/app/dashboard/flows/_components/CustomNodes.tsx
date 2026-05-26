"use client";

import React from "react";
import { Handle, Position } from "@xyflow/react";
import {
  Sparkles, MessageSquare, SplitSquareVertical, Webhook,
  Clock, UserCheck, BookOpen, XCircle, Database,
  PlayCircle, Code2, Paintbrush, Hourglass, FileText,
  ListChecks, Zap, MoreVertical,
} from "lucide-react";
import { useFlowStore } from "../store";

export { Position };

// ─── NODE CATEGORY (used by FlowCanvas minimap) ───────────────────────────────
export const NODE_CATEGORY: Record<string, { color: string; label: string }> = {
  trigger:       { color: '#3B82F6', label: 'TRIGGER' },
  standard:      { color: '#10B981', label: 'MESSAGE' },
  condition:     { color: '#F59E0B', label: 'CONDITION' },
  interruption:  { color: '#8B5CF6', label: 'AI REPLY' },
  delay:         { color: '#6366F1', label: 'DELAY' },
  handoff:       { color: '#EC4899', label: 'HANDOFF' },
  webhook:       { color: '#06B6D4', label: 'WEBHOOK' },
  knowledge:     { color: '#A855F7', label: 'KNOWLEDGE' },
  end:           { color: '#EF4444', label: 'END' },
  extract:       { color: '#14B8A6', label: 'EXTRACT' },
  format:        { color: '#0EA5E9', label: 'FORMAT' },
  memory:        { color: '#8B5CF6', label: 'MEMORY' },
  wait:          { color: '#64748B', label: 'WAIT' },
  resume:        { color: '#22C55E', label: 'RESUME' },
  resume_parser: { color: '#10B981', label: 'PARSER' },
  collect_data:  { color: '#F59E0B', label: 'COLLECT' },
};

// ─── DELETE BUTTON ────────────────────────────────────────────────────────────
function DeleteBtn({ id }: { id: string }) {
  return (
    <button
      className="nodrag nopan"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        const { nodes, edges, saveHistory } = useFlowStore.getState();
        saveHistory();
        useFlowStore.setState({
          nodes: nodes.filter((n) => n.id !== id),
          edges: edges.filter((ed) => ed.source !== id && ed.target !== id),
          selectedNodeId: null,
        });
      }}
      title="Delete"
      style={{
        background: "rgba(255,255,255,0.18)",
        border: "none",
        borderRadius: 6,
        width: 26,
        height: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: "white",
        flexShrink: 0,
        outline: "none",
      }}
    >
      <MoreVertical size={12} />
    </button>
  );
}

// ─── CARD (visual shell only — no handles inside) ────────────────────────────
// Handles are placed OUTSIDE this component, as siblings at the node root level.
interface CardProps {
  id: string;
  selected?: boolean;
  color: string;
  Icon: React.ElementType;
  title: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

function Card({ id, selected, color, Icon, title, children, footer }: CardProps) {
  const hasBody = Boolean(children);
  const hasFooter = Boolean(footer);
  return (
    <div
      style={{
        borderRadius: 14,
        border: selected ? `2px solid ${color}` : "1.5px solid #e2e8f0",
        boxShadow: selected
          ? `0 0 0 4px ${color}18, 0 8px 28px rgba(0,0,0,0.2)`
          : "0 2px 10px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, sans-serif",
        transition: "box-shadow 0.15s ease, border-color 0.15s ease",
        background: "#fff",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: color,
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 10px 0 12px",
        }}
      >
        <div
          style={{
            width: 27,
            height: 27,
            borderRadius: 8,
            background: "rgba(255,255,255,0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={14} color="white" />
        </div>
        <span
          style={{
            color: "white",
            fontWeight: 600,
            fontSize: 13,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        <DeleteBtn id={id} />
      </div>

      {/* Body */}
      {hasBody && (
        <div
          style={{
            padding: "10px 14px",
            background: "#fff",
            borderBottom: hasFooter ? "1px solid #f1f5f9" : undefined,
          }}
        >
          {children}
        </div>
      )}

      {/* Footer (output labels) */}
      {hasFooter && (
        <div style={{ background: "#fafafa", padding: "6px 14px 8px" }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// ─── BODY HELPERS ─────────────────────────────────────────────────────────────

function Preview({ text }: { text: string }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 12.5,
        color: "#475569",
        lineHeight: 1.5,
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
      }}
    >
      {text}
    </p>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 9px",
        borderRadius: 7,
        background: `${color}12`,
        border: `1px solid ${color}30`,
        fontSize: 11,
        fontWeight: 600,
        color,
      }}
    >
      {label}
    </span>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: "#94a3b8" }}>{k}</span>
      <span style={{ fontSize: 11.5, fontWeight: 500, color: "#334155" }}>{v}</span>
    </div>
  );
}

function OutLabels({ items }: { items: Array<{ label: string; color: string; dir: string }> }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 4 }}>
      {items.map((it, i) => (
        <span key={i} style={{ fontSize: 10, fontWeight: 700, color: it.color, letterSpacing: "0.04em" }}>
          {it.label} {it.dir}
        </span>
      ))}
    </div>
  );
}

// ─── NODE ROOT WRAPPER ────────────────────────────────────────────────────────
// ARCHITECTURE: All Handle components are direct children of this wrapper.
// This is critical so React Flow's getHandleBounds() can find them at the
// correct DOM level. No Handle is ever nested inside a position:relative child.
function Root({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", width }}>
      {children}
    </div>
  );
}

// ─── NODE COMPONENTS ──────────────────────────────────────────────────────────
// Handle className pattern: "flow-handle flow-handle--{color}"
// No inline style on Handle — React Flow's own CSS handles positioning.
// isConnectable is explicitly true on every Handle.

export const TriggerNode = React.memo(function TriggerNode({ id, data, selected }: any) {
  return (
    <Root width={248}>
      {/* Trigger: no input. Single output at bottom. */}
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#3B82F6" Icon={PlayCircle} title={data.label || "Message Trigger"}>
        <Badge label={data.triggerType || "Any Message"} color="#3B82F6" />
        {data.keywords && (
          <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {String(data.keywords).split(",").filter(Boolean).slice(0, 4).map((k: string, i: number) => (
              <span key={i} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "rgba(59,130,246,0.08)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.18)" }}>
                {k.trim()}
              </span>
            ))}
          </div>
        )}
      </Card>
    </Root>
  );
});

export const StandardNode = React.memo(function StandardNode({ id, data, selected }: any) {
  return (
    <Root width={256}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#10B981" Icon={MessageSquare} title={data.label || "Send Message"}>
        {data.content && <Preview text={String(data.content).slice(0, 100)} />}
      </Card>
    </Root>
  );
});

export const AIInterruptionNode = React.memo(function AIInterruptionNode({ id, data, selected }: any) {
  return (
    <Root width={264}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%', transform: 'translateX(-50%)' }} />
      <Handle type="source" position={Position.Bottom} id="fallback" isConnectable className="flow-handle flow-handle--red" style={{ left: '72%', transform: 'translateX(-50%)' }} />
      <Card id={id} selected={selected} color="#8B5CF6" Icon={Sparkles} title={data.label || "AI Reply"}
        footer={<OutLabels items={[{ label: "ANSWERED", color: "#10b981", dir: "↙" }, { label: "FALLBACK", color: "#ef4444", dir: "↘" }]} />}
      >
        {data.userQuery && <Preview text={`"${data.userQuery}"`} />}
      </Card>
    </Root>
  );
});

export const ResumeNode = React.memo(function ResumeNode({ id, data, selected }: any) {
  return (
    <Root width={220}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#22C55E" Icon={Zap} title={data.label || "Resume Flow"} />
    </Root>
  );
});

export const LogicNode = React.memo(function LogicNode({ id, data, selected }: any) {
  return (
    <Root width={256}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="true" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%', transform: 'translateX(-50%)' }} />
      <Handle type="source" position={Position.Bottom} id="false" isConnectable className="flow-handle flow-handle--red" style={{ left: '72%', transform: 'translateX(-50%)' }} />
      <Card id={id} selected={selected} color="#F59E0B" Icon={SplitSquareVertical} title={data.label || "Condition"}
        footer={<OutLabels items={[{ label: "TRUE", color: "#10b981", dir: "↙" }, { label: "FALSE", color: "#ef4444", dir: "↘" }]} />}
      >
        {(data.field || data.value) && (
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#334155", background: "#f8fafc", borderRadius: 8, padding: "6px 10px", border: "1px solid #e2e8f0" }}>
            <span style={{ color: "#d97706" }}>{data.field || "intent"}</span>
            <span style={{ color: "#94a3b8", margin: "0 6px" }}>{data.operator || "=="}</span>
            <span style={{ color: "#059669" }}>"{data.value || "value"}"</span>
          </div>
        )}
      </Card>
    </Root>
  );
});

export const WebhookNode = React.memo(function WebhookNode({ id, data, selected }: any) {
  return (
    <Root width={264}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%', transform: 'translateX(-50%)' }} />
      <Handle type="source" position={Position.Bottom} id="error" isConnectable className="flow-handle flow-handle--red" style={{ left: '72%', transform: 'translateX(-50%)' }} />
      <Card id={id} selected={selected} color="#06B6D4" Icon={Webhook} title={data.label || "API Request"}
        footer={<OutLabels items={[{ label: "200 OK", color: "#10b981", dir: "↙" }, { label: "ERROR", color: "#ef4444", dir: "↘" }]} />}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Badge label={data.method || "POST"} color="#06b6d4" />
          <span style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {data.url || "https://api.example.com"}
          </span>
        </div>
      </Card>
    </Root>
  );
});

export const DelayNode = React.memo(function DelayNode({ id, data, selected }: any) {
  return (
    <Root width={220}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#6366F1" Icon={Clock} title="Time Delay">
        <Badge label={`Wait ${data.duration || "2"}s`} color="#6366F1" />
      </Card>
    </Root>
  );
});

export const HandoffNode = React.memo(function HandoffNode({ id, data, selected }: any) {
  return (
    <Root width={240}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#EC4899" Icon={UserCheck} title={data.label || "Human Handoff"}>
        <KV k="Assign to" v={data.team || "Support Team"} />
      </Card>
    </Root>
  );
});

export const KnowledgeNode = React.memo(function KnowledgeNode({ id, data, selected }: any) {
  return (
    <Root width={256}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%', transform: 'translateX(-50%)' }} />
      <Handle type="source" position={Position.Bottom} id="missing" isConnectable className="flow-handle flow-handle--gray" style={{ left: '72%', transform: 'translateX(-50%)' }} />
      <Card id={id} selected={selected} color="#A855F7" Icon={BookOpen} title={data.label || "Knowledge Base"}
        footer={<OutLabels items={[{ label: "FOUND", color: "#10b981", dir: "↙" }, { label: "NOT FOUND", color: "#94a3b8", dir: "↘" }]} />}
      >
        <KV k="Source" v={data.source || "Help Center"} />
      </Card>
    </Root>
  );
});

export const EndNode = React.memo(function EndNode({ id, data, selected }: any) {
  return (
    <Root width={200}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      {/* No source handle — flow ends here */}
      <Card id={id} selected={selected} color="#EF4444" Icon={XCircle} title={data.label || "End Flow"} />
    </Root>
  );
});

export const ExtractNode = React.memo(function ExtractNode({ id, data, selected }: any) {
  const entities: string[] = data.entities || ["name", "email"];
  return (
    <Root width={256}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%', transform: 'translateX(-50%)' }} />
      <Handle type="source" position={Position.Bottom} id="missing" isConnectable className="flow-handle flow-handle--gray" style={{ left: '72%', transform: 'translateX(-50%)' }} />
      <Card id={id} selected={selected} color="#14B8A6" Icon={Code2} title={data.label || "Extract Entities"}
        footer={<OutLabels items={[{ label: "EXTRACTED", color: "#10b981", dir: "↙" }, { label: "MISSING", color: "#94a3b8", dir: "↘" }]} />}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {entities.slice(0, 5).map((e: string) => (
            <span key={e} style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 99, background: "rgba(20,184,166,0.1)", color: "#0d9488", border: "1px solid rgba(20,184,166,0.22)" }}>
              {e}
            </span>
          ))}
          {entities.length > 5 && <span style={{ fontSize: 10, color: "#94a3b8" }}>+{entities.length - 5}</span>}
        </div>
      </Card>
    </Root>
  );
});

export const FormatNode = React.memo(function FormatNode({ id, data, selected }: any) {
  return (
    <Root width={240}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#0EA5E9" Icon={Paintbrush} title={data.label || "Format Response"}>
        <Badge label={data.formatType || "Quick Replies"} color="#0ea5e9" />
      </Card>
    </Root>
  );
});

export const MemoryNode = React.memo(function MemoryNode({ id, data, selected }: any) {
  return (
    <Root width={240}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#8B5CF6" Icon={Database} title={data.label || "Context Memory"}>
        <KV k="Scope" v={data.scope || "User Session"} />
      </Card>
    </Root>
  );
});

export const WaitNode = React.memo(function WaitNode({ id, data, selected }: any) {
  return (
    <Root width={240}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="next" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%', transform: 'translateX(-50%)' }} />
      <Handle type="source" position={Position.Bottom} id="timeout" isConnectable className="flow-handle flow-handle--gray" style={{ left: '72%', transform: 'translateX(-50%)' }} />
      <Card id={id} selected={selected} color="#64748B" Icon={Hourglass} title={data.label || "Wait for Reply"}
        footer={<OutLabels items={[{ label: "RECEIVED", color: "#10b981", dir: "↙" }, { label: "TIMEOUT", color: "#94a3b8", dir: "↘" }]} />}
      >
        <KV k="Waiting for" v={data.event || "User Reply"} />
      </Card>
    </Root>
  );
});

export const ResumeParserNode = React.memo(function ResumeParserNode({ id, data, selected }: any) {
  return (
    <Root width={248}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%', transform: 'translateX(-50%)' }} />
      <Handle type="source" position={Position.Bottom} id="error" isConnectable className="flow-handle flow-handle--red" style={{ left: '72%', transform: 'translateX(-50%)' }} />
      <Card id={id} selected={selected} color="#10B981" Icon={FileText} title={data.label || "Resume Parser"}
        footer={<OutLabels items={[{ label: "PARSED", color: "#10b981", dir: "↙" }, { label: "FAILED", color: "#ef4444", dir: "↘" }]} />}
      >
        <KV k="Extracts" v={data.extracts || "Skills, Experience"} />
      </Card>
    </Root>
  );
});

export const CollectDataNode = React.memo(function CollectDataNode({ id, data, selected }: any) {
  const fields: string[] = data.fields || ["Name", "Email", "Phone"];
  return (
    <Root width={256}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%', transform: 'translateX(-50%)' }} />
      <Handle type="source" position={Position.Bottom} id="timeout" isConnectable className="flow-handle flow-handle--gray" style={{ left: '72%', transform: 'translateX(-50%)' }} />
      <Card id={id} selected={selected} color="#F59E0B" Icon={ListChecks} title={data.label || "Collect Data"}
        footer={<OutLabels items={[{ label: "COMPLETE", color: "#10b981", dir: "↙" }, { label: "TIMEOUT", color: "#94a3b8", dir: "↘" }]} />}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {fields.slice(0, 3).map((f: string, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#475569" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
              {f}
            </div>
          ))}
          {fields.length > 3 && <span style={{ fontSize: 10.5, color: "#94a3b8" }}>+{fields.length - 3} more</span>}
        </div>
      </Card>
    </Root>
  );
});
