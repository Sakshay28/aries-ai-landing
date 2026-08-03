-- ═══════════════════════════════════════════════════════════
-- Broadcast audience type: shopify_segment
-- ═══════════════════════════════════════════════════════════
-- Adds 'shopify_segment' to the broadcast_audiences.audience_type
-- CHECK so merchants can broadcast to filtered Shopify audiences
-- (e.g. customers who ordered in the last 30 days, spent > X,
-- have a specific customer tag, or have never ordered).
--
-- NOTE: the audience_type column lives on broadcast_audiences,
-- NOT broadcast_campaigns — same pattern as 20260731's 'recent'
-- addition. Getting the table wrong yields ERROR 42703.

BEGIN;

ALTER TABLE broadcast_audiences DROP CONSTRAINT IF EXISTS broadcast_audiences_audience_type_check;
ALTER TABLE broadcast_audiences ADD CONSTRAINT broadcast_audiences_audience_type_check
  CHECK (audience_type IN ('all', 'tags', 'custom', 'retarget', 'csv', 'manual', 'recent', 'shopify_segment'));

COMMIT;
