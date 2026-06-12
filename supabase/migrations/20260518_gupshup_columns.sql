-- ═══════════════════════════════════════════════════════════
-- 🔌 Migration: Gupshup BSP columns on tenants
-- Run this FIRST — before the automation_flows migration.
-- These columns are referenced throughout the codebase but
-- were never in the original schema (only Meta WA columns were).
-- ═══════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS gupshup_api_key        TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gupshup_phone_number   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gupshup_app_name       TEXT DEFAULT NULL;

-- Unique index so webhook routing can look up tenant by phone
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_gupshup_phone
  ON tenants(gupshup_phone_number)
  WHERE gupshup_phone_number IS NOT NULL;

COMMIT;
