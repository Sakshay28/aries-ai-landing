-- ════════════════════════════════════════════════════════════
-- Migration: Automations v2 — production hardening
-- Date: 2026-06-22
--
-- Fixes the real root cause: delayed automations only fired when
-- the next webhook arrived (piggyback) or at the single daily 8am
-- Vercel cron. This adds:
--   1. 'processing' status for claim-before-send locking
--   2. atomic counter increment RPC
--   3. pg_cron job that drains the queue EVERY MINUTE (Vercel Hobby
--      cannot do sub-daily crons, so we schedule from Postgres —
--      the same pattern used by the restaurant review cron)
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Widen status constraint to include 'processing' ──
ALTER TABLE automation_queue DROP CONSTRAINT IF EXISTS automation_queue_status_check;
ALTER TABLE automation_queue ADD CONSTRAINT automation_queue_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'cancelled', 'failed'));

-- ── 2. Atomic counter increment (no read-then-write race) ──
CREATE OR REPLACE FUNCTION increment_automation_counter(
  p_id      UUID,
  p_reached INT,
  p_sent    INT
) RETURNS VOID AS $$
  UPDATE automations
     SET customers_reached = customers_reached + COALESCE(p_reached, 0),
         messages_sent     = messages_sent     + COALESCE(p_sent, 0),
         updated_at        = NOW()
   WHERE id = p_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- ── 3. Safety net: re-queue items stuck in 'processing' > 5 min ──
-- (covers a serverless function that died mid-send after claiming)
CREATE OR REPLACE FUNCTION requeue_stale_automations() RETURNS VOID AS $$
  UPDATE automation_queue
     SET status = 'pending'
   WHERE status = 'processing'
     AND created_at < NOW() - INTERVAL '5 minutes';
$$ LANGUAGE sql SECURITY DEFINER;

COMMIT;

-- ════════════════════════════════════════════════════════════
-- 4. pg_cron: drain the automation queue every minute
-- ────────────────────────────────────────────────────────────
-- Requires pg_cron + pg_net (already enabled in this project for the
-- restaurant review cron). Run this block SEPARATELY in the Supabase
-- SQL editor AFTER setting the two settings below, because cron.schedule
-- cannot run inside the transaction above.
--
-- Replace <YOUR_VERCEL_URL> and <YOUR_CRON_SECRET> before running.
-- ════════════════════════════════════════════════════════════

-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- -- Unschedule any prior version first (id lookup by name)
-- SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'drain-automations';
--
-- SELECT cron.schedule(
--   'drain-automations',
--   '* * * * *',                       -- every minute
--   $$
--   SELECT net.http_post(
--     url     := 'https://<YOUR_VERCEL_URL>/api/cron/automations',
--     headers := jsonb_build_object(
--       'Content-Type',  'application/json',
--       'Authorization', 'Bearer <YOUR_CRON_SECRET>'
--     )
--   );
--   $$
-- );
--
-- -- Re-queue stuck items every 5 minutes
-- SELECT cron.schedule(
--   'requeue-stale-automations',
--   '*/5 * * * *',
--   $$ SELECT requeue_stale_automations(); $$
-- );
