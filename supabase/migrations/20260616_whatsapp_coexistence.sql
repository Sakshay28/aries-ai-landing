-- ══════════════════════════════════════════════════════════════════════════
-- 20260616_whatsapp_coexistence.sql
-- WhatsApp Coexistence — run the Business App (phone) and Cloud API on the SAME
-- number at the same time. RUN IN THE SUPABASE SQL EDITOR. Idempotent.
--
-- Adds the persistence Coexistence needs on top of the existing Cloud-API
-- columns (wa_access_token / wa_phone_number_id / wa_waba_id):
--   • tenants.wa_mode               — 'cloud_api' (default) | 'coexistence'
--   • tenants.coexistence_auto_pause — pause the AI for a chat when the owner
--                                      replies from their phone (echo). Default on.
--   • tenants.coexistence_connected_at
--   • messages.sent_via             — NULL/'api' (Cloud API) | 'whatsapp_app'
--                                      (sent by the owner from their phone, i.e.
--                                      an smb_message_echoes event)
--   • messages.is_historical        — true for rows backfilled by the `history`
--                                      webhook (no AI / follow-ups / integrations)
--   • leads.wa_contact_synced_at    — set when smb_app_state_sync filled the name
--   • coexistence_history_sync       — per-chunk progress of the 6-month import
--
-- Plus a partial UNIQUE index on messages(wa_message_id) so the echo/history
-- upserts (ON CONFLICT … DO NOTHING) and the inbound dedup are reliable.
--
-- Safe: every column is additive with a backward-compatible default, so existing
-- Cloud-API tenants are unaffected until they reconnect via Coexistence.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. tenants: coexistence mode + behaviour ────────────────────────────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS wa_mode TEXT NOT NULL DEFAULT 'cloud_api',
  ADD COLUMN IF NOT EXISTS coexistence_auto_pause BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS coexistence_connected_at TIMESTAMPTZ DEFAULT NULL;

-- Constrain wa_mode to known values (guard so re-running doesn't duplicate it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_wa_mode_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_wa_mode_check
      CHECK (wa_mode IN ('cloud_api', 'coexistence'));
  END IF;
END $$;

COMMENT ON COLUMN public.tenants.wa_mode IS
  'WhatsApp connection mode: cloud_api (number lives on the API) or coexistence (number stays on the Business App AND mirrors to the API).';
COMMENT ON COLUMN public.tenants.coexistence_auto_pause IS
  'When true, an owner reply from the phone (smb_message_echoes) soft-pauses the AI for that conversation (auto-resumes after escalation_timeout_mins).';

-- ── 2. messages: provenance + historical backfill flag ──────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sent_via TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_historical BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.messages.sent_via IS
  'How an outbound message left the number: NULL/api = Cloud API (AriesAI), whatsapp_app = sent by the owner from the WhatsApp Business app (coexistence echo).';
COMMENT ON COLUMN public.messages.is_historical IS
  'True for messages backfilled by the coexistence `history` webhook. These never trigger AI, follow-ups, or integrations.';

-- UNIQUE index backing the wa_message_id dedup (inbound, echo, history).
-- NOT partial on purpose: PostgREST's `on_conflict=wa_message_id` (used by the
-- history batch upsert) emits `ON CONFLICT (wa_message_id)` with no predicate,
-- which Postgres will NOT match to a partial index. A plain unique index still
-- allows unlimited NULL wa_message_id rows (NULLs are distinct in a unique
-- index), so failed/scripted/off-hours sends with no wamid are unaffected, while
-- non-null ids stay unique. IF NOT EXISTS keeps it idempotent. (If creation fails
-- on pre-existing duplicate non-null wa_message_id rows, dedupe them first — the
-- inbound path already enforces uniqueness in practice.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_wa_message_id
  ON public.messages (wa_message_id);

-- Speeds up "Sent from phone" / imported filtering in the inbox.
CREATE INDEX IF NOT EXISTS idx_messages_sent_via
  ON public.messages (conversation_id, sent_via)
  WHERE sent_via IS NOT NULL;

-- ── 3. leads: contact-name sync marker ──────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS wa_contact_synced_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.leads.wa_contact_synced_at IS
  'Set when smb_app_state_sync filled leads.name from the phone''s contact list.';

-- ── 4. coexistence_history_sync: 6-month import progress (idempotency + UI) ──
CREATE TABLE IF NOT EXISTS public.coexistence_history_sync (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  waba_id          TEXT,
  phone_number_id  TEXT,
  phase            TEXT,
  chunk_order      INTEGER,
  progress         TEXT,           -- Meta sends this as a 0–100 string
  messages_imported INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress | completed
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

-- One row per (tenant, phase, chunk) so re-delivered chunks update in place.
CREATE UNIQUE INDEX IF NOT EXISTS uq_coex_history_sync_chunk
  ON public.coexistence_history_sync (tenant_id, phase, chunk_order);

CREATE INDEX IF NOT EXISTS idx_coex_history_sync_tenant
  ON public.coexistence_history_sync (tenant_id, updated_at DESC);

-- RLS: the dashboard (anon/authenticated) reads its own sync status; the webhook
-- writes via service_role (BYPASSRLS). Mirrors 20260613_rls_core_tenant_isolation.
ALTER TABLE public.coexistence_history_sync ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coexistence_history_sync'
      AND policyname = 'tenant_isolation_core'
  ) THEN
    CREATE POLICY "tenant_isolation_core" ON public.coexistence_history_sync
      FOR ALL
      TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;
END $$;
