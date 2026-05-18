"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { ReactFlow, Background, BackgroundVariant, MiniMap, useReactFlow, Panel } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { StandardNode, AIInterruptionNode, ResumeNode, LogicNode, WebhookNode, DelayNode, HandoffNode, KnowledgeNode, EndNode, TriggerNode, ExtractNode, FormatNode, MemoryNode, WaitNode, ResumeParserNode } from "./CustomNodes";
import { useFlowStore } from "../store";
import { getDefaultNodeData } from "./FlowSidebar";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

const nodeTypes = {
  standard: StandardNode,
  interruption: AIInterruptionNode,
  resume: ResumeNode,
  condition: LogicNode,
  webhook: WebhookNode,
  delay: DelayNode,
  handoff: HandoffNode,
  knowledge: KnowledgeNode,
  end: EndNode,
  trigger: TriggerNode,
  extract: ExtractNode,
  format: FormatNode,
  memory: MemoryNode,
  wait: WaitNode,
  resume_parser: ResumeParserNode,
  show_products: StandardNode,
  order_tracking: StandardNode,
  returns_handler: StandardNode,
  cart_abandonment: StandardNode,
};

export default function FlowCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, setSelectedNodeId, undo, redo, saveHistory, setConnectingNodeId } = useFlowStore();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [isHoveringTrash, setIsHoveringTrash] = useState(false);
  const { screenToFlowPosition, setNodes, setEdges, fitView } = useReactFlow();

  // Auto-fit on initial load of template
  useEffect(() => {
    if (nodes.length > 0) {
      const timeout = setTimeout(() => {
        fitView({ duration: 1200, padding: 0.4 });
      }, 50);
      return () => clearTimeout(timeout);
    }
  }, [nodes.length > 0, fitView]);

  // Keyboard Shortcuts for Undo / Redo / Delete (React Flow handles delete by default with Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onPaneClick = useCallback(() => setSelectedNodeId(null), [setSelectedNodeId]);

  const onNodeDragStart = useCallback(() => setIsDraggingNode(true), []);
  
  const onNodeDrag = useCallback((event: React.MouseEvent | React.TouchEvent, node: any) => {
    const clientY = 'clientY' in event ? event.clientY : event.touches[0].clientY;
    setIsHoveringTrash(clientY > window.innerHeight - 120);
  }, []);

  const onNodeDragStop = useCallback((event: React.MouseEvent | React.TouchEvent, node: any) => {
    setIsDraggingNode(false);
    const clientY = 'clientY' in event ? event.clientY : event.touches[0].clientY;
    
    if (clientY > window.innerHeight - 120) {
      saveHistory(); // save before deletion
      setNodes((nds) => nds.filter((n) => n.id !== node.id));
      setEdges((eds) => eds.filter((e) => e.source !== node.id && e.target !== node.id));
      toast.success("Node deleted", { duration: 1500 });
    }
    setIsHoveringTrash(false);
  }, [setNodes, setEdges, saveHistory]);

  const onConnectStart = useCallback((_: any, { nodeId }: any) => {
    setConnectingNodeId(nodeId);
  }, [setConnectingNodeId]);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const target = event.target as Element;
    const isTargetComponent = target.closest('[data-flow-component]');
    
    if (isTargetComponent) {
      const type = isTargetComponent.getAttribute('data-flow-component');
      const sourceId = useFlowStore.getState().connectingNodeId;
      if (sourceId && type) {
        saveHistory();
        const sourceNode = useFlowStore.getState().nodes.find(n => n.id === sourceId);
        
        if (sourceNode) {
          const newId = `node_${Math.random().toString(36).substr(2, 9)}`;
          
          const newNode = {
            id: newId,
            type,
            position: { x: sourceNode.position.x, y: sourceNode.position.y + 150 },
            data: getDefaultNodeData(type)
          };
          
          setNodes((nds) => [...nds, newNode]);
          setEdges((eds) => [...eds, {
            id: `e-${sourceId}-${newId}`,
            source: sourceId,
            target: newId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 2 }
          }]);
        }
      }
    }
    
    setConnectingNodeId(null);
  }, [setNodes, setEdges, saveHistory, setConnectingNodeId]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const dragDataStr = event.dataTransfer.getData('application/reactflow');
      if (!dragDataStr) return;
      
      let type = dragDataStr;
      let nodeId = dragDataStr;
      try {
        const parsed = JSON.parse(dragDataStr);
        type = parsed.type;
        nodeId = parsed.id;
      } catch (e) {
        // legacy string fallback
      }

      const position = screenToFlowPosition({
        x: event.clientX - 120, // Center the node horizontally (approx half width)
        y: event.clientY - 40,  // Center the node vertically (approx half height)
      });

      const newNode = {
        id: `node_${Math.random().toString(36).substr(2, 9)}`,
        type,
        position,
        data: getDefaultNodeData(nodeId),
      };

      saveHistory();
      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes, saveHistory],
  );

  return (
    <div className="flex-1 h-full bg-[#030303] relative" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={{ type: 'smoothstep', animated: true, style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 2 } }}
        connectionRadius={40}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onPaneClick={onPaneClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={["Meta", "Shift"]}
        selectionOnDrag={false}
        panOnScroll={true}
        panOnScrollMode={"free" as import('@xyflow/react').PanOnScrollMode}
        zoomOnScroll={false}
        panOnDrag={true}
        fitView
        className="bg-[#030303]"
        minZoom={0.2}
        proOptions={{ hideAttribution: true }}
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={24} 
          size={2} 
          color="rgba(6, 182, 212, 0.25)"
          className="opacity-60"
        />
        <MiniMap 
          className="!bg-[#030303]/40 !border !border-white/[0.02] !rounded-lg opacity-10 hover:opacity-100 transition-all duration-500 scale-90 origin-bottom-right"
          maskColor="rgba(0, 0, 0, 0.3)"
          nodeColor="rgba(255, 255, 255, 0.1)"
        />


        {/* Drag-to-Delete Trash Zone */}
        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${isDraggingNode ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}>
          <div className={`flex items-center gap-2 px-6 py-3 rounded-2xl shadow-2xl transition-all duration-300 ${isHoveringTrash ? 'bg-red-500/20 border-red-500/50 scale-110' : 'bg-[#111] border-white/10 scale-100'} border`}>
            <Trash2 className={`w-5 h-5 transition-colors ${isHoveringTrash ? 'text-red-400' : 'text-white/40'}`} />
            <span className={`text-[13px] font-medium tracking-wide transition-colors ${isHoveringTrash ? 'text-red-400' : 'text-white/60'}`}>
              Drop to delete
            </span>
          </div>
        </div>
      </ReactFlow>
      
      {/* Cinematic noise overlay */}
      <div className="pointer-events-none absolute inset-0 z-[-1] opacity-[0.03] mix-blend-screen" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
      }} />

      {/* Decorative gradients */}
      <div className="absolute top-0 left-0 w-full h-[150px] bg-gradient-to-b from-[#030303] to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-full h-[100px] bg-gradient-to-t from-[#030303] to-transparent pointer-events-none" />
    </div>
  );
}
