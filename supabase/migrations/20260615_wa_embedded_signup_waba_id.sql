-- ═══════════════════════════════════════════════════════════
-- WhatsApp Embedded Signup — store the WABA id on the tenant
-- ═══════════════════════════════════════════════════════════
-- The Embedded Signup callback (/api/whatsapp/embedded-signup/callback)
-- resolves a client's WhatsApp Business Account and stores its id here so
-- we can re-subscribe the app to the WABA or debug delivery later. The
-- token (wa_access_token, encrypted) and phone number (wa_phone_number_id)
-- columns already exist and are what the send path / webhook read.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS wa_waba_id TEXT DEFAULT NULL;

COMMENT ON COLUMN tenants.wa_waba_id IS
  'WhatsApp Business Account (WABA) id captured during Embedded Signup onboarding.';
