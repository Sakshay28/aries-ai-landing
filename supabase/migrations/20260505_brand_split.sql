-- ═══════════════════════════════════════════════════════════
-- 🌗 Brand Split Migration — Aries AI ↔ Libra AI
-- ═══════════════════════════════════════════════════════════
-- Adds a `brand` column to tenants so a single platform can
-- serve two product brands from the same codebase + DB:
--   - 'aries' → WhatsApp-first (default, all existing tenants)
--   - 'libra' → Instagram-first
--
-- Run AFTER schema.sql in Supabase SQL Editor.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════

-- 1. Add brand column with default 'aries' for backfill safety
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS brand TEXT NOT NULL DEFAULT 'aries'
    CHECK (brand IN ('aries', 'libra'));

-- 2. Index for brand-scoped queries (admin dashboards, plan filters)
CREATE INDEX IF NOT EXISTS idx_tenants_brand ON tenants(brand);

-- 3. Backfill: any tenant who has Instagram credentials but no
--    WhatsApp credentials is implicitly Libra. Owners of pure-WA
--    accounts stay 'aries'. Mixed accounts stay 'aries' (WA-first).
UPDATE tenants
SET brand = 'libra'
WHERE brand = 'aries'
  AND ig_page_id IS NOT NULL
  AND wa_phone_number_id IS NULL;

-- 4. Helpful view: tenants by brand (for admin overview)
CREATE OR REPLACE VIEW tenants_by_brand AS
SELECT
  brand,
  plan,
  plan_status,
  COUNT(*) AS tenant_count,
  SUM(messages_used_this_month) AS total_messages_this_month,
  SUM(ai_tokens_used_this_month) AS total_tokens_this_month
FROM tenants
WHERE is_active = true
GROUP BY brand, plan, plan_status;

-- 5. Audit log skipped (column schema varies by instance)
