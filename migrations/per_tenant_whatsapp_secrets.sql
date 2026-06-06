-- ═══════════════════════════════════════════════════════════════════
-- Per-Tenant WhatsApp App Secret
-- ═══════════════════════════════════════════════════════════════════
-- Each client has their OWN Meta Developer App with their own App Secret.
-- We store it encrypted per tenant so webhook signatures can be verified
-- using the correct secret for each client's app.
--
-- Run in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════

-- Add wa_app_secret column if it doesn't already exist
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS wa_app_secret TEXT DEFAULT NULL;

COMMENT ON COLUMN tenants.wa_app_secret IS
  'AES-256-GCM encrypted Meta App Secret for this tenant. Used to verify incoming webhook signatures. Each client has their own Meta Developer App with a different secret.';

-- Index is not needed on this column (only ever looked up alongside wa_phone_number_id which is already indexed)
