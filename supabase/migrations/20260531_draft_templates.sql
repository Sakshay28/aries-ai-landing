-- Migration: Draft Templates (WhatsApp Template Studio)
-- Stores local templates and drafts before and after submission to Meta.

BEGIN;

CREATE TABLE IF NOT EXISTS draft_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_name     TEXT NOT NULL,
  normalized_name   TEXT NOT NULL,
  category          TEXT NOT NULL,          -- MARKETING | UTILITY | AUTHENTICATION
  subtype           TEXT NOT NULL DEFAULT 'Default', -- Default | Catalogue | Flows | etc.
  language          TEXT NOT NULL DEFAULT 'en',
  header_type       TEXT NOT NULL DEFAULT 'NONE',    -- NONE | TEXT | IMAGE | VIDEO | DOCUMENT
  header_text       TEXT,
  header_media_url  TEXT,
  body              TEXT NOT NULL,
  footer            TEXT,
  buttons_json      JSONB DEFAULT '[]',
  variables_json    JSONB DEFAULT '{}',     -- { "1": "customer_name", "2": "booking_date" }
  media_url         TEXT,
  media_type        TEXT,
  meta_template_id  TEXT,
  status            TEXT NOT NULL DEFAULT 'DRAFT',   -- DRAFT | PENDING | APPROVED | REJECTED | PAUSED
  rejection_reason  TEXT,
  delivery_mode     TEXT,                   -- zero_tap | one_tap | copy_code (auth only)
  validity_period   INT,                    -- seconds (auth only)
  usage_count       INT DEFAULT 0,
  submitted_at      TIMESTAMPTZ,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Indexes for lightning fast lookups
CREATE INDEX IF NOT EXISTS idx_draft_templates_tenant_status ON draft_templates (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_draft_templates_tenant_name ON draft_templates (tenant_id, normalized_name);

-- Ensure a tenant can never have duplicate template names (Meta constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_templates_tenant_uniq_name ON draft_templates (tenant_id, normalized_name);

-- Enable RLS
ALTER TABLE draft_templates ENABLE ROW LEVEL SECURITY;

-- Policy
DROP POLICY IF EXISTS "users_own_draft_templates" ON draft_templates;
CREATE POLICY "users_own_draft_templates" ON draft_templates
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

COMMIT;
