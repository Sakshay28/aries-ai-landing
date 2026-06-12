-- CREATE broadcast_queue table for V4 background processing
CREATE TABLE IF NOT EXISTS broadcast_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'delivered', 'failed', 'retrying', 'cancelled')),
  attempt_count INTEGER DEFAULT 0,
  next_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- High-performance conditional indexing
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_status_next_attempt 
  ON broadcast_queue(status, next_attempt_at) 
  WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_broadcast_queue_campaign_id 
  ON broadcast_queue(campaign_id);

CREATE INDEX IF NOT EXISTS idx_broadcast_queue_tenant_id 
  ON broadcast_queue(tenant_id);

-- Enable RLS and isolate database rows by tenant
ALTER TABLE broadcast_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'broadcast_queue' AND policyname = 'queue_tenant_isolation'
  ) THEN
    CREATE POLICY queue_tenant_isolation ON broadcast_queue 
      FOR ALL USING (tenant_id = public.get_current_tenant_id());
  END IF;
END
$$;

-- Thread-safe metrics increment utility
CREATE OR REPLACE FUNCTION increment_broadcast_analytics(target_campaign_id UUID, col_name TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('
    INSERT INTO broadcast_analytics (campaign_id, tenant_id, sent_count, delivered_count, read_count, failed_count, clicked_count, reply_count, opt_out_count, updated_at)
    VALUES ($1, (SELECT tenant_id FROM broadcast_campaigns WHERE id = $1), 0, 0, 0, 0, 0, 0, 0, NOW())
    ON CONFLICT (campaign_id) DO UPDATE
    SET %I = broadcast_analytics.%I + 1, updated_at = NOW()', col_name, col_name)
  USING target_campaign_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
