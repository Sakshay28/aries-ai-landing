// ═══════════════════════════════════════════════════════════
// 🔡 Flow Variables System
// ═══════════════════════════════════════════════════════════
// Central registry for all variables available in a flow.
// Sources: system (contact fields), flow (captured by nodes),
//          session (runtime context).
// ═══════════════════════════════════════════════════════════
import type { Node } from '@xyflow/react';

// ─── Types ────────────────────────────────────────────────
export type VariableSource = 'system' | 'flow' | 'session';
export type VariableType   = 'text' | 'number' | 'date' | 'time' | 'boolean';

export interface VariableDefinition {
  name: string;
  label: string;
  source: VariableSource;
  type: VariableType;
  nodeId?: string;
  nodeLabel?: string;
  description?: string;
}

// ─── System Variables (always available) ─────────────────
export const SYSTEM_VARIABLES: VariableDefinition[] = [
  { name: 'wa_name',        label: 'Contact Name',        source: 'system',  type: 'text',   description: "Customer's WhatsApp display name" },
  { name: 'wa_phone',       label: 'Phone Number',         source: 'system',  type: 'text',   description: 'WhatsApp phone number' },
  { name: 'wa_email',       label: 'Email',                source: 'system',  type: 'text',   description: "Customer's email address" },
  { name: 'wa_timezone',    label: 'Timezone',             source: 'system',  type: 'text',   description: "Customer's timezone" },
  { name: 'tenant_name',    label: 'Business Name',        source: 'system',  type: 'text',   description: "Your business name" },
  { name: 'current_date',   label: 'Current Date',         source: 'system',  type: 'date',   description: 'Today\'s date (DD Mon YYYY)' },
  { name: 'current_time',   label: 'Current Time',         source: 'system',  type: 'time',   description: 'Current time (HH:MM)' },
  { name: 'language',       label: 'Language',             source: 'system',  type: 'text',   description: "Customer's detected language" },
];

// ─── Session Variables ────────────────────────────────────
export const SESSION_VARIABLES: VariableDefinition[] = [
  { name: 'last_message',       label: 'Last Message',        source: 'session', type: 'text' },
  { name: 'conversation_id',    label: 'Conversation ID',     source: 'session', type: 'text' },
  { name: 'last_intent',        label: 'Last Intent',         source: 'session', type: 'text' },
  { name: 'last_confidence',    label: 'Intent Confidence',   source: 'session', type: 'number' },
  { name: 'message_count',      label: 'Message Count',       source: 'session', type: 'number' },
];

// ─── Known system variable names (for validation) ────────
export const KNOWN_VARIABLE_NAMES = new Set<string>([
  ...SYSTEM_VARIABLES.map(v => v.name),
  ...SESSION_VARIABLES.map(v => v.name),
  // legacy aliases (used in older flows)
  'name', 'phone', 'email', 'timezone',
]);

// ─── Extract flow-registered variables from nodes ────────
export function getFlowVariables(nodes: Node[]): VariableDefinition[] {
  const vars: VariableDefinition[] = [];

  for (const node of nodes) {
    const data = node.data as Record<string, unknown>;
    const nodeLabel = String(data?.label ?? node.type ?? 'Node');

    // intake_form fields
    if (node.type === 'intake_form' && Array.isArray(data?.fields)) {
      for (const f of data.fields as Array<Record<string, unknown>>) {
        const saveAs = String(f.saveAs ?? '').trim();
        const fieldName = String(f.name ?? '').toLowerCase().replace(/\s+/g, '_');
        const varName = saveAs || fieldName;
        if (varName) {
          vars.push({ name: varName, label: String(f.name ?? varName), source: 'flow', type: 'text', nodeId: node.id, nodeLabel });
        }
      }
    }

    // collect_data fields
    if (node.type === 'collect_data' && Array.isArray(data?.fields)) {
      for (const f of data.fields as unknown[]) {
        const raw = typeof f === 'string' ? f : String((f as Record<string,unknown>)?.name ?? '');
        const varName = raw.toLowerCase().replace(/\s+/g, '_');
        if (varName) {
          vars.push({ name: varName, label: raw, source: 'flow', type: 'text', nodeId: node.id, nodeLabel });
        }
      }
    }

    // extract entities
    if (node.type === 'extract' && Array.isArray(data?.entities)) {
      for (const e of data.entities as string[]) {
        const varName = e.toLowerCase().replace(/\s+/g, '_');
        vars.push({ name: varName, label: e, source: 'flow', type: 'text', nodeId: node.id, nodeLabel });
      }
    }

    // send_buttons → selected_button
    if (node.type === 'send_buttons') {
      vars.push({ name: 'selected_button', label: 'Selected Button', source: 'flow', type: 'text', nodeId: node.id, nodeLabel, description: 'Value of the button the user tapped' });
      if (Array.isArray(data?.buttons)) {
        // also expose each button value for named access
        (data.buttons as Array<Record<string,unknown>>).forEach(btn => {
          const btnLabel = String(btn.label ?? '');
          const btnVal = String(btn.value ?? '');
          if (btnVal) vars.push({ name: btnVal, label: btnLabel || btnVal, source: 'flow', type: 'text', nodeId: node.id, nodeLabel });
        });
      }
    }

    // intent_routing
    if (node.type === 'intent_routing') {
      vars.push({ name: 'matched_intent',    label: 'Matched Intent',     source: 'flow', type: 'text',   nodeId: node.id, nodeLabel });
      vars.push({ name: 'intent_confidence', label: 'Intent Confidence',  source: 'flow', type: 'number', nodeId: node.id, nodeLabel });
    }

    // memory node
    if (node.type === 'memory' && data?.key) {
      const varName = String(data.key).toLowerCase().replace(/\s+/g, '_');
      vars.push({ name: varName, label: String(data.key), source: 'flow', type: 'text', nodeId: node.id, nodeLabel });
    }

    // explicit saveVariable field (used by set_var and other nodes)
    if (data?.saveVariable) {
      const varName = String(data.saveVariable).toLowerCase().replace(/\s+/g, '_');
      if (varName) vars.push({ name: varName, label: String(data.saveVariable), source: 'flow', type: 'text', nodeId: node.id, nodeLabel });
    }
  }

  // Deduplicate by name (first occurrence wins)
  const seen = new Set<string>();
  return vars.filter(v => {
    if (seen.has(v.name)) return false;
    seen.add(v.name);
    return true;
  });
}

// ─── Full variable registry for a flow ───────────────────
// Flow vars take priority over system/session (first-seen deduplication).
export function buildVariableRegistry(nodes: Node[]): VariableDefinition[] {
  const all = [
    ...getFlowVariables(nodes),
    ...SYSTEM_VARIABLES,
    ...SESSION_VARIABLES,
  ];
  const seen = new Set<string>();
  return all.filter(v => {
    if (seen.has(v.name)) return false;
    seen.add(v.name);
    return true;
  });
}

// ─── Resolve {{var}} in a string ─────────────────────────
export function resolveVariables(
  template: string,
  context: Record<string, string>,
  fallback = ''
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return context[key] !== undefined ? String(context[key]) : fallback;
  });
}

// ─── Find broken variable refs in a string ───────────────
export function findUnknownVariables(
  text: string,
  knownVarNames: Set<string>
): string[] {
  const matches = text.match(/\{\{(\w+)\}\}/g) ?? [];
  return matches
    .map(m => m.slice(2, -2))
    .filter(name => !knownVarNames.has(name));
}

// ─── Check if string contains variables ──────────────────
export function containsVariables(text: string): boolean {
  return /\{\{\w+\}\}/.test(text);
}
