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
};

const initialNodes: AppNode[] = [];
const initialEdges: Edge[] = [];
  


export const useFlowStore = create<FlowState>((set, get) => ({
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
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
    // Sync selected state
    const selectedNode = get().nodes.find((n) => n.selected);
    set({ selectedNodeId: selectedNode ? selectedNode.id : null });
    
    setTimeout(() => set({ isSaving: false }), 600);
  },
  
  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
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

  publishFlow: async () => {
    set({ isPublishing: true });
    // Simulate API delay and validation
    return new Promise((resolve) => {
      setTimeout(() => {
        set({ isPublishing: false });
        resolve();
      }, 1500);
    });
  },
  
  setConnectingNodeId: (id: string | null) => {
    set({ connectingNodeId: id });
  }
}));
