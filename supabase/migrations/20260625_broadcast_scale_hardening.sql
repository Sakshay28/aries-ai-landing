-- ═══════════════════════════════════════════════════════════════════════════
-- Broadcast Scale Hardening — 2026-06-25
-- Makes the broadcast system safe for 100 tenants × 50k contacts.
--
-- Adds: per-tenant fair claim RPC, active-tenant discovery, Meta-tier 24h
-- recipient counting, measured throughput + stall RPCs, worker heartbeat table,
-- dead-letter-queue table, and verifies the critical indexes/constraints/RPCs
-- that earlier "pending" migrations may not have applied.
--
-- 100% idempotent. Safe to re-run. Uses plain CREATE INDEX (not CONCURRENTLY)
-- so the whole file runs as one transaction in the Supabase SQL editor.
-- NOTE: if broadcast_queue is already very large in prod, create the new
-- indexes manually with CONCURRENTLY instead (see comments) to avoid a write
-- lock during creation. At current scale a plain CREATE INDEX is instant.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. VERIFY CRITICAL EXISTING OBJECTS (earlier migrations were flagged pending)
-- ─────────────────────────────────────────────────────────────────────────────

-- 0a. The "processable" partial index — without it processQueue does full scans.
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_processable
  ON broadcast_queue (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retrying') AND locked_at IS NULL;

-- 0b-pre. CLEAN EXISTING DUPLICATES before the unique objects can be created.
--   The old plain UNIQUE(campaign_id, contact_id) constraint never deduped CSV
--   rows (contact_id IS NULL), so a re-launched CSV campaign already double-queued
--   some recipients in prod. We keep ONE row per (campaign_id, phone): prefer a
--   row that already reached Meta (sent/delivered/read) so its delivery record is
--   preserved, otherwise the earliest — then delete the rest. This only removes
--   redundant queue rows; broadcast_deliveries (keyed by message_id) is untouched.
WITH ranked_csv AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY campaign_id, phone
    ORDER BY (status IN ('sent','delivered','read')) DESC, created_at ASC
  ) AS rn
  FROM broadcast_queue
  WHERE contact_id IS NULL
)
DELETE FROM broadcast_queue WHERE id IN (SELECT id FROM ranked_csv WHERE rn > 1);

WITH ranked_crm AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY campaign_id, contact_id
    ORDER BY (status IN ('sent','delivered','read')) DESC, created_at ASC
  ) AS rn
  FROM broadcast_queue
  WHERE contact_id IS NOT NULL
)
DELETE FROM broadcast_queue WHERE id IN (SELECT id FROM ranked_crm WHERE rn > 1);

-- 0b. CSV idempotency: dedupe (campaign_id, phone) where contact_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_broadcast_queue_campaign_phone_csv
  ON broadcast_queue (campaign_id, phone)
  WHERE contact_id IS NULL;

-- 0c. CRM idempotency constraint (no-op if already present).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_broadcast_queue_campaign_contact') THEN
    ALTER TABLE broadcast_queue
      ADD CONSTRAINT uq_broadcast_queue_campaign_contact UNIQUE (campaign_id, contact_id);
  END IF;
END $$;

-- 0d. Deliveries idempotency (message_id is already UNIQUE in v4 schema; ensure index).
CREATE INDEX IF NOT EXISTS idx_broadcast_deliveries_message_id
  ON broadcast_deliveries (message_id);

-- 0e. Throughput index — supports measured-rate + stall queries below.
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_processed_at
  ON broadcast_queue (processed_at)
  WHERE status = 'sent';

-- 0f. Atomic global claim RPC (recreate to guarantee the SECURITY DEFINER version).
CREATE OR REPLACE FUNCTION lock_broadcast_queue_batch(batch_limit INT)
RETURNS SETOF broadcast_queue
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE broadcast_queue
  SET status = 'processing', locked_at = NOW()
  WHERE id IN (
    SELECT id FROM broadcast_queue
    WHERE status IN ('pending', 'retrying')
      AND locked_at IS NULL
      AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_limit
  )
  RETURNING *;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PER-TENANT FAIR CLAIM — eliminates head-of-line blocking
-- ─────────────────────────────────────────────────────────────────────────────
-- The persistent worker claims one batch PER TENANT in parallel lanes, so a
-- 50k campaign for tenant A can never starve tenant B. Same SKIP LOCKED safety.
CREATE OR REPLACE FUNCTION claim_broadcast_batch_for_tenant(p_tenant_id UUID, batch_limit INT)
RETURNS SETOF broadcast_queue
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE broadcast_queue
  SET status = 'processing', locked_at = NOW()
  WHERE id IN (
    SELECT id FROM broadcast_queue
    WHERE tenant_id = p_tenant_id
      AND status IN ('pending', 'retrying')
      AND locked_at IS NULL
      AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT batch_limit
  )
  RETURNING *;
$$;

-- Discover tenants that currently have claimable work, oldest-waiting first.
-- The worker uses this to decide which parallel lanes to run each tick.
CREATE OR REPLACE FUNCTION get_active_broadcast_tenants(max_tenants INT)
RETURNS TABLE (tenant_id UUID, pending_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id, COUNT(*) AS pending_count
  FROM broadcast_queue
  WHERE status IN ('pending', 'retrying')
    AND locked_at IS NULL
    AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
  GROUP BY tenant_id
  ORDER BY MIN(created_at) ASC
  LIMIT max_tenants;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. META MESSAGING-TIER SAFETY — 24h unique-recipient budget
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_messaging_tier TEXT DEFAULT 'TIER_1K';
-- Optional manual override of the 24h business-initiated recipient cap.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_daily_conversation_cap INTEGER;
-- Per-number outbound send rate the worker will pace to (msgs/sec). Conservative default.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wa_throughput_per_second INTEGER DEFAULT 10;

-- Distinct phones this tenant has messaged in the trailing 24h (the metric Meta
-- caps by tier). broadcast_contact_sends already records every send.
CREATE OR REPLACE FUNCTION count_tenant_unique_recipients_24h(p_tenant_id UUID)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT phone)
  FROM broadcast_contact_sends
  WHERE tenant_id = p_tenant_id
    AND sent_at >= NOW() - INTERVAL '24 hours';
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MEASURED OBSERVABILITY — real throughput + stall detection
-- ─────────────────────────────────────────────────────────────────────────────
-- Actual messages that reached Meta in the trailing window (NOT a config echo).
CREATE OR REPLACE FUNCTION broadcast_sent_last_seconds(p_seconds INT)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*) FROM broadcast_queue
  WHERE status = 'sent'
    AND processed_at >= NOW() - (p_seconds || ' seconds')::interval;
$$;

CREATE OR REPLACE FUNCTION campaign_sent_last_seconds(p_campaign_id UUID, p_seconds INT)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*) FROM broadcast_queue
  WHERE campaign_id = p_campaign_id
    AND status = 'sent'
    AND processed_at >= NOW() - (p_seconds || ' seconds')::interval;
$$;

-- Age (seconds) of the oldest claimable item. Health check alerts if this grows,
-- which is how we detect "the drain pipeline died" — the old system had no signal.
CREATE OR REPLACE FUNCTION broadcast_queue_oldest_pending_age()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))::BIGINT, 0)
  FROM broadcast_queue
  WHERE status IN ('pending', 'retrying')
    AND locked_at IS NULL
    AND (next_attempt_at IS NULL OR next_attempt_at <= NOW());
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. WORKER HEARTBEAT — durable (DB), queryable from Vercel without Redis
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id    TEXT PRIMARY KEY,
  last_beat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta         JSONB DEFAULT '{}'
);
-- Platform-internal table: enable RLS with no policy so only service_role reaches it.
ALTER TABLE worker_heartbeats ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. DEAD LETTER QUEUE — was referenced in code but never had a migration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_type        TEXT NOT NULL,
  flow_id         UUID,
  conversation_id UUID,
  campaign_id     UUID,
  payload         TEXT,
  error_message   TEXT,
  error_stack     TEXT,
  retry_count     INTEGER DEFAULT 0,
  failed_at       TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'retried', 'ignored')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dlq_tenant_status ON dead_letter_queue (tenant_id, status, failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dlq_status ON dead_letter_queue (status, failed_at DESC);

ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dead_letter_queue' AND policyname = 'dlq_tenant_isolation'
  ) THEN
    CREATE POLICY dlq_tenant_isolation ON dead_letter_queue
      FOR ALL USING (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. GRANTS — service_role runs the worker & API; authenticated never calls these
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION claim_broadcast_batch_for_tenant(UUID, INT)        TO service_role;
GRANT EXECUTE ON FUNCTION get_active_broadcast_tenants(INT)                  TO service_role;
GRANT EXECUTE ON FUNCTION count_tenant_unique_recipients_24h(UUID)           TO service_role;
GRANT EXECUTE ON FUNCTION broadcast_sent_last_seconds(INT)                   TO service_role;
GRANT EXECUTE ON FUNCTION campaign_sent_last_seconds(UUID, INT)              TO service_role;
GRANT EXECUTE ON FUNCTION broadcast_queue_oldest_pending_age()              TO service_role;
GRANT EXECUTE ON FUNCTION lock_broadcast_queue_batch(INT)                    TO service_role;
