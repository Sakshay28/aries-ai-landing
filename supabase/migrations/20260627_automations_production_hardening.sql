-- ════════════════════════════════════════════════════════════
-- Migration: Automations — production hardening (audit 2026-06-27)
-- ════════════════════════════════════════════════════════════
-- Addresses the full automation-system audit. Every column is added
-- nullable or with a default that PRESERVES current behaviour, so this
-- migration is 100% backward compatible — existing automations keep
-- working unchanged.
--
--   C2/C4  claimed_at        — distinguish "stuck" from "just claimed"
--   H7/M10 deleted_at        — soft delete (history survives)
--   M5     created_by/updated_by — audit: who made the automation
--   L6     conditions JSONB  — conditional send gating (AND/OR)
--   L7     message_text_b / ab_split_percent / variant — A/B testing
--   L9     max_per_lead_per_day — frequency cap per lead
--   L10    fallback_template_name — HSM fallback when 24h window closed
--   M8     'weeks' delay unit
--   M4     system_heartbeats — real "last drain" health signal
--   C2     requeue_stale_automations() now keys off claimed_at
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── automations: soft delete, audit, conditions, A/B, freq cap, fallback ──
ALTER TABLE automations
  ADD COLUMN IF NOT EXISTS deleted_at            TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS created_by            UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_by            UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conditions            JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS message_text_b        TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ab_split_percent      INT  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_per_lead_per_day  INT  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fallback_template_name TEXT DEFAULT NULL;

-- created_by / updated_by reference the team-member row; if the user is
-- removed we keep the automation but null the attribution.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'automations_created_by_fkey'
  ) THEN
    ALTER TABLE automations
      ADD CONSTRAINT automations_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'automations_updated_by_fkey'
  ) THEN
    ALTER TABLE automations
      ADD CONSTRAINT automations_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ab_split_percent must be a valid percentage
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_ab_split_check;
ALTER TABLE automations ADD CONSTRAINT automations_ab_split_check
  CHECK (ab_split_percent >= 0 AND ab_split_percent <= 100);

-- max_per_lead_per_day, when set, must be positive (NULL = unlimited)
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_freq_cap_check;
ALTER TABLE automations ADD CONSTRAINT automations_freq_cap_check
  CHECK (max_per_lead_per_day IS NULL OR max_per_lead_per_day > 0);

-- ── Widen delay_unit to include 'weeks' (M8) ──
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_delay_unit_check;
ALTER TABLE automations ADD CONSTRAINT automations_delay_unit_check
  CHECK (delay_unit IN ('minutes', 'hours', 'days', 'weeks'));

-- Partial index so the active-rules lookup skips soft-deleted rows cheaply
CREATE INDEX IF NOT EXISTS idx_automations_tenant_trigger_live
  ON automations(tenant_id, trigger_event)
  WHERE status = 'active' AND deleted_at IS NULL;

-- ── automation_queue: claimed_at (C2/C4) + variant (L7) ──
ALTER TABLE automation_queue
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS variant    TEXT DEFAULT NULL;

-- Recovery index now keyed on claimed_at (the time the item actually entered
-- 'processing'), not scheduled_at/created_at which mis-fire.
CREATE INDEX IF NOT EXISTS idx_automation_queue_claimed
  ON automation_queue (status, claimed_at)
  WHERE status = 'processing';

-- Frequency-cap counting: sends to a given lead in a recent window
CREATE INDEX IF NOT EXISTS idx_automation_queue_lead_recent
  ON automation_queue (automation_id, lead_id, created_at);

-- ── C2: stuck-item recovery keyed on claimed_at ──
-- An item is "stuck" only if it has been in 'processing' for >5 min since it
-- was CLAIMED. created_at (birth) and scheduled_at (intended send) both lie
-- about claim time and could requeue a healthy in-flight item → double send.
CREATE OR REPLACE FUNCTION requeue_stale_automations() RETURNS VOID AS $$
  UPDATE automation_queue
     SET status = 'pending', claimed_at = NULL
   WHERE status = 'processing'
     AND COALESCE(claimed_at, created_at) < NOW() - INTERVAL '5 minutes';
$$ LANGUAGE sql SECURITY DEFINER;

-- ── M4: real drain heartbeat ──
-- The diagnostics endpoint reads this to show when the minute-cron LAST ran
-- successfully, instead of inferring "stuck" purely from queue age.
CREATE TABLE IF NOT EXISTS system_heartbeats (
  key          TEXT        PRIMARY KEY,
  last_run_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detail       JSONB
);

-- Heartbeat is global operational state (not tenant-scoped). Lock it down so
-- the anon/authenticated browser roles can't read or write it; the service
-- role (used by the cron + diagnostics endpoint) bypasses RLS.
ALTER TABLE system_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "no_client_access_heartbeats" ON system_heartbeats;
CREATE POLICY "no_client_access_heartbeats" ON system_heartbeats
  FOR ALL USING (false) WITH CHECK (false);

-- ── session_window_expiring trigger type ──
-- Allows creating automation rules that fire ~22h after the customer's last
-- message so a proactive nudge keeps the 24h WhatsApp session window alive.
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_event_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_event_check
  CHECK (trigger_event IN (
    'booking_confirmed',
    'booking_reminder',
    'new_lead',
    'escalation_triggered',
    'escalation_resolved',
    'payment_received',
    'session_window_expiring'
  ));

COMMIT;
