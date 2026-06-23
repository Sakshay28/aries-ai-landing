"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import {
  Sparkles, MessageSquare, SplitSquareVertical, Webhook,
  Clock, UserCheck, BookOpen, XCircle, Database,
  PlayCircle, Code2, Paintbrush, Hourglass, FileText,
  ListChecks, Zap, MoreVertical, Pencil, Copy, Trash2,
  LayoutGrid, GitBranch, FileSignature, MousePointerClick,
  CalendarCheck, Mail, Sliders, Tag, Globe,
} from "lucide-react";
import { useFlowStore } from "../store";
import { validateNode, type ValidationSeverity } from "../utils";

function useNodeValidation(id: string): ValidationSeverity {
  const nodes = useFlowStore(s => s.nodes);
  const edges = useFlowStore(s => s.edges);
  const node = nodes.find(n => n.id === id);
  if (!node) return 'ok';
  return validateNode(node, nodes, edges).status;
}

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
  send_gallery:    { color: '#10B981', label: 'GALLERY' },
  send_buttons:    { color: '#10B981', label: 'BUTTONS' },
  button_trigger:  { color: '#3B82F6', label: 'BUTTON CLICK' },
  ctwa_trigger:    { color: '#1D6DDB', label: 'META AD CLICK' },
  intent_routing:  { color: '#8B5CF6', label: 'INTENT ROUTING' },
  intake_form:     { color: '#F59E0B', label: 'INTAKE FORM' },
};

// ─── NODE MENU (three-dot dropdown) ───────────────────────────────────────────
function MenuItem({
  icon, label, danger = false, onClick,
}: { icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      className="nodrag nopan"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "9px 16px",
        background: hover
          ? (danger ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.07)")
          : "transparent",
        border: "none", cursor: "pointer",
        color: danger ? "#f87171" : "#cbd5e1",
        fontSize: 13, fontFamily: "system-ui, -apple-system, sans-serif",
        transition: "background 0.1s ease",
        textAlign: "left", whiteSpace: "nowrap",
      }}
    >
      {icon}{label}
    </button>
  );
}

function NodeMenu({ id }: { id: string }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; right: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen((v) => !v);
  };

  const menu =
    open && pos
      ? createPortal(
          <div
            className="nodrag nopan"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              background: "#1e293b",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              boxShadow: "0 12px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3)",
              zIndex: 99999,
              minWidth: 172,
              overflow: "hidden",
              padding: "4px 0",
            }}
          >
            <MenuItem
              icon={<Pencil size={13} />}
              label="Edit / Configure"
              onClick={() => {
                useFlowStore.getState().setSelectedNodeId(id);
                setOpen(false);
              }}
            />
            <MenuItem
              icon={<Copy size={13} />}
              label="Duplicate"
              onClick={() => {
                const store = useFlowStore.getState();
                const node = store.nodes.find((n) => n.id === id);
                if (!node) return;
                store.saveHistory();
                const dup = {
                  ...node,
                  id: `node_${Math.random().toString(36).slice(2, 11)}`,
                  position: { x: node.position.x + 32, y: node.position.y + 40 },
                  selected: false,
                };
                useFlowStore.setState({ nodes: [...store.nodes, dup] });
                setOpen(false);
              }}
            />
            <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
            <MenuItem
              icon={<Trash2 size={13} />}
              label="Delete node"
              danger
              onClick={() => {
                const { nodes, edges, saveHistory } = useFlowStore.getState();
                saveHistory();
                useFlowStore.setState({
                  nodes: nodes.filter((n) => n.id !== id),
                  edges: edges.filter((e) => e.source !== id && e.target !== id),
                  selectedNodeId: null,
                });
                setOpen(false);
              }}
            />
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        className="nodrag nopan"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={toggle}
        style={{
          background: open ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.18)",
          border: "none", borderRadius: 6,
          width: 26, height: 26,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "white", flexShrink: 0, outline: "none",
          transition: "background 0.12s ease",
        }}
      >
        <MoreVertical size={12} />
      </button>
      {menu}
    </>
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
  const vStatus = useNodeValidation(id);
  const badgeColor = vStatus === 'error' ? '#EF4444' : vStatus === 'warning' ? '#F59E0B' : '#22C55E';
  return (
    <div
      style={{
        borderRadius: 14,
        border: selected ? `2px solid ${color}` : "1.5px solid #e2e8f0",
        boxShadow: selected
          ? `0 0 0 4px ${color}18, 0 8px 28px rgba(0,0,0,0.2)`
          : "0 2px 10px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)",
        overflow: "visible",
        fontFamily: "system-ui, -apple-system, sans-serif",
        transition: "box-shadow 0.15s ease, border-color 0.15s ease",
        background: "#fff",
        position: "relative",
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
          borderRadius: "13px 13px 0 0",
          overflow: "hidden",
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
        {/* Validation badge — only show for error/warning, not for ok */}
        {vStatus !== 'ok' && (
          <div
            title={vStatus === 'error' ? 'Has errors' : 'Has warnings'}
            style={{
              width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
              background: badgeColor,
              border: '2px solid rgba(255,255,255,0.7)',
              boxShadow: `0 0 8px ${badgeColor}`,
            }}
          />
        )}
        <NodeMenu id={id} />
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
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%' }} />
      <Handle type="source" position={Position.Bottom} id="fallback" isConnectable className="flow-handle flow-handle--red" style={{ left: '72%' }} />
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
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#22C55E" Icon={Zap} title={data.label || "Resume Flow"} />
    </Root>
  );
});

export const LogicNode = React.memo(function LogicNode({ id, data, selected }: any) {
  return (
    <Root width={256}>
      <Handle type="source" position={Position.Bottom} id="true" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%' }} />
      <Handle type="source" position={Position.Bottom} id="false" isConnectable className="flow-handle flow-handle--red" style={{ left: '72%' }} />
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
  // Smart URL preview: extract path only, keep compact
  const rawUrl = (data.url as string) || '';
  let urlPreview = rawUrl;
  try { urlPreview = new URL(rawUrl).pathname; } catch { /* use raw */ }
  if (!urlPreview || urlPreview === '/') urlPreview = rawUrl;

  const headerCount = Array.isArray(data.headers) ? data.headers.filter((h: any) => h.key).length : 1;
  const bodyMode = (data.bodyMode as string) || (data.body ? 'json' : '');
  const bodyLabel = bodyMode === 'json' ? 'JSON' : bodyMode === 'form' ? 'Form' : bodyMode === 'none' ? 'No body' : '';
  const metaLine = [bodyLabel, headerCount > 0 ? `${headerCount} header${headerCount !== 1 ? 's' : ''}` : ''].filter(Boolean).join(' • ');

  return (
    <Root width={264}>
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%' }} />
      <Handle type="source" position={Position.Bottom} id="error" isConnectable className="flow-handle flow-handle--red" style={{ left: '72%' }} />
      <Card id={id} selected={selected} color="#06B6D4" Icon={Webhook} title={data.label || "Custom Webhook"}
        footer={<OutLabels items={[{ label: "200 OK", color: "#10b981", dir: "↙" }, { label: "ERROR", color: "#ef4444", dir: "↘" }]} />}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Badge label={data.method || "POST"} color="#06b6d4" />
          <span style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, fontFamily: "monospace" }}>
            {urlPreview || "https://api.example.com"}
          </span>
        </div>
        {metaLine && (
          <div style={{ marginTop: 4, fontSize: 10, color: "#64748b", letterSpacing: "0.01em" }}>{metaLine}</div>
        )}
      </Card>
    </Root>
  );
});

export const DelayNode = React.memo(function DelayNode({ id, data, selected }: any) {
  const seconds = Number(data.duration || data.seconds || data.delay || 2);
  const isCapped = seconds > 5;
  return (
    <Root width={240}>
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color={isCapped ? "#EF4444" : "#6366F1"} Icon={Clock} title="Time Delay">
        <Badge label={`Wait ${seconds}s`} color={isCapped ? "#ef4444" : "#6366F1"} />
        {isCapped && (
          <div style={{ fontSize: 10, color: "#ef4444", marginTop: 4, fontWeight: 600 }}>
            ⚠️ Capped at 5s on serverless
          </div>
        )}
      </Card>
    </Root>
  );
});

export const HandoffNode = React.memo(function HandoffNode({ id, data, selected }: any) {
  return (
    <Root width={240}>
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
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%' }} />
      <Handle type="source" position={Position.Bottom} id="missing" isConnectable className="flow-handle flow-handle--gray" style={{ left: '72%' }} />
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
      {/* No source handle — flow ends here */}
      <Card id={id} selected={selected} color="#EF4444" Icon={XCircle} title={data.label || "End Flow"} />
    </Root>
  );
});

export const ExtractNode = React.memo(function ExtractNode({ id, data, selected }: any) {
  const entities: string[] = data.entities || ["name", "email"];
  return (
    <Root width={256}>
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%' }} />
      <Handle type="source" position={Position.Bottom} id="missing" isConnectable className="flow-handle flow-handle--gray" style={{ left: '72%' }} />
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
      <Handle type="source" position={Position.Bottom} id="next" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%' }} />
      <Handle type="source" position={Position.Bottom} id="timeout" isConnectable className="flow-handle flow-handle--gray" style={{ left: '72%' }} />
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
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%' }} />
      <Handle type="source" position={Position.Bottom} id="error" isConnectable className="flow-handle flow-handle--red" style={{ left: '72%' }} />
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
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: '28%' }} />
      <Handle type="source" position={Position.Bottom} id="timeout" isConnectable className="flow-handle flow-handle--gray" style={{ left: '72%' }} />
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

// ─── INTERACTIVE BUTTONS NODE ─────────────────────────────────────────────────
// Renders one source handle per button + a "fallback" handle.
export const InteractiveButtonsNode = React.memo(function InteractiveButtonsNode({ id, data, selected }: any) {
  const buttons: any[] = Array.isArray(data.buttons) && data.buttons.length
    ? data.buttons
    : [{ id: "btn_1", label: "Option 1", value: "opt_1" }];
  const updateNodeInternals = useUpdateNodeInternals();
  React.useEffect(() => { updateNodeInternals(id); }, [buttons.length, id, updateNodeInternals]);
  const total = buttons.length + 1; // +1 for fallback
  return (
    <Root width={284}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      {buttons.map((b, i) => {
        const left = ((i + 1) / (total + 1)) * 100;
        return (
          <Handle
            key={b.id || `btn_${i}`}
            type="source"
            position={Position.Bottom}
            id={b.id || `btn_${i}`}
            isConnectable
            className="flow-handle flow-handle--green"
            style={{ left: `${left}%` }}
          />
        );
      })}
      <Handle
        type="source"
        position={Position.Bottom}
        id="fallback"
        isConnectable
        className="flow-handle flow-handle--gray"
        style={{ left: `${(total / (total + 1)) * 100}%` }}
      />
      <Card id={id} selected={selected} color="#10B981" Icon={LayoutGrid} title={data.label || "Interactive Buttons"}
        footer={<OutLabels items={[
          ...buttons.slice(0, 3).map((b: any) => ({ label: (b.label || "OPT").toUpperCase().slice(0, 10), color: "#10b981", dir: "↓" })),
          { label: "FALLBACK", color: "#94a3b8", dir: "↓" },
        ]} />}
      >
        {data.message && <Preview text={String(data.message)} />}
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {buttons.slice(0, 4).map((b: any, i: number) => (
            <div key={b.id || i} style={{ fontSize: 11.5, padding: "5px 9px", borderRadius: 7, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.22)", color: "#0d9488", fontWeight: 500 }}>
              {b.label || `Option ${i + 1}`}
            </div>
          ))}
          {buttons.length > 4 && <span style={{ fontSize: 10.5, color: "#94a3b8" }}>+{buttons.length - 4} more</span>}
        </div>
      </Card>
    </Root>
  );
});

// ─── BUTTON CLICK / BUTTON TRIGGER NODE ───────────────────────────────────────
export const ButtonTriggerNode = React.memo(function ButtonTriggerNode({ id, data, selected }: any) {
  return (
    <Root width={244}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#3B82F6" Icon={MousePointerClick} title={data.label || "Button Click"}>
        <Badge label={data.mode === "specific" ? `Wait for: ${data.button || "any"}` : "Any Button"} color="#3B82F6" />
      </Card>
    </Root>
  );
});

// ─── META AD CLICK (CTWA) TRIGGER NODE ────────────────────────────────────────
export const CtwaNode = React.memo(function CtwaNode({ id, data, selected }: any) {
  const adId = (data.ad_id as string || '').trim();
  return (
    <Root width={244}>
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#1D6DDB" Icon={Globe} title={data.label || "Meta Ad Click"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, padding: "2px 8px", borderRadius: 99, background: "rgba(29,109,219,0.1)", color: "#1D6DDB", border: "1px solid rgba(29,109,219,0.25)" }}>
              Click-to-WhatsApp
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: "#475569", margin: 0 }}>
            {adId ? `Ad ID: ${adId.slice(0, 18)}…` : "Fires on any Meta ad click"}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
            {["ad_headline", "ad_source_id", "ad_ctwa_clid"].map(v => (
              <span key={v} style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 99, background: "rgba(29,109,219,0.06)", color: "#2563eb", border: "1px solid rgba(29,109,219,0.15)", fontFamily: "monospace" }}>
                {`{{${v}}}`}
              </span>
            ))}
          </div>
        </div>
      </Card>
    </Root>
  );
});

// ─── INTENT ROUTING NODE ──────────────────────────────────────────────────────
// One source handle per intent + "fallback".
export const IntentRoutingNode = React.memo(function IntentRoutingNode({ id, data, selected }: any) {
  const intents: any[] = Array.isArray(data.intents) && data.intents.length
    ? data.intents
    : [{ id: "intent_1", name: "default", keywords: [] }];
  const updateNodeInternals = useUpdateNodeInternals();
  React.useEffect(() => { updateNodeInternals(id); }, [intents.length, id, updateNodeInternals]);
  const total = intents.length + 1;
  return (
    <Root width={284}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      {intents.map((it: any, i: number) => {
        const left = ((i + 1) / (total + 1)) * 100;
        return (
          <Handle
            key={it.id || `intent_${i}`}
            type="source"
            position={Position.Bottom}
            id={it.id || `intent_${i}`}
            isConnectable
            className="flow-handle flow-handle--green"
            style={{ left: `${left}%` }}
          />
        );
      })}
      <Handle
        type="source"
        position={Position.Bottom}
        id="fallback"
        isConnectable
        className="flow-handle flow-handle--gray"
        style={{ left: `${(total / (total + 1)) * 100}%` }}
      />
      <Card id={id} selected={selected} color="#8B5CF6" Icon={GitBranch} title={data.label || "Intent Routing"}
        footer={<OutLabels items={[
          ...intents.slice(0, 3).map((it: any) => ({ label: (it.name || "INTENT").toUpperCase().slice(0, 12), color: "#10b981", dir: "↓" })),
          { label: "FALLBACK", color: "#94a3b8", dir: "↓" },
        ]} />}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {intents.slice(0, 4).map((it: any, i: number) => (
            <div key={it.id || i} style={{ fontSize: 11.5, color: "#475569" }}>
              <div style={{ fontWeight: 600, color: "#334155", marginBottom: 2 }}>{it.name || `Intent ${i + 1}`}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {(it.keywords || []).slice(0, 3).map((kw: string, ki: number) => (
                  <span key={ki} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(139,92,246,0.1)", color: "#7c3aed", border: "1px solid rgba(139,92,246,0.2)" }}>
                    {kw}
                  </span>
                ))}
                {(it.keywords || []).length > 3 && <span style={{ fontSize: 10, color: "#94a3b8" }}>+{(it.keywords || []).length - 3}</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </Root>
  );
});

// ─── INTAKE FORM NODE ─────────────────────────────────────────────────────────
export const IntakeFormNode = React.memo(function IntakeFormNode({ id, data, selected }: any) {
  const fields: any[] = Array.isArray(data.fields) && data.fields.length
    ? data.fields
    : [{ id: "f1", name: "Name", type: "text" }];
  return (
    <Root width={264}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: "28%" }} />
      <Handle type="source" position={Position.Bottom} id="timeout" isConnectable className="flow-handle flow-handle--gray" style={{ left: "72%" }} />
      <Card id={id} selected={selected} color="#F59E0B" Icon={FileSignature} title={data.label || "Intake Form"}
        footer={<OutLabels items={[{ label: "COMPLETE", color: "#10b981", dir: "↙" }, { label: "TIMEOUT", color: "#94a3b8", dir: "↘" }]} />}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {fields.slice(0, 4).map((f: any, i: number) => (
            <div key={f.id || i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11.5, color: "#475569" }}>
              <span style={{ fontWeight: 500 }}>{f.name || `Field ${i + 1}`}</span>
              <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 99, background: "rgba(245,158,11,0.1)", color: "#b45309", border: "1px solid rgba(245,158,11,0.22)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {f.type || "text"}
              </span>
            </div>
          ))}
          {fields.length > 4 && <span style={{ fontSize: 10.5, color: "#94a3b8" }}>+{fields.length - 4} more</span>}
        </div>
      </Card>
    </Root>
  );
});

export const BookAppointmentNode = React.memo(function BookAppointmentNode({ id, data, selected }: any) {
  return (
    <Root width={264}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: "28%" }} />
      <Handle type="source" position={Position.Bottom} id="error" isConnectable className="flow-handle flow-handle--red" style={{ left: "72%" }} />
      <Card id={id} selected={selected} color="#4285F4" Icon={CalendarCheck} title={data.label || "Book Appointment"}
        footer={<OutLabels items={[{ label: "BOOKED", color: "#10b981", dir: "↙" }, { label: "FAILED", color: "#ef4444", dir: "↘" }]} />}
      >
        <KV k="Title" v={data.title || "{{name}}'s Appointment"} />
        <KV k="Start" v={data.start || "{{slot_start}}"} />
        <KV k="End" v={data.end || "{{slot_end}}"} />
      </Card>
    </Root>
  );
});

export const AIReplyNode = React.memo(function AIReplyNode({ id, data, selected }: any) {
  return (
    <Root width={256}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#8B5CF6" Icon={Sparkles} title={data.label || "AI Reply"}>
        <Badge label="Gemini 2.0 Flash" color="#8b5cf6" />
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Generates contextual response</div>
      </Card>
    </Root>
  );
});

export const WaitForReplyNode = React.memo(function WaitForReplyNode({ id, data, selected }: any) {
  const timeout = data.timeoutHours ? `${data.timeoutHours}h timeout` : "24h timeout";
  return (
    <Root width={256}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="next" isConnectable className="flow-handle flow-handle--green" style={{ left: "28%" }} />
      <Handle type="source" position={Position.Bottom} id="timeout" isConnectable className="flow-handle flow-handle--gray" style={{ left: "72%" }} />
      <Card id={id} selected={selected} color="#64748B" Icon={Hourglass} title={data.label || "Wait for Reply"}
        footer={<OutLabels items={[{ label: "REPLIED", color: "#10b981", dir: "↙" }, { label: "TIMEOUT", color: "#94a3b8", dir: "↘" }]} />}
      >
        <Badge label={timeout} color="#64748b" />
      </Card>
    </Root>
  );
});

export const SendEmailNode = React.memo(function SendEmailNode({ id, data, selected }: any) {
  return (
    <Root width={256}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="success" isConnectable className="flow-handle flow-handle--green" style={{ left: "28%" }} />
      <Handle type="source" position={Position.Bottom} id="error" isConnectable className="flow-handle flow-handle--red" style={{ left: "72%" }} />
      <Card id={id} selected={selected} color="#6366F1" Icon={Mail} title={data.label || "Send Email"}
        footer={<OutLabels items={[{ label: "SENT", color: "#10b981", dir: "↙" }, { label: "FAILED", color: "#ef4444", dir: "↘" }]} />}
      >
        <KV k="To" v={data.to || "{{email}}"} />
        <KV k="Subject" v={data.subject || "Message from {{tenant_name}}"} />
      </Card>
    </Root>
  );
});

export const SetVariableNode = React.memo(function SetVariableNode({ id, data, selected }: any) {
  const assignments: any[] = Array.isArray(data.assignments) ? data.assignments : [{ key: data.varName || "my_var", value: data.varValue || "" }];
  return (
    <Root width={256}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#F59E0B" Icon={Sliders} title={data.label || "Set Variable"}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {assignments.slice(0, 3).map((a: any, i: number) => (
            <div key={i} style={{ fontSize: 11, color: "#475569", display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontFamily: "monospace", background: "rgba(245,158,11,0.1)", color: "#b45309", borderRadius: 4, padding: "1px 5px" }}>{a.key || "var"}</span>
              <span style={{ color: "#94a3b8" }}>=</span>
              <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>{a.value || '""'}</span>
            </div>
          ))}
          {assignments.length > 3 && <span style={{ fontSize: 10, color: "#94a3b8" }}>+{assignments.length - 3} more</span>}
        </div>
      </Card>
    </Root>
  );
});

export const UpdateTagNode = React.memo(function UpdateTagNode({ id, data, selected }: any) {
  return (
    <Root width={240}>
      <Handle type="target" position={Position.Top} id="input" isConnectable className="flow-handle flow-handle--white" />
      <Handle type="source" position={Position.Bottom} id="output" isConnectable className="flow-handle flow-handle--green" />
      <Card id={id} selected={selected} color="#10B981" Icon={Tag} title={data.label || "Update Tag"}>
        <Badge label={data.tag || "Set tag..."} color="#10b981" />
      </Card>
    </Root>
  );
});
