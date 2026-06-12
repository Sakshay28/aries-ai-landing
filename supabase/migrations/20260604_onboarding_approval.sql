-- ═══════════════════════════════════════════════════════════
-- Onboarding approval gate
-- New signups land in "pending approval" until a platform admin
-- approves them. Existing tenants are auto-approved so nobody is
-- ever locked out by this migration.
-- Run in Supabase SQL Editor (idempotent).
-- ═══════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- Approve everyone who already exists right now. Tenants created AFTER this
-- migration get the default (false) and must be approved by you.
UPDATE tenants SET is_approved = true;

COMMIT;

-- To approve a new client later (or do it from the in-app Approvals page):
--   UPDATE tenants SET is_approved = true WHERE business_name ILIKE '%their name%';
