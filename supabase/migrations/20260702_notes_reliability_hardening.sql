-- Migration: Notes Reliability Hardening
-- Root-cause fixes for notes disappearing in the CRM panel:
--   1. REPLICA IDENTITY FULL — without this, Postgres only replicates the
--      primary key on UPDATE/DELETE, so Realtime cannot evaluate the
--      `conversation_id=eq.X` filter (or the tenant_id RLS check) for those
--      events and silently drops them. Same class of bug already fixed for
--      messages/conversations in 20260616_chat_realtime_and_count_trigger.sql.
--   2. Soft delete — deleted_at instead of hard DELETE, so notes are never
--      unrecoverably destroyed and an audit trail survives.
--   3. contact_id index — notes are being looked up by contact going forward
--      (a contact can span multiple conversation threads; scoping strictly to
--      conversation_id makes notes vanish whenever a new thread is opened for
--      the same customer).

BEGIN;

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.notes REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_notes_contact_created ON public.notes (contact_id, created_at DESC);

COMMIT;
