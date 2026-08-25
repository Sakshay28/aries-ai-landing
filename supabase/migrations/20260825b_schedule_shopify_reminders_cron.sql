-- ═════════════════════════════════════════════════════════════════════════════
-- Schedule the Shopify order-confirmation "Change Details" reminder cron.
--
-- The reminder endpoint (src/app/api/cron/shopify-order-confirmation-
-- reminders/route.ts) fires every N minutes and nudges customers who tapped
-- "Change Details" but haven't sent their corrected info within the
-- REMINDER_DELAY_MS window (currently 30 min). This must run on Supabase
-- pg_cron because Vercel Hobby rejects any cron more frequent than daily
-- (deploy-time hard error learned earlier this session), so vercel.json
-- deliberately does NOT include it.
--
-- Idempotent: unschedule any prior copy of the job by name before adding.
-- Safe to re-run.
--
-- ⚠️  REQUIRED MANUAL STEPS BEFORE RUNNING THIS MIGRATION IN PROD:
--     1. Replace <YOUR_CRON_SECRET> below with the CRON_SECRET value from
--        Vercel Environment Variables (Settings → Environment Variables →
--        CRON_SECRET). Do NOT commit the real secret into git — swap it in
--        the SQL editor buffer only.
--     2. Verify the pg_cron and pg_net extensions are enabled in the project
--        (Database → Extensions in the Supabase dashboard).
--
-- Verify after running:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'shopify-order-confirmation-reminders';
--   SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'shopify-order-confirmation-reminders') ORDER BY start_time DESC LIMIT 5;
--
-- To disable later without reverting the code:
--   SELECT cron.unschedule('shopify-order-confirmation-reminders');
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'shopify-order-confirmation-reminders') THEN
    PERFORM cron.unschedule('shopify-order-confirmation-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'shopify-order-confirmation-reminders',
  '*/15 * * * *',  -- every 15 minutes
  $CRON$
  SELECT net.http_post(
    url     := 'https://ariesai.in/api/cron/shopify-order-confirmation-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <YOUR_CRON_SECRET>'
    ),
    timeout_milliseconds := 55000
  );
  $CRON$
);
