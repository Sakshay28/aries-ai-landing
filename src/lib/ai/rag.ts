// ═══════════════════════════════════════════════════════════
// RAG (Retrieval-Augmented Generation) Pipeline
// ═══════════════════════════════════════════════════════════
// Uses Vertex text-embedding-005 (768 dims) + pgvector for
// semantic similarity search over tenant knowledge_docs.
//
// Usage:
//   const docs = await retrieveRelevantDocs(tenantId, query, 3);
//   // inject docs into system prompt instead of bulk loading all docs
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAI } from '@/lib/ai/client';

const EMBED_MODEL = 'text-embedding-005';

// ── Generate a 768-dim embedding vector for a text string ──
export async function embedText(text: string): Promise<number[]> {
  const result = await getAI().models.embedContent({
    model:    EMBED_MODEL,
    contents: text,
    config:   { taskType: 'RETRIEVAL_QUERY', outputDimensionality: 768 },
  });
  const values = result.embeddings?.[0]?.values;
  if (!values || values.length === 0) throw new Error('Embedding returned empty values');
  return values;
}

// ── Embed a document chunk (different task type = better recall) ──
export async function embedDocument(text: string): Promise<number[]> {
  const result = await getAI().models.embedContent({
    model:    EMBED_MODEL,
    contents: text,
    config:   { taskType: 'RETRIEVAL_DOCUMENT', outputDimensionality: 768 },
  });
  const values = result.embeddings?.[0]?.values;
  if (!values || values.length === 0) throw new Error('Embedding returned empty values');
  return values;
}

// ── Retrieve top-K most relevant docs for a query ─────────
export interface RetrievedDoc {
  id:           string;
  filename:     string;
  content_text: string;
  similarity:   number;
}

export async function retrieveRelevantDocs(
  tenantId:   string,
  query:      string,
  topK        = 3,
  minSimilarity = 0.3,
): Promise<RetrievedDoc[]> {
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(query);
  } catch (e) {
    console.error('RAG: embedText failed, falling back to no docs:', (e as Error).message);
    return [];
  }

  const { data, error } = await supabaseAdmin.rpc('match_knowledge_docs', {
    query_embedding:  `[${queryEmbedding.join(',')}]`,
    match_tenant_id:  tenantId,
    match_count:      topK,
    min_similarity:   minSimilarity,
  });

  if (error) {
    console.error('RAG: match_knowledge_docs RPC failed:', error.message);
    return [];
  }

  return (data as RetrievedDoc[]) ?? [];
}

// ── Store embedding for a knowledge doc after upload ──────
export async function storeDocEmbedding(docId: string, text: string): Promise<void> {
  let embedding: number[];
  try {
    embedding = await embedDocument(text.slice(0, 8000)); // Gemini limit
  } catch (e) {
    console.error('RAG: embedDocument failed for doc', docId, ':', (e as Error).message);
    return;
  }

  const { error } = await supabaseAdmin
    .from('knowledge_docs')
    .update({ embedding: `[${embedding.join(',')}]` })
    .eq('id', docId);

  if (error) console.error('RAG: failed to store embedding for doc', docId, ':', error.message);
}
