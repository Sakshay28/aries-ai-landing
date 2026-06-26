-- ════════════════════════════════════════════════════════════
-- Automation queue: idempotency key + stuck-item recovery
-- ════════════════════════════════════════════════════════════
-- Prevents duplicate sends when the same automation fires twice
-- for the same lead at the same scheduled time (webhook retries,
-- double-triggers, cron overlap).
-- ════════════════════════════════════════════════════════════

-- 1. Add idempotency_key column
ALTER TABLE automation_queue
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT DEFAULT NULL;

-- 2. Unique index — blocks duplicate queue inserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_queue_idempotency
  ON automation_queue (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Index for the claim query (pending items ordered by scheduled_at)
CREATE INDEX IF NOT EXISTS idx_automation_queue_pending_due
  ON automation_queue (status, scheduled_at)
  WHERE status = 'pending';

-- 4. Index for stuck-item recovery (processing items)
CREATE INDEX IF NOT EXISTS idx_automation_queue_processing
  ON automation_queue (status, scheduled_at)
  WHERE status = 'processing';
