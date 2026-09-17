-- ═══════════════════════════════════════════════════════════
-- Private media buckets (2026-09-17)
-- ═══════════════════════════════════════════════════════════
-- Customer and operator media stop being readable by anyone holding a URL.
-- Idempotent — safe to re-run.
--
-- DEPLOY ORDER: ship the code first (dashboard renders media through
-- /api/media/{id}/stream and all sends sign links), THEN run this. Running it
-- before the deploy breaks inbox images/videos until the deploy lands.
--
-- Private after this:  whatsapp-media   (media customers send in)
--                      chat-attachments (media operators send from the inbox)
--                      knowledge-docs   (knowledge-base files)
--                      voice-notes      (unused, empty)
-- Stays PUBLIC:        template-media   — template headers, follow-up, flow and
--   welcome media that Meta fetches as plain links (the broadcast queue can
--   send hours after upload). These are marketing assets sent to many customers.
--
-- Every app read/write of these buckets uses the service role or a signed
-- token, neither of which needs storage.objects RLS policies.

-- 1. Buckets ────────────────────────────────────────────────────────────────
UPDATE storage.buckets
SET public = false
WHERE id IN ('whatsapp-media', 'chat-attachments', 'knowledge-docs', 'voice-notes');

-- 2. Policies ───────────────────────────────────────────────────────────────
-- Making a bucket private only disables the /object/public/ URL. Reads through
-- /object/authenticated/ (and listing) are governed by RLS on storage.objects,
-- and 20260611_inbox_production_hardening.sql created
--   "WhatsApp media public read"  FOR SELECT USING (bucket_id = 'whatsapp-media')
-- for ALL roles — verified 2026-09-17 that the public anon key could list
-- whatsapp-media. Drop that, any other non-service policy naming a private
-- bucket (e.g. created in the dashboard), and any blanket USING (true) read
-- policy, which would expose every private bucket.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND NOT (roles = ARRAY['service_role']::name[])
      AND COALESCE(qual, '') NOT ILIKE '%service_role%'
      AND (
        concat_ws(' ', qual, with_check) ~* '(whatsapp-media|chat-attachments|knowledge-docs|voice-notes)'
        OR (cmd IN ('SELECT', 'ALL') AND (qual IS NULL OR btrim(qual) IN ('true', '(true)')))
      )
  LOOP
    RAISE NOTICE 'Dropping storage.objects policy "%" (cmd=%, roles=%, using=%)', p.policyname, p.cmd, p.roles, p.qual;
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- 3. Verify ─────────────────────────────────────────────────────────────────
-- Expect: the four buckets public = false, template-media public = true.
SELECT id, public FROM storage.buckets ORDER BY id;

-- Expect: nothing below grants SELECT to anon/authenticated/public on the
-- private buckets (a service_role-only policy is fine).
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
