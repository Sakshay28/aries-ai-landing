-- Migration: Knowledge Base
-- Stores per-tenant knowledge documents.
-- Text content is injected into the Gemini system prompt as context.

BEGIN;

CREATE TABLE IF NOT EXISTS knowledge_docs (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename     TEXT         NOT NULL,
  content_text TEXT         NOT NULL DEFAULT '',
  file_url     TEXT,
  file_type    TEXT         NOT NULL DEFAULT 'txt',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tenant
  ON knowledge_docs(tenant_id);

ALTER TABLE knowledge_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_knowledge_docs" ON knowledge_docs;
CREATE POLICY "users_own_knowledge_docs" ON knowledge_docs
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

COMMIT;
