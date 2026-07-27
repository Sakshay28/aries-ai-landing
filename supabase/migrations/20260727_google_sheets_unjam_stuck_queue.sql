-- ═══════════════════════════════════════════════════════════════════════════
-- ONE-TIME DATA REMEDIATION: unjam the stuck Google Sheets sync queue
-- ═══════════════════════════════════════════════════════════════════════════
-- Run AFTER 20260727_google_sheets_stuck_job_recovery.sql is applied.
--
-- Every queued job for the affected tenant(s) is orphaned in status='processing'
-- (2202 rows for globesome.tag, oldest 25 days). This resets them to 'pending'
-- so the worker drains them. Syncs are idempotent (upsert-by-phone), so we only
-- need ONE pending job per phone — the partial unique index
-- uq_gsheets_queue_pending (tenant_id, phone) WHERE status='pending' also
-- requires it. So: keep the newest processing row per (tenant_id, phone),
-- delete the older duplicates, then flip the survivors to pending.
--
-- Scope: only rows already abandoned (processing for > 5 minutes), so a live
-- in-flight worker is never disturbed.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Delete duplicate stuck rows, keeping the most recent per (tenant_id, phone).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, phone
           ORDER BY created_at DESC
         ) AS rn
  FROM google_sheets_sync_queue
  WHERE status = 'processing'
    AND updated_at < NOW() - INTERVAL '5 minutes'
)
DELETE FROM google_sheets_sync_queue
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. Reset the surviving stuck rows to pending so the worker re-drains them.
UPDATE google_sheets_sync_queue
SET status        = 'pending',
    run_at        = NOW(),
    attempts      = 0,
    error_message = NULL,
    updated_at    = NOW()
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '5 minutes';

COMMIT;

-- Sanity check (run separately after commit):
--   SELECT tenant_id, status, COUNT(*)
--   FROM google_sheets_sync_queue
--   GROUP BY tenant_id, status ORDER BY 1,2;
