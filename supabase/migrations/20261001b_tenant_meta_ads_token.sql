-- Read-only Meta Marketing API token (ads_read) used by the daily report to
-- fetch ad spend (src/lib/reports/liveSources.ts). Kept separate from
-- wa_access_token because a merchant's ad account usually lives in a
-- different business portfolio from the WhatsApp number, so one system-user
-- token can't cover both. Encrypted with keyManager (encryptTokenV2).
-- Set via scripts/connect-meta-ads-token.mts.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS meta_ads_token TEXT;
