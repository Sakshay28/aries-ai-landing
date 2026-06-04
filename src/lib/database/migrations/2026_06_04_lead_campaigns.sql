-- ═══════════════════════════════════════════════════════════
-- Lead Tracking Campaigns (source / batch differentiation)
-- e.g. "4 June Tracking", "11 June Tracking", per-ad batches.
-- Run in Supabase SQL Editor (idempotent).
-- ═══════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS lead_campaigns (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,                 -- "4 June Tracking"
  ref_code    TEXT         NOT NULL,                 -- short slug embedded in the WA link, e.g. "4june"
  channel     TEXT         DEFAULT 'whatsapp',       -- where the link is shared
  color       TEXT         DEFAULT '#7c3aed',
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, ref_code)
);

CREATE INDEX IF NOT EXISTS idx_lead_campaigns_tenant ON lead_campaigns(tenant_id);

ALTER TABLE lead_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_campaigns" ON lead_campaigns;
CREATE POLICY "users_own_campaigns" ON lead_campaigns
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Link leads to a tracking campaign.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES lead_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(tenant_id, campaign_id);

COMMIT;
