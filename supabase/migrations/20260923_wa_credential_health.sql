-- ═══════════════════════════════════════════════════════════
-- 🩺 WhatsApp credential health
-- ═══════════════════════════════════════════════════════════
-- Durable record of whether each tenant's WhatsApp credentials can still
-- reach the phone number they send from.
--
-- Background: Globesome India's outbound WhatsApp was dead from 2026-08-29 to
-- 2026-09-23 (25 days). Their access token came from a Meta app whose system
-- user had no WhatsApp assets assigned, so every send returned code 100 /
-- subcode 33. Inbound was unaffected (webhooks don't use the token), so the
-- inbox looked healthy and nothing in the product ever said otherwise.
--
-- One row per tenant. Written by the send path the moment a credential-class
-- failure happens, and by the daily /api/cron/wa-credential-health sweep so a
-- tenant with zero traffic is still checked.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wa_credential_health (
  tenant_id            uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- 'ok'      = Meta confirmed the token can see the phone number
  -- 'broken'  = a credential-class fault; this tenant cannot send at all
  -- 'unknown' = never checked yet
  status               text NOT NULL DEFAULT 'unknown'
                         CHECK (status IN ('ok', 'broken', 'unknown')),

  fault_kind           text,     -- token_invalid | no_asset_access | number_not_registered | billing | account_restricted
  fault_code           integer,  -- Meta error.code
  fault_subcode        integer,  -- Meta error.error_subcode (100/33 != plain 100)
  fault_title          text,     -- operator-facing headline
  fault_action         text,     -- what a human must go and do
  detail               text,     -- Meta's raw message, truncated. NEVER the token.

  phone_number_id      text,     -- the ID that was probed, for after-the-fact forensics

  consecutive_failures integer NOT NULL DEFAULT 0,
  first_failed_at      timestamptz,  -- start of the CURRENT outage; cleared on recovery
  last_ok_at           timestamptz,
  last_checked_at      timestamptz,
  last_alerted_at      timestamptz,  -- drives alert throttling, so a long outage doesn't spam
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- The cron sweep and the admin dashboard both want "who is broken right now".
CREATE INDEX IF NOT EXISTS wa_credential_health_broken_idx
  ON public.wa_credential_health (status, last_checked_at DESC)
  WHERE status = 'broken';

ALTER TABLE public.wa_credential_health ENABLE ROW LEVEL SECURITY;

-- Read-only for the tenant's own dashboard: the banner needs to render it, but
-- nothing in the browser should ever be able to mark its own channel healthy.
DROP POLICY IF EXISTS "tenant_read_own_wa_health" ON public.wa_credential_health;
CREATE POLICY "tenant_read_own_wa_health" ON public.wa_credential_health
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- Writes are service-role only (send path + cron), which bypasses RLS.

COMMENT ON TABLE public.wa_credential_health IS
  'Per-tenant WhatsApp credential reachability. Written by the send path on credential-class failures and by the daily wa-credential-health cron. Prevents a silent outbound outage like Globesome 2026-08-29 → 2026-09-23.';
