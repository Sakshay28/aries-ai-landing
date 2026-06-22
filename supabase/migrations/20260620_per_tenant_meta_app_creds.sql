-- ═══════════════════════════════════════════════════════════════════
-- Per-tenant Meta Ads App Credentials
-- ═══════════════════════════════════════════════════════════════════
-- Allows each tenant to use their own Facebook Developer App for the
-- Meta Ads OAuth flow, instead of a single global env var.
-- meta_ads_app_secret is AES-256-GCM encrypted (same as other tokens).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS meta_ads_app_id     TEXT,
  ADD COLUMN IF NOT EXISTS meta_ads_app_secret TEXT;
