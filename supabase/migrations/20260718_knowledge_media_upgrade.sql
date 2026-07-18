-- Migration: Knowledge Media Upgrade
-- Extends knowledge_docs with AI-analysis metadata, dedupe hash, processing
-- status, and Meta media-ID caching so the AI Assistant can semantically
-- understand and re-send uploaded images/videos/PDFs on WhatsApp instead of
-- relying on exact filename matching.

BEGIN;

-- ── knowledge_docs: media understanding + lifecycle columns ──────────────
ALTER TABLE knowledge_docs
  ADD COLUMN IF NOT EXISTS category               TEXT,
  ADD COLUMN IF NOT EXISTS tags                    TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS title                   TEXT,
  ADD COLUMN IF NOT EXISTS description             TEXT,
  ADD COLUMN IF NOT EXISTS ai_description           TEXT,
  ADD COLUMN IF NOT EXISTS manually_edited          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS processing_status        TEXT NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS processing_error         TEXT,
  ADD COLUMN IF NOT EXISTS updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS file_hash                TEXT,
  ADD COLUMN IF NOT EXISTS usage_count              INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta_media_id            TEXT,
  ADD COLUMN IF NOT EXISTS meta_media_id_uploaded_at TIMESTAMPTZ;

-- Default existing/new non-media rows (text/pdf) to 'ready' so nothing already
-- indexed appears stuck; the upload route explicitly sets 'pending' for the
-- media types that actually go through the new analysis pipeline.
ALTER TABLE knowledge_docs
  DROP CONSTRAINT IF EXISTS knowledge_docs_processing_status_check;
ALTER TABLE knowledge_docs
  ADD CONSTRAINT knowledge_docs_processing_status_check
  CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed'));

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tenant_hash
  ON knowledge_docs(tenant_id, file_hash)
  WHERE file_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_docs_processing_status
  ON knowledge_docs(processing_status)
  WHERE processing_status IN ('pending', 'processing');

-- ── knowledge_media_usage: append-only send log for analytics ────────────
CREATE TABLE IF NOT EXISTS knowledge_media_usage (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_id          UUID        NOT NULL REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  conversation_id UUID,
  matched_query   TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_media_usage_tenant
  ON knowledge_media_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_media_usage_doc
  ON knowledge_media_usage(doc_id);

ALTER TABLE knowledge_media_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_core" ON knowledge_media_usage;
CREATE POLICY "tenant_isolation_core" ON knowledge_media_usage
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- ── match_knowledge_docs: return media metadata so one retrieval call ────
-- gives the AI everything needed to decide what to send (additive change,
-- backward compatible with existing text-RAG callers that only read
-- id/filename/content_text/similarity).
-- Postgres cannot CREATE OR REPLACE a function that changes its RETURNS TABLE
-- shape — the old 4-column signature must be dropped first.
DROP FUNCTION IF EXISTS match_knowledge_docs(vector(768), UUID, INT, FLOAT);

CREATE OR REPLACE FUNCTION match_knowledge_docs(
  query_embedding vector(768),
  match_tenant_id UUID,
  match_count     INT DEFAULT 3,
  min_similarity  FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id             UUID,
  filename       TEXT,
  content_text   TEXT,
  similarity     FLOAT,
  file_type      TEXT,
  file_url       TEXT,
  title          TEXT,
  description    TEXT,
  ai_description TEXT,
  tags           TEXT[],
  category       TEXT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    filename,
    content_text,
    1 - (embedding <=> query_embedding) AS similarity,
    file_type,
    file_url,
    title,
    description,
    ai_description,
    tags,
    category
  FROM knowledge_docs
  WHERE
    tenant_id   = match_tenant_id
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) >= min_similarity
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ── increment_media_usage: atomic usage counter bump on each WhatsApp send ──
CREATE OR REPLACE FUNCTION increment_media_usage(p_doc_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE knowledge_docs
  SET usage_count = usage_count + 1, updated_at = NOW()
  WHERE id = p_doc_id;
$$;

COMMIT;
