"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  PanOnScrollMode,
  ConnectionLineType,
  ConnectionMode,
  type NodeTypes,
  type EdgeTypes,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  StandardNode,
  AIInterruptionNode,
  ResumeNode,
  LogicNode,
  WebhookNode,
  DelayNode,
  HandoffNode,
  KnowledgeNode,
  EndNode,
  TriggerNode,
  ExtractNode,
  FormatNode,
  MemoryNode,
  WaitNode,
  ResumeParserNode,
  CollectDataNode,
  InteractiveButtonsNode,
  ButtonTriggerNode,
  IntentRoutingNode,
  IntakeFormNode,
  BookAppointmentNode,
  AIReplyNode,
  WaitForReplyNode,
  SendEmailNode,
  SetVariableNode,
  UpdateTagNode,
  NODE_CATEGORY,
} from "./CustomNodes";
import { useFlowStore } from "../store";
import { getDefaultNodeData } from "./FlowSidebar";
import { PremiumEdge } from "./PremiumEdge";
import { Search, X } from "lucide-react";

// ─── NODE TYPES (module-level — never recreated) ───────────────────────────
const NODE_TYPES: NodeTypes = {
  trigger:        TriggerNode as unknown as NodeTypes[string],
  standard:       StandardNode as unknown as NodeTypes[string],
  interruption:   AIInterruptionNode as unknown as NodeTypes[string],
  resume:         ResumeNode as unknown as NodeTypes[string],
  condition:      LogicNode as unknown as NodeTypes[string],
  webhook:        WebhookNode as unknown as NodeTypes[string],
  delay:          DelayNode as unknown as NodeTypes[string],
  handoff:        HandoffNode as unknown as NodeTypes[string],
  knowledge:      KnowledgeNode as unknown as NodeTypes[string],
  end:            EndNode as unknown as NodeTypes[string],
  extract:        ExtractNode as unknown as NodeTypes[string],
  format:         FormatNode as unknown as NodeTypes[string],
  memory:         MemoryNode as unknown as NodeTypes[string],
  wait:           WaitNode as unknown as NodeTypes[string],
  resume_parser:  ResumeParserNode as unknown as NodeTypes[string],
  collect_data:   CollectDataNode as unknown as NodeTypes[string],
  show_products:  StandardNode as unknown as NodeTypes[string],
  order_tracking: StandardNode as unknown as NodeTypes[string],
  returns_handler:StandardNode as unknown as NodeTypes[string],
  cart_abandonment:StandardNode as unknown as NodeTypes[string],
  send_buttons:       InteractiveButtonsNode as unknown as NodeTypes[string],
  button_trigger:     ButtonTriggerNode as unknown as NodeTypes[string],
  intent_routing:     IntentRoutingNode as unknown as NodeTypes[string],
  intake_form:        IntakeFormNode as unknown as NodeTypes[string],
  book_appointment:   BookAppointmentNode as unknown as NodeTypes[string],
  ai_reply:           AIReplyNode as unknown as NodeTypes[string],
  wait_for_reply:     WaitForReplyNode as unknown as NodeTypes[string],
  send_gallery:       StandardNode as unknown as NodeTypes[string],
  send_email:         SendEmailNode as unknown as NodeTypes[string],
  set_variable:       SetVariableNode as unknown as NodeTypes[string],
  update_tag:         UpdateTagNode as unknown as NodeTypes[string],
};

// ─── EDGE TYPES (module-level — never recreated) ───────────────────────────
const EDGE_TYPES: EdgeTypes = {
  premium: PremiumEdge as unknown as EdgeTypes[string],
};

const DEFAULT_EDGE_OPTIONS = {
  type: "premium",
  animated: false,
} as const;

// Module-level constants — never recreated, no inline object allocation in render
const CONNECTION_LINE_STYLE = {
  stroke: "rgba(99,102,241,0.85)",
  strokeWidth: 2,
  strokeDasharray: "6 6",
  filter: "drop-shadow(0 0 4px rgba(99,102,241,0.55))",
} as const;

// Per-type widths for accurate drop centering (node position = top-left in RF)
const NODE_WIDTHS: Record<string, number> = {
  trigger: 248, standard: 256, interruption: 264, resume: 220,
  condition: 256, webhook: 264, delay: 220, handoff: 240,
  knowledge: 256, end: 200, extract: 256, format: 240,
  memory: 240, wait: 240, resume_parser: 248, collect_data: 256,
  send_buttons: 284, button_trigger: 244, intent_routing: 284, intake_form: 264,
};

// ─── INNER COMPONENT ─────────────────────────────────────────────────────────
function FlowCanvasInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, undo, redo, saveHistory, fitViewTrigger } =
    useFlowStore();
  const { screenToFlowPosition, fitView, zoomIn, zoomOut, setCenter } = useReactFlow();

  useEffect(() => {
    if (fitViewTrigger === 0) return;
    const id = setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
    return () => clearTimeout(id);
  }, [fitViewTrigger, fitView]);
  const updateNodeInternals = useUpdateNodeInternals();
  const clipboardRef = useRef<Node | null>(null);
  const justDropped = useRef(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const searchResults = searchQuery.trim()
    ? nodes.filter(n => {
        const label = String((n.data as any)?.label ?? n.type ?? "").toLowerCase();
        return label.includes(searchQuery.toLowerCase());
      })
    : [];

  const focusNode = useCallback((node: Node) => {
    setCenter(node.position.x + 128, node.position.y + 60, { zoom: 1.2, duration: 450 });
    useFlowStore.getState().setSelectedNodeId(node.id);
    setSearchOpen(false);
    setSearchQuery("");
  }, [setCenter]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onSearchKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(v => !v);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); }
    };
    window.addEventListener("keydown", onSearchKey);
    return () => window.removeEventListener("keydown", onSearchKey);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          (active as HTMLElement).isContentEditable);
      if (isInput) return;

      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        const { selectedNodeId, nodes: ns, edges: es } = useFlowStore.getState();
        if (selectedNodeId) {
          e.preventDefault();
          saveHistory();
          useFlowStore.setState({
            nodes: ns.filter((n) => n.id !== selectedNodeId),
            edges: es.filter((ed) => ed.source !== selectedNodeId && ed.target !== selectedNodeId),
            selectedNodeId: null,
          });
        }
      }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); fitView({ padding: 0.18, duration: 400 }); }
      if ((e.metaKey || e.ctrlKey) && e.key === '=') { e.preventDefault(); zoomIn({ duration: 200 }); }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') { e.preventDefault(); zoomOut({ duration: 200 }); }
      // Copy
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        const { selectedNodeId } = useFlowStore.getState();
        if (selectedNodeId) {
          const node = useFlowStore.getState().nodes.find(n => n.id === selectedNodeId);
          if (node) clipboardRef.current = node;
        }
      }
      // Paste
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        if (clipboardRef.current) {
          e.preventDefault();
          const orig = clipboardRef.current;
          const newNode = {
            ...orig,
            id: `node_${Math.random().toString(36).slice(2, 11)}`,
            position: { x: orig.position.x + 48, y: orig.position.y + 48 },
            selected: false,
          };
          const store = useFlowStore.getState();
          store.saveHistory();
          useFlowStore.setState({ nodes: [...store.nodes, newNode] });
        }
      }
      // Duplicate
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault();
        const { selectedNodeId } = useFlowStore.getState();
        if (selectedNodeId) {
          const node = useFlowStore.getState().nodes.find(n => n.id === selectedNodeId);
          if (node) {
            const newNode = {
              ...node,
              id: `node_${Math.random().toString(36).slice(2, 11)}`,
              position: { x: node.position.x + 48, y: node.position.y + 48 },
              selected: false,
            };
            const store = useFlowStore.getState();
            store.saveHistory();
            useFlowStore.setState({ nodes: [...store.nodes, newNode] });
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, saveHistory, fitView, zoomIn, zoomOut]);

  // ── Drag-over + drop from sidebar ──────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData("application/reactflow");
      if (!raw) return;

      let type = "";
      let nodeId = "";
      try {
        const parsed = JSON.parse(raw);
        type = parsed.type;
        nodeId = parsed.id;
      } catch {
        type = raw;
        nodeId = raw;
      }

      // Center node at cursor: RF position is top-left, so subtract half width
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const nodeWidth = NODE_WIDTHS[type] || 256;
      const position = { x: flowPos.x - nodeWidth / 2, y: flowPos.y - 25 };
      const newNode = {
        id: `node_${Math.random().toString(36).slice(2, 11)}`,
        type,
        position,
        data: getDefaultNodeData(nodeId),
      };

      const store = useFlowStore.getState();
      store.saveHistory();
      useFlowStore.setState({
        nodes: [...store.nodes, newNode] as typeof store.nodes,
      });

      // Block the synthetic pane-click that fires ~100ms after a drop event
      justDropped.current = true;
      setTimeout(() => { justDropped.current = false; }, 300);

      setTimeout(() => updateNodeInternals(newNode.id), 50);

      const { flowId, saveFlow } = useFlowStore.getState();
      if (flowId) saveFlow().catch(console.error);
    },
    [screenToFlowPosition, updateNodeInternals],
  );

  // ── Node/pane click → selection sync ──────────────────────────────────────
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    useFlowStore.getState().setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    // Ignore if a node was just dropped — drop fires a synthetic click on the pane
    if (justDropped.current) return;
    useFlowStore.getState().setSelectedNodeId(null);
  }, []);

  return (
    <div className="flex-1 h-full relative" style={{ willChange: "transform" }}>

      {searchOpen && (
        <div style={{
          position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
          zIndex: 50, width: 320,
          background: "rgba(10,12,18,0.96)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14, boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          backdropFilter: "blur(20px)", overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <Search size={14} color="#94a3b8" />
            <input ref={searchInputRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search nodes…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 13, fontFamily: "inherit" }}
            />
            <button onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
              style={{ color: "#64748b", cursor: "pointer", background: "none", border: "none", padding: 2 }}>
              <X size={14} />
            </button>
          </div>
          {searchResults.length > 0 && (
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {searchResults.map(n => (
                <button key={n.id} onClick={() => focusNode(n)}
                  style={{
                    width: "100%", textAlign: "left", background: "transparent",
                    border: "none", padding: "9px 14px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 10,
                    color: "#e2e8f0", fontSize: 13, fontFamily: "inherit",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{String((n.data as any)?.label ?? n.type)}</span>
                  <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>{n.type}</span>
                </button>
              ))}
            </div>
          )}
          {searchQuery.trim() && searchResults.length === 0 && (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "#64748b" }}>No nodes found</div>
          )}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
        /* ── TRUE INFINITE CANVAS ── */
        minZoom={0.1}
        maxZoom={3}
        defaultViewport={{ x: 120, y: 80, zoom: 1 }}
        /* ── CONNECTIVITY ── */
        nodesConnectable={true}
        nodesDraggable={true}
        elementsSelectable={true}
        connectOnClick={false}
        deleteKeyCode={null}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={80}
        autoPanOnConnect={true}
        /* ── CONNECTION PREVIEW LINE ── */
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={CONNECTION_LINE_STYLE}
        /* ── INTERACTION ── */
        panOnDrag={true}
        panOnScroll={true}
        panOnScrollMode={PanOnScrollMode.Free}
        panOnScrollSpeed={1.5}
        zoomOnScroll={false}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        selectionOnDrag={false}
        nodeDragThreshold={1}
        /* ── MAGNETIC SNAP — 16px grid for clean alignment ── */
        snapToGrid={true}
        snapGrid={[16, 16]}
        /* ── PERFORMANCE ── */
        elevateEdgesOnSelect={true}
        onlyRenderVisibleElements={true}
        /* ── STYLE ── */
        style={{ background: "transparent" }}
        proOptions={{ hideAttribution: true }}
      >
        {/* Infinite dot grid */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={28}
          size={1.2}
          color="rgba(255,255,255,0.16)"
          style={{
            background:
              "radial-gradient(ellipse at 25% 0%, rgba(34,197,94,0.04) 0%, transparent 50%), linear-gradient(to bottom, #06070a 0%, #0b0f14 100%)",
          }}
        />

        {/* Minimap — bottom right, calmed pan speed */}
        <MiniMap
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(node) => {
            const cat = NODE_CATEGORY[node.type as keyof typeof NODE_CATEGORY];
            return cat ? cat.color : "#3b82f6";
          }}
          nodeStrokeWidth={3}
          maskColor="rgba(6,7,10,0.55)"
          style={{
            width: 200,
            height: 140,
            background: "rgba(10,12,18,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "14px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
          }}
        />

        {/* Controls */}
        <Controls
          style={{
            background: "rgba(10,12,18,0.92)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "12px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            bottom: 24,
            left: 24,
          }}
        />

      </ReactFlow>
    </div>
  );
}

// ─── EXPORT (wraps with provider) ─────────────────────────────────────────────
export default function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}
