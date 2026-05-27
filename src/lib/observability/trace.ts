// ═══════════════════════════════════════════════════════════
// 📊 Observability — Conversation Trace & Flow Execution Log
// ═══════════════════════════════════════════════════════════
// Every message is traceable by:
//   message_id → tenant_id → flow_id → node_path
//
// Flow execution logs capture:
//   which node was entered, action taken, result, latency
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';

// ─── Types ────────────────────────────────────────────────────
export interface ConversationTraceEntry {
  tenantId: string;
  conversationId: string;
  messageId?: string;
  flowId?: string;
  nodeId?: string;
  nodeType?: string;
  action: string;         // e.g. 'message_received', 'node_executed', 'handoff_triggered'
  payload?: unknown;
  latencyMs?: number;
  meta?: Record<string, unknown>;
}

export interface FlowExecutionLog {
  tenantId: string;
  flowId: string;
  conversationId: string;
  nodePath: string[];     // ordered list of node IDs traversed
  totalNodes: number;
  durationMs: number;
  outcome: 'completed' | 'handoff' | 'error' | 'wait';
  errorMessage?: string;
}

// ─── Log a conversation trace entry ──────────────────────────
// Fire-and-forget: never throws, never blocks message delivery
export async function logTrace(entry: ConversationTraceEntry): Promise<void> {
  try {
    await supabaseAdmin.from('conversation_traces').insert({
      tenant_id: entry.tenantId,
      conversation_id: entry.conversationId,
      message_id: entry.messageId ?? null,
      flow_id: entry.flowId ?? null,
      node_id: entry.nodeId ?? null,
      node_type: entry.nodeType ?? null,
      action: entry.action,
      payload: entry.payload ? JSON.stringify(entry.payload) : null,
      latency_ms: entry.latencyMs ?? null,
      meta: entry.meta ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    // Observability must never crash the main pipeline
    console.warn('⚠️ logTrace failed (non-critical):', (err as Error).message);
  }
}

// ─── Log full flow execution ──────────────────────────────────
export async function logFlowExecution(log: FlowExecutionLog): Promise<void> {
  try {
    await supabaseAdmin.from('flow_execution_logs').insert({
      tenant_id: log.tenantId,
      flow_id: log.flowId,
      conversation_id: log.conversationId,
      node_path: log.nodePath,
      total_nodes: log.totalNodes,
      duration_ms: log.durationMs,
      outcome: log.outcome,
      error_message: log.errorMessage ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('⚠️ logFlowExecution failed (non-critical):', (err as Error).message);
  }
}

// ─── SQL migration for these tables ──────────────────────────
// Run in Supabase SQL editor:
//
// CREATE TABLE IF NOT EXISTS conversation_traces (
//   id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
//   conversation_id uuid,
//   message_id      text,
//   flow_id         uuid,
//   node_id         text,
//   node_type       text,
//   action          text NOT NULL,
//   payload         text,
//   latency_ms      integer,
//   meta            jsonb,
//   created_at      timestamptz DEFAULT now()
// );
// CREATE INDEX ON conversation_traces (tenant_id, conversation_id, created_at DESC);
//
// CREATE TABLE IF NOT EXISTS flow_execution_logs (
//   id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
//   flow_id         uuid,
//   conversation_id uuid,
//   node_path       text[],
//   total_nodes     integer,
//   duration_ms     integer,
//   outcome         text,
//   error_message   text,
//   created_at      timestamptz DEFAULT now()
// );
// CREATE INDEX ON flow_execution_logs (tenant_id, flow_id, created_at DESC);
