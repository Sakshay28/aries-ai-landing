-- 📣 WhatsApp Broadcast Jobs & Recipient Views and Column Additions (Phase 6)
-- Enforce matching expected DB queries from verification steps.

-- 1. Add columns to broadcast_campaigns if not present
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS launched_at TIMESTAMPTZ;
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS total_recipients INTEGER DEFAULT 0;

-- 2. Create broadcast_jobs view to map to broadcast_queue
CREATE OR REPLACE VIEW broadcast_jobs AS
SELECT
  id,
  tenant_id,
  campaign_id,
  contact_id,
  phone,
  status,
  attempt_count,
  next_attempt_at,
  locked_at,
  processed_at,
  failure_reason,
  created_at
FROM broadcast_queue;

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
