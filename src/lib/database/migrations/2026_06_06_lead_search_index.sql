-- ═══════════════════════════════════════════════════════════
-- Fast CRM search — pg_trgm trigram indexes for ILIKE queries
-- Without this, ILIKE '%term%' on name/phone/email is a sequential
-- scan that slows to a crawl past ~10k leads per tenant.
-- ═══════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN indexes power fast substring (ILIKE %x%) lookups
CREATE INDEX IF NOT EXISTS idx_leads_name_trgm
  ON leads USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm
  ON leads USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_email_trgm
  ON leads USING gin (email gin_trgm_ops);
