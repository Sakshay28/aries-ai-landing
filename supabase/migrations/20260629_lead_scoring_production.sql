-- ═══════════════════════════════════════════════════════════
-- Lead Scoring Production Hardening
--
-- Adds:
--  • lead_signal_events  — immutable audit log of every score change
--  • lead_status_history — audit trail of status transitions
--  • Manual override columns on leads (manual_status, auto_status)
--  • last_activity_at on leads for decay
--
-- Run in Supabase SQL Editor (idempotent).
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── 1. lead_signal_events ────────────────────────────────────────────────────
-- One row per scoring event per lead. Never updated.
-- Powers: score timeline UI, analytics, future recency weighting.

CREATE TABLE IF NOT EXISTS lead_signal_events (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id         UUID         NOT NULL REFERENCES leads(id)   ON DELETE CASCADE,
  signal          TEXT         NOT NULL,
  label           TEXT         NOT NULL,
  points          INT          NOT NULL,
  score_before    INT          NOT NULL,
  score_after     INT          NOT NULL,
  category        TEXT         NOT NULL,
  source          TEXT         NOT NULL DEFAULT 'whatsapp',
  conversation_id UUID,
  message_id      TEXT,
  metadata        JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_signal_events_lead    ON lead_signal_events(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_signal_events_tenant  ON lead_signal_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_signal_events_signal  ON lead_signal_events(tenant_id, signal);

ALTER TABLE lead_signal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_own_signal_events" ON lead_signal_events;
CREATE POLICY "tenant_own_signal_events" ON lead_signal_events
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- ── 2. lead_status_history ───────────────────────────────────────────────────
-- Every status transition is recorded here with who triggered it and why.

CREATE TABLE IF NOT EXISTS lead_status_history (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id     UUID         NOT NULL REFERENCES leads(id)   ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT         NOT NULL,
  trigger     TEXT         NOT NULL,   -- 'scoring' | 'manual' | 'decay' | 'booking' | 'payment'
  actor_id    UUID,
  reason      TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead   ON lead_status_history(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_status_history_tenant ON lead_status_history(tenant_id, created_at DESC);

ALTER TABLE lead_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_own_status_history" ON lead_status_history;
CREATE POLICY "tenant_own_status_history" ON lead_status_history
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- ── 3. Leads table additions ─────────────────────────────────────────────────

-- auto_status: the engine's recommendation (always written by the scoring engine)
-- manual_status: set by the sales team; when set, lead_status = manual_status
-- manual_status_at, manual_status_by: audit trail
-- last_activity_at: updated on every inbound message for decay tracking

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS auto_status        TEXT,
  ADD COLUMN IF NOT EXISTS manual_status      TEXT,
  ADD COLUMN IF NOT EXISTS manual_status_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_status_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_activity_at   TIMESTAMPTZ DEFAULT NOW();

-- Back-fill auto_status from existing lead_status
UPDATE leads SET auto_status = lead_status WHERE auto_status IS NULL;

-- Back-fill last_activity_at from last_message_at
UPDATE leads SET last_activity_at = last_message_at WHERE last_activity_at IS NULL AND last_message_at IS NOT NULL;
UPDATE leads SET last_activity_at = created_at WHERE last_activity_at IS NULL;

-- Index for decay cron (finds inactive non-converted leads efficiently)
CREATE INDEX IF NOT EXISTS idx_leads_decay ON leads(last_activity_at, lead_status)
  WHERE lead_status NOT IN ('converted') AND manual_status IS NULL;

-- ── 4. Add lead-decay cron to vercel.json note ───────────────────────────────
-- NOTE: After running this migration, add to vercel.json crons:
-- { "path": "/api/cron/lead-decay", "schedule": "0 1 * * *" }

COMMIT;
