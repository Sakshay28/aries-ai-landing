-- ═══════════════════════════════════════════════════════════════════════════
-- Google Sheets sync queue: stuck-job recovery (visibility timeout)
-- ═══════════════════════════════════════════════════════════════════════════
-- INCIDENT (2026-07-27): every job in google_sheets_sync_queue for a tenant was
-- stuck in status='processing' (2202 rows, oldest 25 days old). The webhook
-- drain runs fire-and-forget inside after(); Vercel freezes the instance once
-- after() returns, so a claimed job's Google API fetch hangs and the row is
-- never completed. The old claim function ONLY looked at status='pending', so
-- orphaned 'processing' rows were never reclaimed — the tenant's sync stopped
-- dead with no self-recovery.
--
-- FIX: give 'processing' a lease. A row that has been 'processing' longer than
-- the visibility timeout is treated as abandoned and re-claimed (attempts++ so
-- a job that keeps freezing eventually exhausts retries instead of looping
-- forever). Syncs are idempotent (upsert-by-phone), so re-claiming a row that a
-- slow worker is somehow still holding is harmless.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION claim_google_sheets_sync_jobs(p_worker_id TEXT, p_limit INT)
RETURNS TABLE(
  id             UUID,
  tenant_id      UUID,
  lead_id        UUID,
  phone          TEXT,
  event_type     TEXT,
  payload        JSONB,
  attempts       INTEGER
) AS $$
DECLARE
  v_ids UUID[];
  -- How long a row may sit in 'processing' before it is considered abandoned.
  v_lease INTERVAL := INTERVAL '5 minutes';
BEGIN
  -- Atomically select claimable jobs:
  --   (a) pending jobs whose run_at is due, OR
  --   (b) processing jobs whose lease has expired (worker died / was frozen).
  SELECT array_agg(q.id) INTO v_ids FROM (
    SELECT q.id FROM google_sheets_sync_queue q
    WHERE (q.status = 'pending'    AND q.run_at <= NOW())
       OR (q.status = 'processing' AND q.updated_at < NOW() - v_lease)
    ORDER BY q.run_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) q;

  IF v_ids IS NULL THEN
    RETURN;
  END IF;

  -- Claim them. Bump attempts on rows that were RE-claimed from a stale
  -- 'processing' state so a perpetually-freezing job still exhausts its retry
  -- budget (the worker's catch-block promotes it to 'failed' at maxAttempts).
  RETURN QUERY
  UPDATE google_sheets_sync_queue q
  SET
    status     = 'processing',
    updated_at = NOW(),
    attempts   = CASE WHEN q.status = 'processing' THEN q.attempts + 1 ELSE q.attempts END,
    payload    = jsonb_set(q.payload, '{worker_id}', to_jsonb(p_worker_id))
  WHERE q.id = ANY(v_ids)
  RETURNING q.id, q.tenant_id, q.lead_id, q.phone, q.event_type, q.payload, q.attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
