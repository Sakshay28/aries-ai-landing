-- ═══════════════════════════════════════════════════════════
-- Broadcast Fix: 2026-06-03
-- Fixes audience_type constraint, adds is_ready, language columns
-- ═══════════════════════════════════════════════════════════

-- 1. Add 'manual' to audience_type — was silently failing all manual-audience saves
ALTER TABLE broadcast_audiences
  DROP CONSTRAINT IF EXISTS broadcast_audiences_audience_type_check;

ALTER TABLE broadcast_audiences
  ADD CONSTRAINT broadcast_audiences_audience_type_check
    CHECK (audience_type IN ('all', 'tags', 'custom', 'retarget', 'csv', 'manual'));

-- 2. Add is_ready column to campaigns (used by launch route)
ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS is_ready BOOLEAN DEFAULT FALSE;

-- 3. Add language column to campaigns (for correct Meta API language code)
ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS template_language TEXT DEFAULT 'en';

-- 4. Add sent_at / completed_at if missing
ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 5. Add recipient_count alias (some queries use this)
ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS recipient_count INTEGER DEFAULT 0;

-- 6. Ensure broadcast_analytics table has all columns
ALTER TABLE broadcast_analytics
  ADD COLUMN IF NOT EXISTS sent_count INTEGER DEFAULT 0;
ALTER TABLE broadcast_analytics
  ADD COLUMN IF NOT EXISTS delivered_count INTEGER DEFAULT 0;
ALTER TABLE broadcast_analytics
  ADD COLUMN IF NOT EXISTS read_count INTEGER DEFAULT 0;
ALTER TABLE broadcast_analytics
  ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0;

-- 7. Ensure broadcast_queue has payload column with defaults
ALTER TABLE broadcast_queue
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}';

-- 8. Add language to broadcast_queue for correct Meta API calls
ALTER TABLE broadcast_queue
  ADD COLUMN IF NOT EXISTS language_code TEXT DEFAULT 'en';

-- 9. Update broadcast_jobs view to include language_code
CREATE OR REPLACE VIEW broadcast_jobs AS
SELECT
  id, tenant_id, campaign_id, contact_id, phone,
  status, attempt_count, next_attempt_at, locked_at,
  processed_at, failure_reason, language_code, payload, created_at
FROM broadcast_queue;

-- 10. Sync function: copies broadcast_analytics counts → broadcast_campaigns
--     Called after processQueue completes a batch
CREATE OR REPLACE FUNCTION sync_campaign_analytics(p_campaign_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE broadcast_campaigns bc
  SET
    sent_count      = COALESCE(ba.sent_count, 0),
    delivered_count = COALESCE(ba.delivered_count, 0),
    read_count      = COALESCE(ba.read_count, 0),
    failed_count    = COALESCE(ba.failed_count, 0),
    updated_at      = NOW()
  FROM broadcast_analytics ba
  WHERE ba.campaign_id = p_campaign_id
    AND bc.id          = p_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
