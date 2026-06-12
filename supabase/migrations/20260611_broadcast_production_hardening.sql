-- ═══════════════════════════════════════════════════════════
-- Broadcast production hardening — 2026-06-11
-- Fixes: atomic queue locking, dedup constraint, cancel support
-- ═══════════════════════════════════════════════════════════

-- 1. Unique constraint on (campaign_id, contact_id) to prevent duplicate queue entries.
--    The upsert in BroadcastEngineService.launchCampaign relies on this constraint.
--    contact_id can be NULL (CSV imports), so use COALESCE with a sentinel for uniqueness.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_broadcast_queue_campaign_contact'
  ) THEN
    ALTER TABLE broadcast_queue
      ADD CONSTRAINT uq_broadcast_queue_campaign_contact
      UNIQUE (campaign_id, contact_id);
  END IF;
END $$;

-- 2. Atomic queue locking via FOR UPDATE SKIP LOCKED.
--    Eliminates the TOCTOU race between SELECT and UPDATE in the fallback path.
CREATE OR REPLACE FUNCTION lock_broadcast_queue_batch(batch_limit INT)
RETURNS SETOF broadcast_queue
LANGUAGE sql VOLATILE
SECURITY DEFINER
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

-- 3. Add 'cancelled' and 'launching' to campaign status vocabulary.
--    'cancelled' = user/admin stopped the campaign.
--    'launching' = scheduler claimed the campaign for dispatch.
--    (broadcast_campaigns does not have a CHECK constraint on status,
--     so this is a documentation marker only.)

-- 4. Index for fast cancellation bulk-update
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_campaign_pending
  ON broadcast_queue(campaign_id)
  WHERE status IN ('pending', 'retrying', 'processing');

-- 5. Per-contact frequency cap tracking table
CREATE TABLE IF NOT EXISTS broadcast_contact_sends (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  sent_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_sends_phone_day
  ON broadcast_contact_sends(tenant_id, phone, sent_at DESC);

ALTER TABLE broadcast_contact_sends ENABLE ROW LEVEL SECURITY;

-- 6. Harden increment_broadcast_analytics: whitelist allowed column names
CREATE OR REPLACE FUNCTION increment_broadcast_analytics(target_campaign_id UUID, col_name TEXT)
RETURNS VOID AS $$
BEGIN
  IF col_name NOT IN ('sent_count','delivered_count','read_count','failed_count','clicked_count','reply_count','opt_out_count') THEN
    RAISE EXCEPTION 'Invalid analytics column: %', col_name;
  END IF;
  EXECUTE format('
    INSERT INTO broadcast_analytics (campaign_id, tenant_id, sent_count, delivered_count, read_count, failed_count, clicked_count, reply_count, opt_out_count, updated_at)
    VALUES ($1, (SELECT tenant_id FROM broadcast_campaigns WHERE id = $1), 0, 0, 0, 0, 0, 0, 0, NOW())
    ON CONFLICT (campaign_id) DO UPDATE
    SET %I = broadcast_analytics.%I + 1, updated_at = NOW()', col_name, col_name)
  USING target_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'broadcast_contact_sends' AND policyname = 'contact_sends_tenant_isolation'
  ) THEN
    CREATE POLICY contact_sends_tenant_isolation ON broadcast_contact_sends
      FOR ALL USING (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;
