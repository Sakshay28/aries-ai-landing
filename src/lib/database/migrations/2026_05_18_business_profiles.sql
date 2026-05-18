-- Migration: Business Profiles
-- Structured per-tenant business configuration used to
-- auto-build the Gemini system prompt.

BEGIN;

CREATE TABLE IF NOT EXISTS business_profiles (
  tenant_id      UUID         PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  company_name   TEXT         NOT NULL DEFAULT '',
  industry       TEXT         NOT NULL DEFAULT '',
  website_url    TEXT         NOT NULL DEFAULT '',
  core_services  TEXT[]       NOT NULL DEFAULT '{}',
  tone           TEXT         NOT NULL DEFAULT 'friendly' CHECK (tone IN ('friendly', 'professional', 'casual', 'formal')),
  contact_phone  TEXT         NOT NULL DEFAULT '',
  contact_email  TEXT         NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_business_profile" ON business_profiles;
CREATE POLICY "users_own_business_profile" ON business_profiles
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

COMMIT;
