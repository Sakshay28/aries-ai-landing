-- ════════════════════════════════════════════════════════════
-- Migration: Automations v2 — production hardening
-- Date: 2026-06-22
-- Adds 'processing' status for queue locking
-- ════════════════════════════════════════════════════════════

BEGIN;

-- Widen status constraint to include 'processing' (claim-before-send locking)
ALTER TABLE automation_queue DROP CONSTRAINT IF EXISTS automation_queue_status_check;
ALTER TABLE automation_queue ADD CONSTRAINT automation_queue_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'cancelled', 'failed'));

COMMIT;
