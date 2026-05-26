import { create } from 'zustand';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  MarkerType,
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
    // Single set() call — avoids two React renders per drag tick
    set(state => {
      const nodes = applyNodeChanges(changes, state.nodes);
      // Only scan for selection changes when a select/remove event exists.
      // Position changes fire 60x/sec during drag — skip the O(n) scan on those.
      const hasSelectionEvent = changes.some(
        c => c.type === 'select' || c.type === 'remove'
      );
      const selectedNodeId = hasSelectionEvent
        ? (nodes.find(n => n.selected)?.id ?? null)
        : state.selectedNodeId;
      return { nodes, selectedNodeId, isSaving: true };
    });
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

    // Color-code by semantic handle
    let color = "rgba(16,185,129,0.75)"; // green — success / next
    const h = connection.sourceHandle;
    if (h === 'error' || h === 'failed' || h === 'missing' || h === 'fallback' || h === 'false' || h === 'timeout') {
      color = "rgba(239,68,68,0.75)"; // red — failure / false
    } else if (h === 'true') {
      color = "rgba(16,185,129,0.75)"; // green — true
    }

    // Purple for data-flow nodes
    const sourceNode = get().nodes.find(n => n.id === connection.source);
    if (sourceNode?.type === 'memory' || sourceNode?.type === 'knowledge') {
      color = "rgba(168,85,247,0.75)";
    }

    // Label for multi-output handles (keep it short)
    const labelMap: Record<string, string> = {
      success: 'yes', error: 'no', fallback: 'fallback',
      true: 'true', false: 'false', missing: 'missing',
      timeout: 'timeout', found: 'found', assigned: 'assigned',
    };
    const label = h && labelMap[h] ? labelMap[h] : undefined;

    const edge: Edge = {
      ...connection,
      id: `e-${connection.source}-${connection.target}-${h ?? 'default'}-${Date.now()}`,
      type: 'default', // bezier — fluid organic curves vs boxy smoothstep
      animated: false,
      style: { stroke: color, strokeWidth: 2.5 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color,
      },
      ...(label ? {
        label,
        labelBgStyle: { fill: 'rgba(10,12,18,0.9)', fillOpacity: 1 },
        labelStyle: { fill: color, fontWeight: 700, fontSize: 9, letterSpacing: '0.07em', textTransform: 'uppercase' },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 4,
      } : {}),
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
    // No saveHistory() here — calling it on every keystroke clones ALL node/edge
    // arrays and triggers a full Zustand rerender storm. Structural history
    // (add/connect/delete) is saved at those action sites instead.
    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
    }));
    // Debounced autosave
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      const { flowId, saveFlow } = get();
      if (flowId) saveFlow().catch(console.error);
    }, 2000);
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
        const rawEdges: Edge[] = json.data.edges ?? [];
        const normalizedEdges = rawEdges.map((e: Edge) => ({
          ...e,
          type: 'default', // upgrade any legacy smoothstep edges to bezier
        }));
        set({
          flowId: json.data.id,
          nodes: json.data.nodes ?? [],
          edges: normalizedEdges,
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
