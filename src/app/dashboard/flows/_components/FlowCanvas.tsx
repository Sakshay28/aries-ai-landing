"use client";

import { useCallback, useRef, useState, useEffect } from "react";
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
  CollectDataNode 
} from "./CustomNodes";
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
  collect_data: CollectDataNode,
  show_products: StandardNode,
  order_tracking: StandardNode,
  returns_handler: StandardNode,
  cart_abandonment: StandardNode,
};

// Logical canvas boundaries for minimap scaling
const CANVAS_W = 2000;
const CANVAS_H = 1200;

function getNodeDimensions(type: string) {
  switch (type) {
    case 'standard':
    case 'show_products':
    case 'order_tracking':
    case 'returns_handler':
    case 'cart_abandonment':
      return { width: 280, height: 120 };
    case 'interruption':
      return { width: 340, height: 230 };
    case 'resume':
      return { width: 240, height: 60 };
    case 'condition':
      return { width: 260, height: 130 };
    case 'webhook':
      return { width: 260, height: 130 };
    case 'delay':
      return { width: 200, height: 60 };
    case 'handoff':
      return { width: 240, height: 100 };
    case 'knowledge':
      return { width: 260, height: 130 };
    case 'end':
      return { width: 200, height: 60 };
    case 'trigger':
      return { width: 220, height: 105 };
    case 'extract':
      return { width: 220, height: 110 };
    case 'format':
      return { width: 220, height: 95 };
    case 'memory':
      return { width: 220, height: 95 };
    case 'wait':
      return { width: 220, height: 120 };
    case 'resume_parser':
      return { width: 220, height: 110 };
    case 'collect_data':
      return { width: 260, height: 180 };
    default:
      return { width: 220, height: 100 };
  }
}

function getNodeCategoryColor(type: string) {
  if ([
    'trigger', 'keyword_trigger', 'button_trigger', 'form_trigger', 
    'payment_trigger', 'appointment_trigger', 'lead_trigger', 
    'webhook_trigger', 'schedule_trigger', 'wait', 'resume', 'inactivity_trigger'
  ].includes(type)) {
    return '#3B82F6'; // Blue for Triggers
  }
  if ([
    'standard', 'send_media', 'send_audio', 'send_location', 'send_buttons', 
    'send_list', 'send_catalog', 'send_quick_replies', 'format', 
    'collect_input', 'ask_question', 'multi_step_form', 'handoff', 
    'assign_agent', 'transfer_dept', 'collect_data'
  ].includes(type)) {
    return '#12B76A'; // Green for Messaging
  }
  if ([
    'condition', 'interruption', 'extract', 'memory', 'knowledge', 
    'sentiment', 'language', 'translate', 'smart_fallback', 'intent_routing', 
    'condition_check', 'ab_test', 'random_branch', 'loop', 'end'
  ].includes(type)) {
    return '#7C3AED'; // Purple for AI & Logic
  }
  if ([
    'show_products', 'product_search', 'product_rec', 'add_cart', 'view_cart', 
    'cart_abandonment', 'checkout_link', 'payment_link', 'cod_confirm', 
    'order_confirm', 'order_tracking', 'delivery_status', 'returns_handler', 
    'refund_status', 'invoice_sender', 'coupon', 'out_of_stock', 'back_in_stock', 
    'upsell', 'reorder', 'wishlist', 'review_req', 'address_col'
  ].includes(type)) {
    return '#06B6D4'; // Cyan for E-Commerce
  }
  return '#F79009'; // Orange for Appointments & Services
}

function getPortCoordinates(node: any, handleType: 'source' | 'target', handleId?: string | null) {
  const nodeX = node.x !== undefined ? node.x : (node.position?.x ?? 0);
  const nodeY = node.y !== undefined ? node.y : (node.position?.y ?? 0);
  const { width: W, height: H } = getNodeDimensions(node.type);
  
  if (handleType === 'target') {
    return { x: nodeX + W / 2, y: nodeY };
  } else {
    let pct = 0.5;
    if (node.type === 'interruption' || node.type === 'condition') {
      if (handleId === 'success' || handleId === 'true') pct = 0.25;
      if (handleId === 'fallback' || handleId === 'false') pct = 0.75;
    } else if (node.type === 'webhook' || node.type === 'extract' || node.type === 'resume_parser') {
      if (handleId === 'success') pct = 0.30;
      if (handleId === 'error' || handleId === 'missing') pct = 0.70;
    }
    return { x: nodeX + W * pct, y: nodeY + H };
  }
}

function getBezierPath(x1: number, y1: number, x2: number, y2: number) {
  const dy = Math.abs(y2 - y1);
  const cp1y = y1 + dy / 2;
  const cp2y = y2 - dy / 2;
  return `M ${x1} ${y1} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`;
}

export default function FlowCanvas() {
  const { 
    nodes, 
    edges, 
    selectedNodeId, 
    setSelectedNodeId, 
    undo, 
    redo, 
    saveHistory 
  } = useFlowStore();

  const canvasRef = useRef<HTMLDivElement>(null);
  
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [isHoveringTrash, setIsHoveringTrash] = useState(false);
  const [connectingSource, setConnectingSource] = useState<{ nodeId: string; handleId: string | null } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const dragNodeIdRef = useRef<string | null>(null);
  const moveOffsetRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize coordinates to guarantee x/y are present
  const initializedNodes = nodes.map(node => ({
    ...node,
    x: node.x !== undefined ? node.x : (node.position?.x ?? 0),
    y: node.y !== undefined ? node.y : (node.position?.y ?? 0)
  }));

  // Keyboard Shortcuts for Undo / Redo / Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.tagName === 'SELECT' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );
      if (isInput) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        const currentSelectedId = useFlowStore.getState().selectedNodeId;
        if (currentSelectedId) {
          e.preventDefault();
          saveHistory();
          useFlowStore.setState({
            nodes: nodes.filter(n => n.id !== currentSelectedId),
            edges: edges.filter(ed => ed.source !== currentSelectedId && ed.target !== currentSelectedId),
            selectedNodeId: null
          });
          toast.success("Node deleted");
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, saveHistory, nodes, edges]);

  // Window drag handlers to prevent stale closure bugs
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!dragNodeIdRef.current || !moveOffsetRef.current || !canvasRef.current) return;
      
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const newX = e.clientX - canvasRect.left - moveOffsetRef.current.x;
      const newY = e.clientY - canvasRect.top - moveOffsetRef.current.y;
      
      setIsHoveringTrash(e.clientY > window.innerHeight - 120);

      const currentNodes = useFlowStore.getState().nodes;
      useFlowStore.setState({
        nodes: currentNodes.map(n => 
          n.id === dragNodeIdRef.current 
            ? { ...n, x: newX, y: newY, position: { x: newX, y: newY } } 
            : n
        )
      });
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      if (dragNodeIdRef.current) {
        const nodeId = dragNodeIdRef.current;
        dragNodeIdRef.current = null;
        moveOffsetRef.current = null;
        setIsDraggingNode(false);
        
        if (e.clientY > window.innerHeight - 120) {
          saveHistory();
          const currentNodes = useFlowStore.getState().nodes;
          const currentEdges = useFlowStore.getState().edges;
          useFlowStore.setState({
            nodes: currentNodes.filter(n => n.id !== nodeId),
            edges: currentEdges.filter(ed => ed.source !== nodeId && ed.target !== nodeId),
            selectedNodeId: null
          });
          toast.success("Node deleted");
        } else {
          // Trigger autosave on successful repositioning
          const { flowId, saveFlow } = useFlowStore.getState();
          if (flowId) {
            saveFlow().catch(console.error);
          }
        }
        setIsHoveringTrash(false);
      }
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [saveHistory]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!canvasRef.current) return;

      const dragDataStr = event.dataTransfer.getData('application/reactflow');
      if (!dragDataStr) return;
      
      let type = '';
      let nodeId = '';
      try {
        const parsed = JSON.parse(dragDataStr);
        type = parsed.type;
        nodeId = parsed.id;
      } catch (e) {
        type = dragDataStr;
        nodeId = dragDataStr;
      }

      const { width: NODE_WIDTH, height: NODE_HEIGHT } = getNodeDimensions(type);
      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left - NODE_WIDTH / 2;
      const y = event.clientY - rect.top - NODE_HEIGHT / 2;

      const newNode = {
        id: `node_${Math.random().toString(36).substr(2, 9)}`,
        type,
        x,
        y,
        position: { x, y },
        data: getDefaultNodeData(nodeId),
      };

      saveHistory();
      const currentNodes = useFlowStore.getState().nodes;
      useFlowStore.setState({
        nodes: [...currentNodes, newNode],
        selectedNodeId: newNode.id
      });

      // Trigger autosave
      const { flowId, saveFlow } = useFlowStore.getState();
      if (flowId) {
        saveFlow().catch(console.error);
      }
    },
    [saveHistory],
  );

  const handleNodeMouseDown = (e: React.MouseEvent, node: any) => {
    if (e.button !== 0) return; // Left click only
    const target = e.target as HTMLElement;
    if (
      target.closest('button') || 
      target.closest('input') || 
      target.closest('select') || 
      target.closest('textarea') || 
      target.closest('.node-handle')
    ) {
      return;
    }
    
    e.preventDefault();
    dragNodeIdRef.current = node.id;
    setSelectedNodeId(node.id);
    
    const canvasRect = canvasRef.current!.getBoundingClientRect();
    const nodeX = node.x !== undefined ? node.x : (node.position?.x ?? 0);
    const nodeY = node.y !== undefined ? node.y : (node.position?.y ?? 0);
    
    moveOffsetRef.current = {
      x: e.clientX - canvasRect.left - nodeX,
      y: e.clientY - canvasRect.top - nodeY
    };
    
    setIsDraggingNode(true);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (connectingSource && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const handleEl = target.closest('.node-handle') as HTMLElement;
    
    if (handleEl) {
      e.stopPropagation();
      const nodeEl = handleEl.closest('[data-node-id]') as HTMLElement;
      if (!nodeEl) return;
      
      const nodeId = nodeEl.getAttribute('data-node-id')!;
      const handleType = handleEl.getAttribute('data-handle-type')!;
      const handleId = handleEl.getAttribute('data-handle-id');
      const isSource = handleType === 'source';
      
      if (isSource) {
        setConnectingSource({ nodeId, handleId });
        const rect = canvasRef.current!.getBoundingClientRect();
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      } else {
        if (connectingSource && connectingSource.nodeId !== nodeId) {
          saveHistory();
          const currentEdges = useFlowStore.getState().edges;
          
          let color = "rgba(16,185,129,0.5)"; // Green (success default)
          const sourceHandle = connectingSource.handleId;
          if (sourceHandle === 'error' || sourceHandle === 'missing' || sourceHandle === 'fallback') {
            color = "rgba(239,68,68,0.5)"; // Red
          } else if (sourceHandle === 'true' || sourceHandle === 'false') {
            color = "rgba(245,158,11,0.5)"; // Yellow
          }
          
          const sourceNode = nodes.find(n => n.id === connectingSource.nodeId);
          if (sourceNode?.type === 'memory' || sourceNode?.type === 'knowledge') {
            color = "rgba(168,85,247,0.5)"; // Purple
          }

          const newEdge = {
            id: `e-${connectingSource.nodeId}-${nodeId}-${Date.now()}`,
            source: connectingSource.nodeId,
            target: nodeId,
            sourceHandle: sourceHandle || null,
            targetHandle: handleId || null,
            type: 'smoothstep',
            animated: true,
            style: { stroke: color, strokeWidth: 2 },
            label: sourceHandle ? sourceHandle.toUpperCase() : undefined,
            labelBgStyle: { fill: '#111', color: '#fff', fillOpacity: 0.8 },
            labelStyle: { fill: '#fff', fontWeight: 600, fontSize: 10, letterSpacing: 1 },
          };
          
          useFlowStore.setState({
            edges: [...currentEdges, newEdge]
          });

          // Trigger autosave
          const { flowId, saveFlow } = useFlowStore.getState();
          if (flowId) {
            saveFlow().catch(console.error);
          }
        }
        setConnectingSource(null);
        setMousePos(null);
      }
    } else {
      if (connectingSource) {
        setConnectingSource(null);
        setMousePos(null);
      }
      setSelectedNodeId(null);
    }
  };

  return (
    <div 
      className="flex-1 h-full relative overflow-hidden select-none" 
      ref={canvasRef}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseMove={handleCanvasMouseMove}
      onClick={handleCanvasClick}
      style={{
        backgroundColor: '#050508',
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.28) 1.2px, transparent 1.2px)',
        backgroundSize: '24px 24px'
      }}
    >
      {/* Connections SVG Layer */}
      <svg className="absolute inset-0 pointer-events-none w-full h-full z-10">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="6"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 2 L 8 5 L 0 8 z" fill="rgba(255,255,255,0.3)" />
          </marker>
        </defs>
        
        {/* Placed Connections */}
        {initializedNodes.length > 0 && edges.map(edge => {
          const sourceNode = initializedNodes.find(n => n.id === edge.source);
          const targetNode = initializedNodes.find(n => n.id === edge.target);
          if (!sourceNode || !targetNode) return null;
          
          const p1 = getPortCoordinates(sourceNode, 'source', edge.sourceHandle);
          const p2 = getPortCoordinates(targetNode, 'target', edge.targetHandle);
          const path = getBezierPath(p1.x, p1.y, p2.x, p2.y);
          
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          
          const label = edge.label || (edge.sourceHandle ? String(edge.sourceHandle).toUpperCase() : '');
          
          const onDeleteEdge = (e: React.MouseEvent) => {
            e.stopPropagation();
            saveHistory();
            const currentEdges = useFlowStore.getState().edges;
            useFlowStore.setState({
              edges: currentEdges.filter(ed => ed.id !== edge.id)
            });
            // Trigger autosave
            const { flowId, saveFlow } = useFlowStore.getState();
            if (flowId) {
              saveFlow().catch(console.error);
            }
          };

          return (
            <g key={edge.id} className="group/edge cursor-pointer pointer-events-auto">
              <path 
                d={path} 
                fill="none" 
                stroke={edge.style?.stroke || 'rgba(255,255,255,0.15)'} 
                strokeWidth={3} 
                className="transition-all duration-300 group-hover/edge:stroke-red-500/80" 
              />
              {label && (
                <foreignObject 
                  x={midX - 40} 
                  y={midY - 12} 
                  width={80} 
                  height={24} 
                  className="overflow-visible"
                >
                  <div className="flex items-center justify-center h-full">
                    <span className="px-2 py-0.5 rounded bg-[#111] border border-white/10 text-[9px] font-bold text-white/80 uppercase tracking-widest pointer-events-none select-none">
                      {label}
                    </span>
                  </div>
                </foreignObject>
              )}
              {/* Thicker overlay path for easier hover and clicking */}
              <path 
                d={path} 
                fill="none" 
                stroke="transparent" 
                strokeWidth={15} 
                className="cursor-pointer"
                onClick={onDeleteEdge} 
              />
            </g>
          );
        })}

        {/* Temporary Connection Line */}
        {connectingSource && mousePos && (() => {
          const sourceNode = initializedNodes.find(n => n.id === connectingSource.nodeId);
          if (!sourceNode) return null;
          const p1 = getPortCoordinates(sourceNode, 'source', connectingSource.handleId);
          return (
            <path 
              d={getBezierPath(p1.x, p1.y, mousePos.x, mousePos.y)} 
              fill="none" 
              stroke="rgba(6, 182, 212, 0.6)" 
              strokeWidth={2} 
              strokeDasharray="4 4"
            />
          );
        })()}
      </svg>

      {/* Nodes Container */}
      <div className="absolute inset-0 z-20 overflow-auto w-full h-full">
        <div style={{ width: `${CANVAS_W}px`, height: `${CANVAS_H}px`, position: 'relative' }}>
          {initializedNodes.map((node) => {
            const NodeComponent = nodeTypes[node.type as keyof typeof nodeTypes] || StandardNode;
            const isSelected = selectedNodeId === node.id;
            const isDraggingThisNode = isDraggingNode && dragNodeIdRef.current === node.id;
            const zIndex = isSelected ? 30 : 20;

            return (
              <div
                key={node.id}
                data-node-id={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                className="absolute transition-shadow duration-150"
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  position: 'absolute',
                  userSelect: 'none',
                  zIndex: zIndex,
                  cursor: isDraggingThisNode ? 'grabbing' : 'grab',
                }}
              >
                <NodeComponent 
                  id={node.id} 
                  data={node.data} 
                  selected={isSelected} 
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Mini-map */}
      <div 
        className="absolute z-50 pointer-events-none"
        style={{
          bottom: '16px',
          right: '16px',
          width: '180px',
          height: '120px',
          background: 'rgba(5, 5, 15, 0.92)',
          border: '1px solid #1e2030',
          borderRadius: '8px',
          overflow: 'hidden'
        }}
      >
        {/* Dot grid inside minimap */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.14) 0.6px, transparent 0.6px)',
            backgroundSize: '12px 12px',
            opacity: 1
          }}
        />

        {/* Nodes mapped onto Mini-map */}
        {initializedNodes.map((node) => {
          const mx = Math.max(0, Math.min(164, (node.x / CANVAS_W) * 180));
          const my = Math.max(0, Math.min(108, (node.y / CANVAS_H) * 120));
          const accentColor = getNodeCategoryColor(node.type);

          return (
            <div
              key={`mini-${node.id}`}
              className="absolute"
              style={{
                left: `${mx}px`,
                top: `${my}px`,
                width: '14px',
                height: '8px',
                borderRadius: '2px',
                backgroundColor: accentColor,
              }}
            />
          );
        })}

        {/* Minimap Label */}
        <div 
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            fontSize: '9px',
            color: '#444',
            fontWeight: 'bold',
            letterSpacing: '0.05em',
            fontFamily: 'monospace'
          }}
        >
          MINIMAP
        </div>
      </div>

      {/* Drag-to-Delete Trash Zone */}
      <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${isDraggingNode ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}>
        <div className={`flex items-center gap-2 px-6 py-3 rounded-2xl shadow-2xl transition-all duration-300 ${isHoveringTrash ? 'bg-red-500/20 border-red-500/50 scale-110' : 'bg-[#111] border-white/10 scale-100'} border`}>
          <Trash2 className={`w-5 h-5 transition-colors ${isHoveringTrash ? 'text-red-400' : 'text-white/40'}`} />
          <span className={`text-[13px] font-medium tracking-wide transition-colors ${isHoveringTrash ? 'text-red-400' : 'text-white/60'}`}>
            Drop to delete
          </span>
        </div>
      </div>

      {/* Cinematic noise overlay */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.03] mix-blend-screen" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")',
      }} />

      {/* Decorative gradients */}
      <div className="absolute top-0 left-0 w-full h-[150px] bg-gradient-to-b from-[#050508] to-transparent pointer-events-none z-10" />
      <div className="absolute bottom-0 left-0 w-full h-[100px] bg-gradient-to-t from-[#050508] to-transparent pointer-events-none z-10" />
    </div>
  );
}
