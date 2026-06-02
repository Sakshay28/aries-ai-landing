-- ═══════════════════════════════════════════════════════════
-- 📣 Campaign Atomic Metrics Increment Utility V4.2
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_campaign_counter(
  p_campaign_id UUID,
  p_status TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_status = 'sent' THEN
    UPDATE broadcast_campaigns SET sent_count = COALESCE(sent_count, 0) + 1 WHERE id = p_campaign_id;
  ELSIF p_status = 'delivered' THEN
    UPDATE broadcast_campaigns SET delivered_count = COALESCE(delivered_count, 0) + 1 WHERE id = p_campaign_id;
  ELSIF p_status = 'read' THEN
    UPDATE broadcast_campaigns SET read_count = COALESCE(read_count, 0) + 1 WHERE id = p_campaign_id;
  ELSIF p_status = 'failed' THEN
    UPDATE broadcast_campaigns SET failed_count = COALESCE(failed_count, 0) + 1 WHERE id = p_campaign_id;
  END IF;
END;
$$;
