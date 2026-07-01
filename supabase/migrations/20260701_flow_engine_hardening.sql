-- ═══════════════════════════════════════════════════════════
-- 🤖 Migration: Flow Engine Hardening
-- Durable execution state + structured execution/trace logging,
-- fixing the P0 bug where multi-button flows silently fell through
-- to the AI engine after the first reply.
-- Run this in Supabase SQL Editor. Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── conversation_traces ──────────────────────────────────────
-- Per-node execution trace. The insert code already existed in
-- src/lib/observability/trace.ts (logTrace) but was dead — no table ever
-- backed it and it was never called. This migration + the engine wiring
-- that accompanies it makes it real.
CREATE TABLE IF NOT EXISTS conversation_traces (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID,
  message_id      TEXT,
  flow_id         UUID,
  node_id         TEXT,
  node_type       TEXT,
  action          TEXT NOT NULL,
  payload         TEXT,
  latency_ms      INTEGER,
  meta            JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_traces_conv ON conversation_traces(tenant_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_traces_flow ON conversation_traces(tenant_id, flow_id, created_at DESC);

ALTER TABLE conversation_traces ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conversation_traces' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY tenant_isolation ON conversation_traces
        USING  (tenant_id = public.get_current_tenant_id())
        WITH CHECK (tenant_id = public.get_current_tenant_id())
    $policy$;
  END IF;
END $$;

-- ── flow_execution_logs ──────────────────────────────────────
-- One row per top-level flow run (logFlowExecution — same dead-code story
-- as conversation_traces above; schema unchanged from trace.ts, RLS added).
CREATE TABLE IF NOT EXISTS flow_execution_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  flow_id         UUID,
  conversation_id UUID,
  node_path       TEXT[],
  total_nodes     INTEGER,
  duration_ms     INTEGER,
  outcome         TEXT,        -- 'completed' | 'handoff' | 'error' | 'wait'
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_execution_logs_flow ON flow_execution_logs(tenant_id, flow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_execution_logs_conv ON flow_execution_logs(tenant_id, conversation_id, created_at DESC);

ALTER TABLE flow_execution_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'flow_execution_logs' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY tenant_isolation ON flow_execution_logs
        USING  (tenant_id = public.get_current_tenant_id())
        WITH CHECK (tenant_id = public.get_current_tenant_id())
    $policy$;
  END IF;
END $$;

-- ── flow_engine_executions ───────────────────────────────────
-- Durable, queryable mirror of each conversation's current position in a
-- flow. conversations.context.pending_flow_node remains the engine's
-- authoritative read/write path for resume logic (now correct — see the
-- send_buttons/send_list/wait_for_reply + resume-block fixes in engine.ts);
-- this table is upserted alongside it purely for observability/debugging,
-- so "what flow/node is this conversation stuck at" is a plain SQL query
-- instead of reaching into a JSONB blob. Not named flow_executions: that
-- name is already referenced (but unimplemented) by an unrelated broadcast
-- automation "trigger_flow" action in automation-engine.service.ts, with a
-- different, incompatible shape (contact_id instead of conversation_id).
CREATE TABLE IF NOT EXISTS flow_engine_executions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  flow_id           UUID NOT NULL REFERENCES automation_flows(id) ON DELETE CASCADE,
  flow_snapshot_at  TIMESTAMPTZ, -- automation_flows.updated_at at execution start; a lightweight version marker, not full immutable versioning
  current_node_id   TEXT,
  status            TEXT NOT NULL DEFAULT 'running', -- 'running' | 'paused' | 'completed' | 'abandoned'
  pending_reason    TEXT,       -- e.g. 'buttons' | 'list' | 'question' | 'wait_for_reply'
  variables         JSONB NOT NULL DEFAULT '{}',
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_engine_executions_conv          ON flow_engine_executions(conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_flow_engine_executions_tenant_status ON flow_engine_executions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_flow_engine_executions_flow          ON flow_engine_executions(tenant_id, flow_id, started_at DESC);

ALTER TABLE flow_engine_executions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'flow_engine_executions' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY tenant_isolation ON flow_engine_executions
        USING  (tenant_id = public.get_current_tenant_id())
        WITH CHECK (tenant_id = public.get_current_tenant_id())
    $policy$;
  END IF;
END $$;

COMMIT;
