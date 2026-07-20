-- Media Rules — owner-defined topic → Knowledge Media file associations.
-- Distinct from Scripted Replies (keyword-triggered, deterministic): these
-- rules are judged by the AI itself ("does this topic genuinely apply to
-- what the customer is asking?"), then strongly prefer the associated
-- file(s) over relying solely on embedding-similarity retrieval.

ALTER TABLE tenants
  -- Array of { "topic": string, "docIds": string[] }.
  -- docIds reference knowledge_docs.id — resolved to filenames/descriptions
  -- at prompt-build time so renames/edits stay in sync automatically.
  ADD COLUMN IF NOT EXISTS media_rules JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN tenants.media_rules IS 'Array of {topic, docIds}: when a topic genuinely applies (AI judgment, not keyword match), strongly prefer sending these knowledge_docs files';
