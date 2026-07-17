-- ═══════════════════════════════════════════════════════════
-- Consent records — proof that a tenant agreed to Terms + Privacy
-- ═══════════════════════════════════════════════════════════
-- Signup previously only had a passive footer link ("by signing up you
-- agree to..."), never an explicit, recorded acceptance. This is an
-- append-only ledger: nothing ever updates or deletes a row here except
-- the FK going null when a tenant is deleted (ON DELETE SET NULL, not
-- CASCADE) — proof-of-consent is deliberately kept even after account
-- deletion, since demonstrating what was agreed to and when is itself a
-- compliance requirement that outlives the account.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS consent_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid REFERENCES tenants(id) ON DELETE SET NULL,
  email          text NOT NULL,
  consent_type   text NOT NULL DEFAULT 'terms_and_privacy',
  policy_version text NOT NULL,
  source         text NOT NULL, -- 'otp_signup' | 'google_oauth' | 'password_signup'
  ip_address     text,
  user_agent     text,
  accepted_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_records_tenant ON consent_records (tenant_id);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'consent_records' AND policyname = 'consent_records_tenant_isolation'
  ) THEN
    CREATE POLICY consent_records_tenant_isolation ON consent_records
      FOR SELECT USING (tenant_id = public.get_current_tenant_id());
  END IF;
END
$$;

-- No INSERT/UPDATE/DELETE policy for authenticated/anon on purpose — only
-- supabaseAdmin (service role) ever writes, via recordConsent().
