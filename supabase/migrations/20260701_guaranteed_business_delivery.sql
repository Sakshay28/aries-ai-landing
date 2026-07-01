-- ══════════════════════════════════════════════════════════════════════════
-- 20260701_guaranteed_business_delivery.sql
-- "Guaranteed Business Delivery" — businesses must never miss a customer
-- event because the staff/manager WhatsApp 24h session window closed.
-- SAFE TO RUN MULTIPLE TIMES (idempotent).
--
--   PART 1: conversations — persisted WhatsApp session state (per direction)
--           + trigger that keeps it correct regardless of which code path
--           inserts a message (mirrors sync_conversation_message_count from
--           20260616_chat_realtime_and_count_trigger.sql).
--   PART 2: find_session_expiring_conversations() — ships the RPC that
--           session-keepalive/route.ts already calls but that was never
--           created (it silently fell back to a slower ad-hoc query).
--   PART 3: draft_templates.event_type — binds an approved template to a
--           system event so the fallback sender can auto-select it.
--   PART 4: business_notifications — durable, business-facing notification +
--           audit-trail table, RLS + Realtime enabled.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── PART 1: conversations session-state columns ─────────────────────────────

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_inbound_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_outbound_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS window_expires_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_template_name     TEXT,
  ADD COLUMN IF NOT EXISTS last_template_sent_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_conversations_window_expires
  ON conversations (window_expires_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_conversations_last_inbound
  ON conversations (last_inbound_at)
  WHERE is_active = true;

-- Single source of truth: every INSERT into messages updates the parent
-- conversation's session state. Guards (>= last_*_at) make it safe against
-- out-of-order inserts (delayed webhook delivery, backfills) — the state
-- only ever moves forward, never regresses to an older timestamp.
CREATE OR REPLACE FUNCTION public.sync_conversation_session_state()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE conversations
       SET last_inbound_at   = NEW.created_at,
           window_expires_at = NEW.created_at + INTERVAL '24 hours'
     WHERE id = NEW.conversation_id
       AND (last_inbound_at IS NULL OR NEW.created_at >= last_inbound_at);
  ELSIF NEW.direction = 'outbound' THEN
    UPDATE conversations
       SET last_outbound_at      = NEW.created_at,
           last_template_name    = CASE
                                      WHEN NEW.message_type = 'template'
                                      THEN COALESCE(NEW.metadata->>'template_name', last_template_name)
                                      ELSE last_template_name
                                    END,
           last_template_sent_at = CASE
                                      WHEN NEW.message_type = 'template'
                                      THEN NEW.created_at
                                      ELSE last_template_sent_at
                                    END
     WHERE id = NEW.conversation_id
       AND (last_outbound_at IS NULL OR NEW.created_at >= last_outbound_at);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_conv_session_state ON public.messages;
CREATE TRIGGER trg_sync_conv_session_state
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.sync_conversation_session_state();

-- One-time backfill so the columns match reality the moment the trigger goes live.
UPDATE conversations c SET
  last_inbound_at       = sub.last_in,
  window_expires_at     = sub.last_in + INTERVAL '24 hours',
  last_outbound_at      = sub.last_out,
  last_template_name    = sub.tpl_name,
  last_template_sent_at = sub.tpl_at
FROM (
  SELECT
    conversation_id,
    MAX(created_at) FILTER (WHERE direction = 'inbound')  AS last_in,
    MAX(created_at) FILTER (WHERE direction = 'outbound') AS last_out,
    (ARRAY_AGG(metadata->>'template_name' ORDER BY created_at DESC)
       FILTER (WHERE direction = 'outbound' AND message_type = 'template'))[1] AS tpl_name,
    MAX(created_at) FILTER (WHERE direction = 'outbound' AND message_type = 'template') AS tpl_at
  FROM messages
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id
  AND c.last_inbound_at IS DISTINCT FROM sub.last_in;

-- ── PART 2: find_session_expiring_conversations RPC ──────────────────────────
-- Already called by src/app/api/cron/session-keepalive/route.ts (customer
-- keepalive) but never shipped — the route has been silently using a slower
-- fallback query this whole time. Same semantics as that fallback: active,
-- staff-handled (bot_paused or escalated) conversations whose last inbound
-- message falls in the 22-23.5h-ago window, with no outbound sent recently.
CREATE OR REPLACE FUNCTION public.find_session_expiring_conversations(
  window_open_at  TIMESTAMPTZ,
  window_close_at TIMESTAMPTZ,
  dedup_cutoff    TIMESTAMPTZ
)
RETURNS TABLE (
  conversation_id UUID,
  tenant_id       UUID,
  sender_id       TEXT,
  phone           TEXT,
  lead_name       TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.tenant_id, c.sender_id,
         COALESCE(l.phone, c.sender_id) AS phone,
         l.name AS lead_name
    FROM conversations c
    LEFT JOIN leads l ON l.id = c.lead_id
   WHERE c.is_active = true
     AND (c.bot_paused = true OR c.escalated = true)
     AND c.last_inbound_at BETWEEN window_close_at AND window_open_at
     AND NOT EXISTS (
       SELECT 1 FROM messages m
        WHERE m.conversation_id = c.id
          AND m.direction = 'outbound'
          AND m.created_at >= dedup_cutoff
     )
$$;
REVOKE ALL ON FUNCTION public.find_session_expiring_conversations FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_session_expiring_conversations TO service_role;

-- ── PART 3: draft_templates.event_type — bind an approved template to a
--    system event so the guaranteed-delivery sender can auto-select it ─────
ALTER TABLE draft_templates
  ADD COLUMN IF NOT EXISTS event_type TEXT;

ALTER TABLE draft_templates DROP CONSTRAINT IF EXISTS draft_templates_event_type_check;
ALTER TABLE draft_templates ADD CONSTRAINT draft_templates_event_type_check
  CHECK (event_type IS NULL OR event_type IN (
    'booking_confirmation', 'booking_reminder', 'human_assistance', 'support_response',
    'lead_follow_up', 'callback_request', 'order_update', 'reservation_update',
    'thank_you', 'payment_confirmation', 'staff_keepalive'
  ));

-- One bound (and approved) template per event per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_templates_tenant_event_uniq
  ON draft_templates (tenant_id, event_type)
  WHERE status = 'APPROVED' AND event_type IS NOT NULL;

-- ── PART 4: business_notifications — durable business-facing notification +
--    audit trail. Written BEFORE any WhatsApp send is attempted, so the
--    business has a record even if WhatsApp delivery fails outright. ───────
CREATE TABLE IF NOT EXISTS business_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL CHECK (event_type IN (
                    'booking_confirmation', 'booking_reminder', 'human_assistance', 'support_response',
                    'lead_follow_up', 'callback_request', 'order_update', 'reservation_update',
                    'thank_you', 'payment_confirmation', 'staff_keepalive'
                  )),
  severity        TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title           TEXT NOT NULL,
  body            TEXT,
  payload         JSONB DEFAULT '{}',
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
  -- [{ phone, role, status: 'pending'|'sent_session'|'sent_template'|'failed', wa_message_id, error }]
  recipients      JSONB NOT NULL DEFAULT '[]',
  wa_status       TEXT NOT NULL DEFAULT 'pending'
                  CHECK (wa_status IN ('pending', 'sent_session', 'sent_template', 'partially_sent', 'failed', 'no_template')),
  attempt_count   INT NOT NULL DEFAULT 0,
  next_retry_at   TIMESTAMPTZ,
  locked_at       TIMESTAMPTZ,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_notifications_tenant_created
  ON business_notifications (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_notifications_tenant_unread
  ON business_notifications (tenant_id, is_read)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_business_notifications_retry
  ON business_notifications (wa_status, next_retry_at)
  WHERE wa_status = 'failed';

ALTER TABLE business_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_core" ON business_notifications;
CREATE POLICY "tenant_isolation_core" ON business_notifications
  FOR ALL TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

ALTER TABLE public.business_notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'business_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.business_notifications;
  END IF;
END $$;

COMMIT;

-- ── Verification ─────────────────────────────────────────────────────────────
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'conversations'
  AND column_name IN ('last_inbound_at', 'last_outbound_at', 'window_expires_at', 'last_template_name', 'last_template_sent_at')
ORDER BY column_name;

SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('sync_conversation_session_state', 'find_session_expiring_conversations');

SELECT tablename, '✅ in realtime publication' AS status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'business_notifications';

SELECT 'business_notifications RLS enabled' AS check_name,
       CASE WHEN relrowsecurity THEN '✅ PASS' ELSE '❌ FAIL' END AS status
FROM pg_class WHERE relname = 'business_notifications';
