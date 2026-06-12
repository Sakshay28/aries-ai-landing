-- Migration: Tenant Integrations
-- Stores per-tenant config for external integrations:
--   Razorpay, Shiprocket, Zoho CRM, Google Sheets, Webhooks

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_integrations (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id TEXT         NOT NULL,
  config         JSONB        NOT NULL DEFAULT '{}',
  is_active      BOOLEAN      NOT NULL DEFAULT true,
  connected_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, integration_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant
  ON tenant_integrations(tenant_id);

ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_integrations" ON tenant_integrations;
CREATE POLICY "users_own_integrations" ON tenant_integrations
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

COMMIT;
