-- ══════════════════════════════════════════════════════════════════════════
-- 20260702_guaranteed_delivery_overhaul.sql
-- Upgrades business_notifications to support high-reliability guarantees:
--   1. Idempotency Keys (Exactly-Once delivery semantics)
--   2. Tracing (Trace ID for end-to-end observability)
--   3. Escalation Ladder (Staff -> Manager -> Owner -> Admins tracking)
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Add new reliability & monitoring columns
ALTER TABLE business_notifications
  ADD COLUMN IF NOT EXISTS idempotency_key   TEXT,
  ADD COLUMN IF NOT EXISTS trace_id          UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS escalation_stage  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acknowledged_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by   TEXT,
  ADD COLUMN IF NOT EXISTS escalation_history JSONB NOT NULL DEFAULT '[]';

-- Unique constraint for idempotency key per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_notifications_idempotency
  ON business_notifications (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Index for searching trace ID
CREATE INDEX IF NOT EXISTS idx_business_notifications_trace_id
  ON business_notifications (trace_id);

-- Index for escalation ladder processing (find unacknowledged alerts)
CREATE INDEX IF NOT EXISTS idx_business_notifications_escalation
  ON business_notifications (escalation_stage, acknowledged_at)
  WHERE acknowledged_at IS NULL AND wa_status IN ('sent_session', 'sent_template', 'partially_sent', 'failed', 'no_template');

COMMIT;
