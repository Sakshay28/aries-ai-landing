-- Migration: Agent Configs for multi-agent routing
-- Each tenant can have multiple named agents (Sales, Support, Billing, etc.)
-- The webhook routes incoming messages to the matching agent by routing_keywords.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_configs (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_name       TEXT        NOT NULL,
  agent_description TEXT,
  routing_keywords TEXT[]      NOT NULL DEFAULT '{}',
  bot_name         TEXT,
  bot_personality  TEXT,
  system_prompt    TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_configs_tenant_idx ON agent_configs (tenant_id);

ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_configs_tenant_isolation" ON agent_configs;
CREATE POLICY "agent_configs_tenant_isolation" ON agent_configs
  USING (
    tenant_id IN (
      SELECT id FROM tenants WHERE user_id = auth.uid()
    )
  );

COMMIT;
