import type { Node, Edge } from '@xyflow/react';
import { KNOWN_VARIABLE_NAMES } from '@/lib/flows/variables';

// ─── WHATSAPP LIMITS ─────────────────────────────────────────────────────────
export const WA_LIMITS = {
  REPLY_BUTTONS_MAX: 3,
  LIST_SECTIONS_MAX: 10,
  LIST_ROWS_PER_SECTION: 10,
  MESSAGE_LENGTH: 4096,
  BUTTON_LABEL_MAX: 20,
  BUTTON_ID_MAX: 256,
} as const;

// ─── UPSTREAM NODE HELPERS ───────────────────────────────────────────────────
export function getUpstreamNodes(nodeId: string, nodes: Node[], edges: Edge[]): Node[] {
  const parentIds = edges.filter(e => e.target === nodeId).map(e => e.source);
  return nodes.filter(n => parentIds.includes(n.id));
}

export function getUpstreamButtonsNode(nodeId: string, nodes: Node[], edges: Edge[]): Node | null {
  const parents = getUpstreamNodes(nodeId, nodes, edges);
  return parents.find(n => n.type === 'send_buttons') || null;
}

// ─── FLOW VARIABLES ──────────────────────────────────────────────────────────
export interface FlowVariable {
  name: string;
  source: string;
  nodeId: string;
  type: 'system' | 'flow';
}

export const SYSTEM_VARIABLES: FlowVariable[] = [
  { name: 'wa_name',      source: 'System', nodeId: '', type: 'system' },
  { name: 'wa_phone',     source: 'System', nodeId: '', type: 'system' },
  { name: 'wa_email',     source: 'System', nodeId: '', type: 'system' },
  { name: 'wa_timezone',  source: 'System', nodeId: '', type: 'system' },
  { name: 'tenant_name',  source: 'System', nodeId: '', type: 'system' },
  { name: 'current_date', source: 'System', nodeId: '', type: 'system' },
  { name: 'current_time', source: 'System', nodeId: '', type: 'system' },
  { name: 'language',     source: 'System', nodeId: '', type: 'system' },
  { name: 'last_message', source: 'System', nodeId: '', type: 'system' },
  { name: 'conversation_id', source: 'System', nodeId: '', type: 'system' },
  { name: 'last_intent',  source: 'System', nodeId: '', type: 'system' },
  { name: 'message_count', source: 'System', nodeId: '', type: 'system' },
];

export function getFlowVariables(nodes: Node[]): FlowVariable[] {
  const vars: FlowVariable[] = [...SYSTEM_VARIABLES];
  for (const node of nodes) {
    const data = node.data as Record<string, any>;
    const label = (data?.label as string) || node.type || 'Node';
    if (node.type === 'intake_form' && Array.isArray(data?.fields)) {
      for (const f of data.fields) {
        const varName = f.saveAs || f.name?.toLowerCase().replace(/\s+/g, '_');
        if (varName) vars.push({ name: varName, source: label, nodeId: node.id, type: 'flow' });
      }
    }
    if (node.type === 'collect_data' && Array.isArray(data?.fields)) {
      for (const f of data.fields) {
        const n = typeof f === 'string' ? f.toLowerCase().replace(/\s+/g, '_') : '';
        if (n) vars.push({ name: n, source: label, nodeId: node.id, type: 'flow' });
      }
    }
    if (node.type === 'extract' && Array.isArray(data?.entities)) {
      for (const e of data.entities) vars.push({ name: e, source: label, nodeId: node.id, type: 'flow' });
    }
    if (node.type === 'send_buttons') {
      vars.push({ name: 'selected_button', source: label, nodeId: node.id, type: 'flow' });
    }
    if (node.type === 'intent_routing') {
      vars.push({ name: 'matched_intent', source: label, nodeId: node.id, type: 'flow' });
      vars.push({ name: 'intent_confidence', source: label, nodeId: node.id, type: 'flow' });
    }
  }
  return vars;
}

// ─── NODE VALIDATION ─────────────────────────────────────────────────────────
export type ValidationSeverity = 'ok' | 'warning' | 'error';

export interface ValidationIssue {
  message: string;
  severity: 'warning' | 'error';
}

export interface NodeValidation {
  status: ValidationSeverity;
  issues: ValidationIssue[];
}

export function validateNode(node: Node, nodes: Node[], edges: Edge[]): NodeValidation {
  const issues: ValidationIssue[] = [];
  const data = node.data as Record<string, any>;

  if (node.type !== 'end') {
    if (!edges.some(e => e.source === node.id)) {
      issues.push({ message: 'No outgoing connection', severity: 'warning' });
    }
  }
  if (node.type !== 'trigger' && node.type !== 'keyword_trigger' && node.type !== 'button_trigger' && node.type !== 'ctwa_trigger') {
    if (!edges.some(e => e.target === node.id)) {
      issues.push({ message: 'No incoming connection', severity: 'warning' });
    }
  }

  switch (node.type) {
    case 'send_buttons': {
      const buttons = Array.isArray(data?.buttons) ? data.buttons : [];
      if (buttons.length === 0) {
        issues.push({ message: 'No buttons defined', severity: 'error' });
      } else if (buttons.length > WA_LIMITS.REPLY_BUTTONS_MAX) {
        issues.push({ message: `WhatsApp max ${WA_LIMITS.REPLY_BUTTONS_MAX} reply buttons (you have ${buttons.length})`, severity: 'error' });
      }
      for (const b of buttons) {
        if (!b.label?.trim()) issues.push({ message: 'Button missing label', severity: 'error' });
        if (!b.value?.trim()) issues.push({ message: 'Button missing value', severity: 'error' });
        if (b.label && b.label.length > WA_LIMITS.BUTTON_LABEL_MAX) {
          issues.push({ message: `Label "${b.label}" exceeds ${WA_LIMITS.BUTTON_LABEL_MAX} chars`, severity: 'warning' });
        }
      }
      if (!data?.message?.trim()) issues.push({ message: 'No message text', severity: 'warning' });
      break;
    }
    case 'button_trigger': {
      if ((data?.mode || 'specific') === 'specific' && !data?.button?.trim()) {
        issues.push({ message: 'No button value specified', severity: 'error' });
      }
      break;
    }
    case 'intent_routing': {
      const intents = Array.isArray(data?.intents) ? data.intents : [];
      if (intents.length === 0) issues.push({ message: 'No intents defined', severity: 'error' });
      for (const it of intents) {
        if (!it.name?.trim()) issues.push({ message: 'Intent missing name', severity: 'error' });
        if (!it.keywords?.length) issues.push({ message: `"${it.name || 'unnamed'}" has no keywords`, severity: 'warning' });
      }
      break;
    }
    case 'intake_form': {
      const fields = Array.isArray(data?.fields) ? data.fields : [];
      if (fields.length === 0) issues.push({ message: 'No form fields', severity: 'error' });
      for (const f of fields) {
        if (!f.name?.trim()) issues.push({ message: 'Field missing name', severity: 'error' });
      }
      break;
    }
    case 'condition': {
      if (!data?.field?.trim()) issues.push({ message: 'Missing variable field', severity: 'error' });
      const op = data?.operator || '==';
      if (op !== 'exists' && op !== 'empty' && !data?.value?.toString().trim()) {
        issues.push({ message: 'Missing comparison value', severity: 'warning' });
      }
      break;
    }
    case 'webhook': {
      if (!data?.url?.trim()) issues.push({ message: 'Missing endpoint URL', severity: 'error' });
      break;
    }
    case 'standard': {
      if (!data?.content?.trim()) issues.push({ message: 'Empty message', severity: 'warning' });
      if (data?.content && data.content.length > WA_LIMITS.MESSAGE_LENGTH) {
        issues.push({ message: `Exceeds ${WA_LIMITS.MESSAGE_LENGTH} char limit`, severity: 'error' });
      }
      break;
    }
    case 'trigger':
    case 'keyword_trigger': {
      if ((data?.triggerType || 'keyword') === 'keyword' && !data?.keywords?.trim()) {
        issues.push({ message: 'No keywords defined', severity: 'warning' });
      }
      break;
    }
  }

  const hasError = issues.some(i => i.severity === 'error');
  const hasWarning = issues.some(i => i.severity === 'warning');
  return { status: hasError ? 'error' : hasWarning ? 'warning' : 'ok', issues };
}

// ─── CIRCULAR FLOW DETECTION ─────────────────────────────────────────────────
// DFS — returns nodeIds that are part of a cycle
export function detectCircularFlow(nodes: Node[], edges: Edge[]): string[] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    const targets = adj.get(e.source);
    if (targets) targets.push(e.target);
  }
  const visited = new Set<string>();
  const stack = new Set<string>();
  const cycleNodes: string[] = [];
  function dfs(id: string): boolean {
    if (stack.has(id)) { if (!cycleNodes.includes(id)) cycleNodes.push(id); return true; }
    if (visited.has(id)) return false;
    visited.add(id); stack.add(id);
    for (const next of (adj.get(id) || [])) dfs(next);
    stack.delete(id);
    return false;
  }
  for (const n of nodes) if (!visited.has(n.id)) dfs(n.id);
  return cycleNodes;
}

// ─── BROKEN VARIABLE REFERENCES ──────────────────────────────────────────────
export function findBrokenVariableRefs(
  nodes: Node[]
): Array<{ nodeId: string; nodeLabel: string; variable: string }> {
  const flowVarNames = new Set(getFlowVariables(nodes).map(v => v.name));
  // Merge with all known system + session var names from the central registry
  const allKnown = new Set([...flowVarNames, ...KNOWN_VARIABLE_NAMES]);
  const broken: Array<{ nodeId: string; nodeLabel: string; variable: string }> = [];
  const VAR_PATTERN = /\{\{([\w.]+)\}\}/g;
  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;
    const label = (data?.label as string) || node.type || 'Unknown';
    const content = ((data?.content as string) || (data?.message as string) || '');
    let match: RegExpExecArray | null;
    VAR_PATTERN.lastIndex = 0;
    while ((match = VAR_PATTERN.exec(content)) !== null) {
      const varName = match[1].split('.')[0];
      if (!allKnown.has(varName)) {
        broken.push({ nodeId: node.id, nodeLabel: label, variable: match[1] });
      }
    }
  }
  return broken;
}

// ─── MISSING FALLBACK PATH CHECK ─────────────────────────────────────────────
export function findMissingFallbacks(nodes: Node[], edges: Edge[]): string[] {
  const missing: string[] = [];
  for (const node of nodes) {
    if (node.type === 'intent_routing') {
      const hasFallback = edges.some(e => e.source === node.id && e.sourceHandle === 'fallback');
      if (!hasFallback) missing.push(node.id);
    }
    if (node.type === 'condition' || node.type === 'condition_check') {
      const hasFalse = edges.some(
        e => e.source === node.id && (e.sourceHandle === 'false' || e.sourceHandle === 'else')
      );
      if (!hasFalse) missing.push(node.id);
    }
  }
  return missing;
}

// ─── FLOW VALIDATION ─────────────────────────────────────────────────────────
export interface FlowHealthReport {
  canPublish: boolean;
  criticalCount: number;
  warningCount: number;
  issues: Array<{ nodeId: string; nodeLabel: string; nodeType: string; issue: ValidationIssue }>;
}

export function validateFlow(nodes: Node[], edges: Edge[]): FlowHealthReport {
  const issues: FlowHealthReport['issues'] = [];

  // 1. Trigger existence
  const hasTrigger = nodes.some(n => n.type === 'trigger' || n.type === 'keyword_trigger');
  if (!hasTrigger && nodes.length > 0) {
    issues.push({ nodeId: '', nodeLabel: 'Flow', nodeType: '', issue: { message: 'No trigger node — flow cannot start', severity: 'error' } });
  }

  // 2. Circular flow detection — publish blocker
  const cycleNodes = detectCircularFlow(nodes, edges);
  for (const nodeId of cycleNodes) {
    const node = nodes.find(n => n.id === nodeId);
    const label = (node?.data as any)?.label || node?.type || nodeId;
    issues.push({ nodeId, nodeLabel: label, nodeType: node?.type || '', issue: { message: 'Part of a circular loop — flow will run forever', severity: 'error' } });
  }

  // 3. Per-node validation
  for (const node of nodes) {
    const v = validateNode(node, nodes, edges);
    const label = (node.data as any)?.label || node.type || 'Unknown';
    for (const issue of v.issues) {
      issues.push({ nodeId: node.id, nodeLabel: label, nodeType: node.type || '', issue });
    }
  }

  // 4. Orphan nodes (no connections at all, not trigger/end)
  for (const node of nodes) {
    if (node.type === 'trigger' || node.type === 'keyword_trigger' || node.type === 'end') continue;
    const hasAnyEdge = edges.some(e => e.source === node.id || e.target === node.id);
    if (!hasAnyEdge) {
      const label = (node.data as any)?.label || node.type || 'Unknown';
      issues.push({ nodeId: node.id, nodeLabel: label, nodeType: node.type || '', issue: { message: 'Orphan node — completely disconnected from flow', severity: 'warning' } });
    }
  }

  // 5. Missing fallback paths
  for (const nodeId of findMissingFallbacks(nodes, edges)) {
    const node = nodes.find(n => n.id === nodeId);
    const label = (node?.data as any)?.label || node?.type || nodeId;
    issues.push({ nodeId, nodeLabel: label, nodeType: node?.type || '', issue: { message: 'No fallback/else path — some users will get stuck', severity: 'warning' } });
  }

  // 6. Broken variable references
  for (const { nodeId, nodeLabel, variable } of findBrokenVariableRefs(nodes)) {
    const node = nodes.find(n => n.id === nodeId);
    issues.push({ nodeId, nodeLabel, nodeType: node?.type || '', issue: { message: `Broken variable reference: {{${variable}}} is never set`, severity: 'warning' } });
  }

  const criticalCount = issues.filter(i => i.issue.severity === 'error').length;
  const warningCount = issues.filter(i => i.issue.severity === 'warning').length;
  return { canPublish: criticalCount === 0, criticalCount, warningCount, issues };
}
