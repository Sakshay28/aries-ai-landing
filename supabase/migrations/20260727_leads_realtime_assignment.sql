-- ══════════════════════════════════════════════════════════════════════════
-- 20260727_leads_realtime_assignment.sql
-- Requires raw SQL — RUN IN THE SUPABASE SQL EDITOR. Idempotent.
--
-- Part of the "Assigned to me" inbox fix (2026-07-27).
--
-- The live-chat "Assigned to me" view reads leads.assigned_to, but a manual
-- reassignment (CRM panel / Leads page / assign API) writes ONLY the leads row
-- and emits no conversation event. The chat sidebar subscribes to realtime on
-- `conversations` + `messages` only, so a reassigned agent's inbox previously
-- updated just on the 20s poll — not instantly.
--
-- Add `leads` to the supabase_realtime publication with REPLICA IDENTITY FULL
-- so UPDATE events carry the OLD row too; the sidebar then reloads only when
-- assigned_to actually changes (avoiding churn on routine score/status writes).
--
-- Safe to run repeatedly. The application degrades gracefully to the poll if
-- this has not been applied yet, so it is not a hard deploy blocker.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.leads REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END $$;
