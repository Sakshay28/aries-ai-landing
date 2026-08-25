-- ─────────────────────────────────────────────────────────────────────────────
-- bot_paused_auto_resume_hours: tenant-level opt-in to auto-resume the bot on
-- a conversation that a human took over but then abandoned.
--
-- Motivation: today `conversations.bot_paused = true` is a permanent silence —
-- customers who message a paused thread get ignored forever unless an agent
-- clicks "Resume Bot" in the dashboard. This is fine when agents actually
-- follow through, but easy to forget after a handoff: an audit on 2026-08-24
-- found 30+ conversations stuck bot_paused across two tenants with fresh
-- inbound activity and no outbound in weeks.
--
-- With this column set to N hours, the webhook (route.ts bot_paused guard)
-- resumes the bot on the next inbound message when the last outbound is
-- older than N hours — any outbound after the pause is necessarily human
-- (bot replies stop the moment bot_paused flips on), so a stale outbound
-- means the agent has abandoned the thread. An agent who is actively
-- replying keeps the pause in place naturally: their reply updates
-- last_outbound_at, resetting the clock.
--
-- Default NULL = never auto-resume. Existing tenants keep today's behavior
-- (Globesome's lead-form handoff flow intentionally leaves conversations
-- paused, and shouldn't be blindly resumed by this feature). Tenants opt in
-- by setting the column via Settings.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS bot_paused_auto_resume_hours INTEGER;

COMMENT ON COLUMN public.tenants.bot_paused_auto_resume_hours IS
  'Hours after last outbound before an inactive bot_paused conversation auto-resumes on the next inbound. NULL = never auto-resume (default).';

-- Verify the column now exists so the migration surfaces mismatch loudly
-- (matches the assertion style used in 20260701 and later migrations).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'bot_paused_auto_resume_hours'
  ) THEN
    RAISE EXCEPTION 'tenants.bot_paused_auto_resume_hours was not added';
  END IF;
END $$;
