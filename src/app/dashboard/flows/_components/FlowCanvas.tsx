"use client";

import React, { useCallback, useEffect, useRef } from "react";
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
  MarkerType,
  type NodeTypes,
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
  NODE_CATEGORY,
} from "./CustomNodes";
import { useFlowStore } from "../store";
import { getDefaultNodeData } from "./FlowSidebar";

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
};

const DEFAULT_EDGE_OPTIONS = {
  type: "default", // bezier — smoother than smoothstep
  style: { strokeWidth: 2.5, stroke: "rgba(16,185,129,0.7)" },
  animated: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 12,
    height: 12,
    color: "rgba(16,185,129,0.7)",
  },
} as const;

// Module-level constants — never recreated, no inline object allocation in render
const CONNECTION_LINE_STYLE = {
  stroke: "rgba(99,102,241,0.9)",
  strokeWidth: 2,
  filter: "drop-shadow(0 0 3px rgba(99,102,241,0.5))",
} as const;

// Per-type widths for accurate drop centering (node position = top-left in RF)
const NODE_WIDTHS: Record<string, number> = {
  trigger: 248, standard: 256, interruption: 264, resume: 220,
  condition: 256, webhook: 264, delay: 220, handoff: 240,
  knowledge: 256, end: 200, extract: 256, format: 240,
  memory: 240, wait: 240, resume_parser: 248, collect_data: 256,
};

// ─── INNER COMPONENT ─────────────────────────────────────────────────────────
function FlowCanvasInner() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, undo, redo, saveHistory } =
    useFlowStore();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const clipboardRef = useRef<Node | null>(null);
  // Guards against the synthetic pane-click that fires right after a drag-drop
  const justDropped = useRef(false);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
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
      // Fit view
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        fitView({ padding: 0.15, duration: 350 });
      }
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
  }, [undo, redo, saveHistory, fitView]);

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
        selectedNodeId: newNode.id,
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
    <div className="flex-1 h-full" style={{ willChange: "transform" }}>
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
        /* ── SNAP disabled — nodes land exactly where dropped ── */
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
