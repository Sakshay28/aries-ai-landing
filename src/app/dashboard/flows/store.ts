import { create } from 'zustand';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';

export type AppNode = Node;

type FlowState = {
  flowId: string | null;
  nodes: AppNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  isSimulating: boolean;
  isPublishing: boolean;
  isSaving: boolean;
  connectingNodeId: string | null;
  history: { past: { nodes: AppNode[]; edges: Edge[] }[]; future: { nodes: AppNode[]; edges: Edge[] }[] };
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (node: AppNode) => void;
  updateNodeData: (id: string, data: any) => void;
  setSelectedNodeId: (id: string | null) => void;
  setIsSimulating: (isSimulating: boolean) => void;
  publishFlow: () => Promise<void>;
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
  setConnectingNodeId: (id: string | null) => void;
  loadTemplate: (nodes: AppNode[], edges: Edge[]) => void;
  loadFlow: (id: string) => Promise<void>;
  saveFlow: (name?: string) => Promise<string | null>;
  setFlowId: (id: string) => void;
};

const initialNodes: AppNode[] = [];
const initialEdges: Edge[] = [];

let _saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useFlowStore = create<FlowState>((set, get) => ({
  flowId: null,
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId: null,
  isSimulating: false,
  isPublishing: false,
  isSaving: false,
  connectingNodeId: null,
  history: { past: [], future: [] },
  
  saveHistory: () => {
    set((state) => ({
      history: {
        past: [...state.history.past, { nodes: state.nodes, edges: state.edges }].slice(-50), // keep last 50
        future: [],
      }
    }));
  },

  loadTemplate: (nodes: AppNode[], edges: Edge[]) => {
    set({ nodes, edges, history: { past: [], future: [] } });
  },

  undo: () => {
    set((state) => {
      if (state.history.past.length === 0) return state;
      const previous = state.history.past[state.history.past.length - 1];
      const newPast = state.history.past.slice(0, -1);
      return {
        nodes: previous.nodes,
        edges: previous.edges,
        history: {
          past: newPast,
          future: [{ nodes: state.nodes, edges: state.edges }, ...state.history.future],
        }
      };
    });
  },

  redo: () => {
    set((state) => {
      if (state.history.future.length === 0) return state;
      const next = state.history.future[0];
      const newFuture = state.history.future.slice(1);
      return {
        nodes: next.nodes,
        edges: next.edges,
        history: {
          past: [...state.history.past, { nodes: state.nodes, edges: state.edges }],
          future: newFuture,
        }
      };
    });
  },

  onNodesChange: (changes: NodeChange<AppNode>[]) => {
    set({ isSaving: true });
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    const selectedNode = get().nodes.find((n) => n.selected);
    set({ selectedNodeId: selectedNode ? selectedNode.id : null });
    // Debounced auto-save — only if we have a flowId already
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      const { flowId, saveFlow } = get();
      if (flowId) saveFlow().catch(console.error);
      else set({ isSaving: false });
    }, 2000);
  },
  
  onEdgesChange: (changes: EdgeChange[]) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      const { flowId, saveFlow } = get();
      if (flowId) saveFlow().catch(console.error);
    }, 2000);
  },
  
  onConnect: (connection: Connection) => {
    get().saveHistory();
    let color = "rgba(16,185,129,0.5)"; // Green (success default)
    if (connection.sourceHandle === 'error' || connection.sourceHandle === 'missing' || connection.sourceHandle === 'fallback') {
      color = "rgba(239,68,68,0.5)"; // Red
    } else if (connection.sourceHandle === 'true' || connection.sourceHandle === 'false') {
      color = "rgba(245,158,11,0.5)"; // Yellow
    }
    
    // Check if source node is Memory or Knowledge (purple data flow)
    const sourceNode = get().nodes.find(n => n.id === connection.source);
    if (sourceNode?.type === 'memory' || sourceNode?.type === 'knowledge') {
      color = "rgba(168,85,247,0.5)"; // Purple
    }

    const edge = { 
      ...connection, 
      type: 'smoothstep', 
      animated: true, 
      style: { stroke: color, strokeWidth: 2 },
      label: connection.sourceHandle ? connection.sourceHandle.toUpperCase() : undefined,
      labelBgStyle: { fill: '#111', color: '#fff', fillOpacity: 0.8 },
      labelStyle: { fill: '#fff', fontWeight: 600, fontSize: 10, letterSpacing: 1 },
    };
    
    set({ edges: addEdge(edge, get().edges) });
  },
  
  addNode: (node: AppNode) => {
    get().saveHistory();
    set({
      nodes: [...get().nodes, node],
    });
  },

  updateNodeData: (id: string, data: any) => {
    get().saveHistory();
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, ...data } };
        }
        return node;
      }),
    });
  },

  setSelectedNodeId: (id: string | null) => {
    set({ selectedNodeId: id });
  },

  setIsSimulating: (isSimulating: boolean) => {
    set({ isSimulating });
  },

  setFlowId: (id: string) => set({ flowId: id }),

  loadFlow: async (id: string) => {
    if (id === 'new') return;
    try {
      const res = await fetch(`/api/dashboard/flows/${id}`);
      const json = await res.json();
      if (json.success && json.data) {
        set({
          flowId: json.data.id,
          nodes: json.data.nodes ?? [],
          edges: json.data.edges ?? [],
          history: { past: [], future: [] },
        });
      }
    } catch (e) {
      console.error('loadFlow error:', e);
    }
  },

  saveFlow: async (name?: string) => {
    const { flowId, nodes, edges } = get();
    set({ isSaving: true });
    try {
      if (flowId) {
        const body: Record<string, unknown> = { nodes, edges };
        if (name) body.name = name;
        await fetch(`/api/dashboard/flows/${flowId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return flowId;
      } else {
        const res = await fetch('/api/dashboard/flows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name || 'Untitled Flow', nodes, edges }),
        });
        const json = await res.json();
        if (json.success) {
          set({ flowId: json.data.id });
          return json.data.id as string;
        }
      }
    } finally {
      set({ isSaving: false });
    }
    return null;
  },

  publishFlow: async () => {
    set({ isPublishing: true });
    const { flowId, nodes, edges, saveFlow } = get();
    try {
      let id = flowId;
      if (!id) {
        id = await saveFlow();
      }
      if (id) {
        // Extract trigger config from the trigger node
        const triggerNode = nodes.find(n => n.type === 'trigger' || n.type === 'keyword_trigger');
        const triggerType = (triggerNode?.data?.triggerType as string) || 'keyword';
        const rawKeywords = (triggerNode?.data?.keywords as string) || '';
        const triggerKeywords = rawKeywords
          .split(',')
          .map((k: string) => k.trim().toLowerCase())
          .filter(Boolean);

        await fetch(`/api/dashboard/flows/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodes,
            edges,
            is_active: true,
            trigger_type: triggerType,
            trigger_keywords: triggerKeywords,
          }),
        });
      }
    } finally {
      set({ isPublishing: false });
    }
  },
  
  setConnectingNodeId: (id: string | null) => {
    set({ connectingNodeId: id });
  }
}));
