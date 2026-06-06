-- Migration: Store CTWA click ID on leads for CAPI attribution
-- Run in Supabase SQL Editor (idempotent).

BEGIN;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ctwa_clid TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_ctwa_clid ON leads(ctwa_clid) WHERE ctwa_clid IS NOT NULL;

COMMIT;
