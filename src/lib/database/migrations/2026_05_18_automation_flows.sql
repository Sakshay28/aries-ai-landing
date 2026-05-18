-- ═══════════════════════════════════════════════════════════
-- 🤖 Migration: Automation Flows
-- Run this in Supabase SQL Editor AFTER the RLS recursion fix.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── automation_flows ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_flows (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name            TEXT NOT NULL DEFAULT 'Untitled Flow',
  description     TEXT DEFAULT '',

  -- Trigger configuration
  -- trigger_type: keyword | new_lead | first_message | all_messages
  trigger_type    TEXT NOT NULL DEFAULT 'keyword',
  trigger_keywords TEXT[] DEFAULT '{}',   -- used when trigger_type = 'keyword'

  -- ReactFlow graph (serialised)
  nodes           JSONB NOT NULL DEFAULT '[]',
  edges           JSONB NOT NULL DEFAULT '[]',

  -- Lifecycle
  is_active       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_flows_tenant   ON automation_flows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_automation_flows_active   ON automation_flows(tenant_id, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE automation_flows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'automation_flows' AND policyname = 'tenant_isolation'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY tenant_isolation ON automation_flows
        USING  (tenant_id = public.get_current_tenant_id())
        WITH CHECK (tenant_id = public.get_current_tenant_id())
    $policy$;
  END IF;
END $$;

-- ── outbound_webhook_url on tenants ─────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS outbound_webhook_url TEXT DEFAULT NULL;

COMMIT;
