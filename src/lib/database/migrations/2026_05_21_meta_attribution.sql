-- Migration: Meta Ads Tracking Columns
-- Adds Meta Campaign attribution columns to the leads table for precise Ads ROI & Conversions API (CAPI) tracking.

BEGIN;

-- Add attribution columns to leads table safely
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_adset_id TEXT,
  ADD COLUMN IF NOT EXISTS fbclid TEXT;

-- Add index on attribution columns for fast ROI querying
CREATE INDEX IF NOT EXISTS idx_leads_meta_campaign ON leads(tenant_id, meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_fbclid ON leads(fbclid);

COMMIT;
