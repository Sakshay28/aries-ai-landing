-- Migration: Smart Rules
-- Stores per-tenant AI behavior rules (if/then automations).
-- Active rules are injected into the AI system prompt so
-- the bot follows them on every conversation.

BEGIN;

CREATE TABLE IF NOT EXISTS smart_rules (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              TEXT         NOT NULL,
  trigger_source    TEXT         NOT NULL,   -- "When someone asks about pricing but leaves"
  ai_summary        TEXT         NOT NULL,   -- "Wait 2 hours, then send a gentle reminder…"
  status            TEXT         NOT NULL DEFAULT 'active'
                                 CHECK (status IN ('active', 'paused', 'learning')),
  customers_reached INT          NOT NULL DEFAULT 0,
  actions_taken     INT          NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smart_rules_tenant
  ON smart_rules(tenant_id);

CREATE INDEX IF NOT EXISTS idx_smart_rules_tenant_active
  ON smart_rules(tenant_id, status)
  WHERE status = 'active';

ALTER TABLE smart_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_smart_rules" ON smart_rules;
CREATE POLICY "users_own_smart_rules" ON smart_rules
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

COMMIT;
