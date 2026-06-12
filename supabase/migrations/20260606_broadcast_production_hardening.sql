-- =============================================================
-- Broadcast System Production Hardening Migrations
-- Generated: 2026-06-06
-- Run these in your Supabase SQL editor BEFORE shipping to prod.
-- =============================================================

-- ── 1. UNIQUE constraint on broadcast_queue to prevent duplicate sends ─────────
-- This makes the upsert + ignoreDuplicates in launchCampaign() safe.
-- A double-click or network retry will silently skip re-inserting the same contact.

ALTER TABLE broadcast_queue
  ADD CONSTRAINT uq_broadcast_queue_campaign_contact
  UNIQUE (campaign_id, contact_id);

-- For CSV contacts that have no contact_id (phone-only rows), add a partial index:
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_broadcast_queue_campaign_phone_csv
  ON broadcast_queue (campaign_id, phone)
  WHERE contact_id IS NULL;

-- ── 2. UNIQUE constraint on broadcast_deliveries to prevent duplicate status rows ──
-- Enables idempotent upsert in the engine and prevents double-counting analytics.

ALTER TABLE broadcast_deliveries
  ADD CONSTRAINT uq_broadcast_deliveries_message_id
  UNIQUE (message_id);

-- ── 3. Composite index for the queue processing SELECT ──────────────────────────
-- Without this, processQueue() does a full table scan on every cron tick.
-- At 100K rows this is catastrophic — this index makes it O(batch_size).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_broadcast_queue_processable
  ON broadcast_queue (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retrying') AND locked_at IS NULL;

-- ── 4. Foreign key: broadcast_queue → broadcast_campaigns (cascade delete) ──────
-- Prevents orphan queue rows when a campaign is deleted.

ALTER TABLE broadcast_queue
  ADD CONSTRAINT fk_broadcast_queue_campaign
  FOREIGN KEY (campaign_id)
  REFERENCES broadcast_campaigns (id)
  ON DELETE CASCADE;

-- ── 5. Add reply_count column to broadcast_analytics if not present ─────────────
ALTER TABLE broadcast_analytics
  ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0;

-- ── 6. Safe queue lock via FOR UPDATE SKIP LOCKED (RPC) ─────────────────────────
-- Call this RPC from processQueue() instead of the SELECT → UPDATE two-step
-- to eliminate the race condition window between fetching and locking items.

CREATE OR REPLACE FUNCTION lock_broadcast_queue_batch(batch_limit INTEGER)
RETURNS SETOF broadcast_queue
LANGUAGE sql
AS $$
  UPDATE broadcast_queue
  SET status = 'processing',
      locked_at = NOW()
  WHERE id IN (
    SELECT id FROM broadcast_queue
    WHERE status IN ('pending', 'retrying')
      AND locked_at IS NULL
      AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
    ORDER BY created_at ASC
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- ── 7. Increment analytics RPC — add reply_count support ──────────────────────
-- If your existing increment_broadcast_analytics RPC doesn't support 'reply_count',
-- update it to include reply_count in the allowed column names.
-- Example (adjust based on your existing RPC definition):

-- CREATE OR REPLACE FUNCTION increment_broadcast_analytics(
--   target_campaign_id UUID,
--   col_name TEXT
-- ) RETURNS void AS $$
-- BEGIN
--   IF col_name NOT IN ('sent_count', 'delivered_count', 'read_count', 'failed_count', 'reply_count') THEN
--     RAISE EXCEPTION 'Invalid column name: %', col_name;
--   END IF;
--   EXECUTE format('UPDATE broadcast_analytics SET %I = %I + 1 WHERE campaign_id = $1', col_name, col_name)
--   USING target_campaign_id;
-- END;
-- $$ LANGUAGE plpgsql;
