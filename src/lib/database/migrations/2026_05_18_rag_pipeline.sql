-- Migration: RAG Pipeline — pgvector embeddings on knowledge_docs
-- Enables semantic similarity search replacing full-text bulk injection.

BEGIN;

-- Enable pgvector (Supabase has this built-in)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (Gemini text-embedding-004 outputs 768 dims)
ALTER TABLE knowledge_docs
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- IVFFlat index for fast cosine similarity search
-- lists = sqrt(N) where N is expected row count. 10 is safe for < 10k rows.
CREATE INDEX IF NOT EXISTS knowledge_docs_embedding_idx
  ON knowledge_docs USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);

-- Similarity search function (called from API)
CREATE OR REPLACE FUNCTION match_knowledge_docs(
  query_embedding vector(768),
  match_tenant_id UUID,
  match_count     INT DEFAULT 3,
  min_similarity  FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id           UUID,
  filename     TEXT,
  content_text TEXT,
  similarity   FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    filename,
    content_text,
    1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_docs
  WHERE
    tenant_id   = match_tenant_id
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) >= min_similarity
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMIT;
