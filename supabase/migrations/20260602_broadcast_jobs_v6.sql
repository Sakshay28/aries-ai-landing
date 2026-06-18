-- 📣 WhatsApp Broadcast Jobs & Recipient Views and Column Additions (Phase 6)
-- Enforce matching expected DB queries from verification steps.

-- 1. Add columns to broadcast_campaigns if not present
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS launched_at TIMESTAMPTZ;
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS total_recipients INTEGER DEFAULT 0;

-- 2. broadcast_jobs view — INTENTIONALLY OMITTED.
--    The later 20260603_broadcast_fix.sql defines broadcast_jobs as a SUPERSET
--    (adds language_code + payload). Re-running the old narrower CREATE OR REPLACE
--    here errors with "42P16: cannot drop columns from view". 20260603 owns this view.

-- 3. Create broadcast_recipients view to map to broadcast_queue
CREATE OR REPLACE VIEW broadcast_recipients AS
SELECT
  id,
  tenant_id,
  campaign_id,
  contact_id,
  phone,
  status,
  created_at
FROM broadcast_queue;
