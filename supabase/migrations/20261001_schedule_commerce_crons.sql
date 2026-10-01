-- ═════════════════════════════════════════════════════════════════════════════
-- Precise schedules for the commerce crons (pg_cron + pg_net).
--
-- Vercel's Hobby plan only runs a cron once a day, and GitHub Actions'
-- "*/10" schedule actually fires every 3-4 hours. pg_cron is the one
-- scheduler we have that runs on time:
--   shopify-sync      every 2 min  — backstop drain for Shopify webhooks
--                                    (order-confirmation latency)
--   shiprocket-sync   every 10 min — pulls Shiprocket statuses, sends
--                                    shipped / out-for-delivery / delivered /
--                                    NDR / RTO WhatsApp messages
--   daily-report      22:00 IST    — nightly owner report (tenants with
--                                    'daily_report' in modules)
--
-- Requires the pg_cron and pg_net extensions (Database → Extensions).
-- Replace <YOUR_CRON_SECRET> with the Vercel CRON_SECRET before running.
-- Idempotent: unschedule-if-exists → schedule again. Safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE j text;
BEGIN
  FOREACH j IN ARRAY ARRAY['aries-shopify-sync', 'aries-shiprocket-sync', 'aries-daily-report'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = j) THEN
      PERFORM cron.unschedule(j);
    END IF;
  END LOOP;
END $$;

SELECT cron.schedule('aries-shopify-sync', '*/2 * * * *', $CRON$
  SELECT net.http_post(
    url := 'https://ariesai.in/api/cron/shopify-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <YOUR_CRON_SECRET>'),
    timeout_milliseconds := 55000
  );
$CRON$);

SELECT cron.schedule('aries-shiprocket-sync', '*/10 * * * *', $CRON$
  SELECT net.http_post(
    url := 'https://ariesai.in/api/cron/shiprocket-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <YOUR_CRON_SECRET>'),
    timeout_milliseconds := 55000
  );
$CRON$);

-- 16:30 UTC = 22:00 IST
SELECT cron.schedule('aries-daily-report', '30 16 * * *', $CRON$
  SELECT net.http_post(
    url := 'https://ariesai.in/api/cron/daily-report',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <YOUR_CRON_SECRET>'),
    timeout_milliseconds := 55000
  );
$CRON$);

-- Verify:
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'aries-%';
