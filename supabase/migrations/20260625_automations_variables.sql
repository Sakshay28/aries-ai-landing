-- ════════════════════════════════════════════════════════════
-- Automation queue: store trigger variables for delayed sends
-- ════════════════════════════════════════════════════════════
-- Delayed automations (e.g. 5-min booking confirmation IG message)
-- previously lost booking_date / reservation_id / party_size etc.
-- because the variables were never stored with the queue item.
-- This column fixes that: variables are written at queue time and
-- read back when the cron processes the item.
-- ════════════════════════════════════════════════════════════

ALTER TABLE automation_queue
  ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT NULL;

-- ════════════════════════════════════════════════════════════
-- pg_cron: drain the automation queue every minute
-- ════════════════════════════════════════════════════════════
-- This is the real fix for delayed automations. Vercel crons can only
-- run hourly on Pro (daily on Hobby). Supabase pg_cron runs every minute
-- and calls the existing /api/cron/automations endpoint.
--
-- HOW TO RUN THIS BLOCK:
--   Run the ALTER TABLE above first (in a transaction or separately).
--   Then run the SELECT block below SEPARATELY in the SQL editor
--   (pg_cron calls cannot run inside a transaction).
-- ════════════════════════════════════════════════════════════

-- Step 1: Enable extensions (already enabled in most Supabase projects)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Remove old job if it exists
SELECT cron.unschedule('process-automations-every-minute')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'process-automations-every-minute'
  );

-- Step 3: Schedule every-minute drain
SELECT cron.schedule(
  'process-automations-every-minute',
  '* * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://ariesai.in/api/cron/automations',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer e40cb0695b75ceacf7a2944d564518235bb95a5e75327410d4083460c8418cbd'
      ),
      body    := '{}'::jsonb
    );
  $$
);
