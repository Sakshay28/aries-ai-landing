-- ═══════════════════════════════════════════════════════════
-- Unpaid-booking auto-expiry + Meta-ad → campaign mapping
-- Run in Supabase SQL Editor (idempotent).
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- How long an unpaid (pay-to-confirm) booking holds its slot before being released.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS booking_hold_minutes INT NOT NULL DEFAULT 20;

-- Link a tracking campaign to a specific Meta ad, so Click-to-WhatsApp leads from
-- that ad get tagged even when the message carries no ref code.
ALTER TABLE lead_campaigns
  ADD COLUMN IF NOT EXISTS meta_ad_id TEXT;

CREATE INDEX IF NOT EXISTS idx_lead_campaigns_ad ON lead_campaigns(tenant_id, meta_ad_id);

COMMIT;
