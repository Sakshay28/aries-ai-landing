-- Migration: Google Sheets Real-Time Sync Queue & Audit Logs
-- Enforces event-driven architecture with zero webhook blocking.
-- Triggers on leads, conversations, bookings, and shopify events automatically enqueue updates.

BEGIN;

-- Add assigned_at column to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

-- Trigger to automatically maintain assigned_at on leads
CREATE OR REPLACE FUNCTION update_lead_assigned_at()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL THEN
    NEW.assigned_at := NOW();
  ELSIF TG_OP = 'UPDATE' AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    NEW.assigned_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_lead_assigned_at ON leads;
CREATE TRIGGER tr_update_lead_assigned_at
  BEFORE INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_lead_assigned_at();

-- 1. Create Sync Queue Table
CREATE TABLE IF NOT EXISTS google_sheets_sync_queue (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id        UUID         REFERENCES leads(id) ON DELETE CASCADE,
  phone          TEXT         NOT NULL,
  event_type     TEXT         NOT NULL,
  payload        JSONB        NOT NULL DEFAULT '{}',
  status         TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts       INTEGER      NOT NULL DEFAULT 0,
  max_attempts   INTEGER      NOT NULL DEFAULT 5,
  error_message  TEXT,
  run_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for queue polling efficiency
CREATE INDEX IF NOT EXISTS idx_gsheets_queue_status_run 
  ON google_sheets_sync_queue(status, run_at);

CREATE INDEX IF NOT EXISTS idx_gsheets_queue_tenant
  ON google_sheets_sync_queue(tenant_id);

-- Unique index to automatically merge pending jobs per customer phone
CREATE UNIQUE INDEX IF NOT EXISTS uq_gsheets_queue_pending 
  ON google_sheets_sync_queue(tenant_id, phone) 
  WHERE status = 'pending';


-- 2. Create Audit Log Table
CREATE TABLE IF NOT EXISTS google_sheets_audit_logs (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id        UUID         REFERENCES leads(id) ON DELETE SET NULL,
  phone          TEXT         NOT NULL,
  event_type     TEXT         NOT NULL,
  status         TEXT         NOT NULL CHECK (status IN ('success', 'failed')),
  error_message  TEXT,
  latency_ms     INTEGER,
  details        JSONB        NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gsheets_audit_tenant_created 
  ON google_sheets_audit_logs(tenant_id, created_at DESC);


-- 3. Row-Level Security (RLS) policies
ALTER TABLE google_sheets_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_sheets_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_gsheets_queue" ON google_sheets_sync_queue;
CREATE POLICY "users_own_gsheets_queue" ON google_sheets_sync_queue
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "users_own_gsheets_audit" ON google_sheets_audit_logs;
CREATE POLICY "users_own_gsheets_audit" ON google_sheets_audit_logs
  FOR ALL USING (
    tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid())
  );


-- 4. Trigger Function for Sync Queueing
CREATE OR REPLACE FUNCTION queue_google_sheets_sync()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id    UUID;
  v_phone        TEXT;
  v_lead_id      UUID;
  v_event_type   TEXT;
  v_is_active    BOOLEAN;
BEGIN
  -- Determine tenant, phone, and lead ID based on trigger table
  IF TG_TABLE_NAME = 'leads' THEN
    v_tenant_id := NEW.tenant_id;
    v_phone := NEW.phone;
    v_lead_id := NEW.id;
    
    IF TG_OP = 'INSERT' THEN
      v_event_type := 'customer_created';
    ELSE
      -- Detect specific changes
      IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
        v_event_type := 'assignment_changed';
      ELSIF OLD.lead_status IS DISTINCT FROM NEW.lead_status THEN
        v_event_type := 'status_changed';
      ELSIF OLD.tags IS DISTINCT FROM NEW.tags THEN
        v_event_type := 'tag_changed';
      ELSE
        v_event_type := 'customer_updated';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'conversations' THEN
    v_tenant_id := NEW.tenant_id;
    v_lead_id := NEW.lead_id;
    IF v_lead_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Look up phone from leads
    SELECT phone INTO v_phone FROM leads WHERE id = v_lead_id;
    IF v_phone IS NULL OR v_phone = '' THEN
      RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
      v_event_type := 'conversation_created';
    ELSE
      IF OLD.is_active = true AND NEW.is_active = false THEN
        v_event_type := 'conversation_resolved';
      ELSIF OLD.is_active = false AND NEW.is_active = true THEN
        v_event_type := 'conversation_reopened';
      ELSE
        v_event_type := 'conversation_updated';
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'restaurant_bookings' THEN
    v_tenant_id := NEW.restaurant_id;
    v_phone := NEW.customer_phone;
    
    -- Look up lead ID
    SELECT id INTO v_lead_id FROM leads WHERE tenant_id = v_tenant_id AND phone = v_phone LIMIT 1;
    v_event_type := 'reservation_created';

  ELSIF TG_TABLE_NAME = 'shopify_events' THEN
    v_tenant_id := NEW.tenant_id;
    v_lead_id := NEW.lead_id;
    IF v_lead_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Look up phone from leads
    SELECT phone INTO v_phone FROM leads WHERE id = v_lead_id;
    IF v_phone IS NULL OR v_phone = '' THEN
      RETURN NEW;
    END IF;

    v_event_type := 'order_created';
  ELSIF TG_TABLE_NAME = 'messages' THEN
    v_tenant_id := NEW.tenant_id;
    -- Find lead_id from conversation
    SELECT lead_id INTO v_lead_id FROM conversations WHERE id = NEW.conversation_id LIMIT 1;
    IF v_lead_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT phone INTO v_phone FROM leads WHERE id = v_lead_id;
    v_event_type := 'message_received';
  ELSE
    RETURN NEW;
  END IF;

  -- Skip if phone number is empty/null
  IF v_phone IS NULL OR v_phone = '' THEN
    RETURN NEW;
  END IF;

  -- Check if Google Sheets integration is active for this tenant
  SELECT is_active INTO v_is_active FROM tenant_integrations 
  WHERE tenant_id = v_tenant_id AND integration_id = 'google_sheets' LIMIT 1;

  IF v_is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Insert/Upsert into sync queue (coalesce pending jobs)
  INSERT INTO google_sheets_sync_queue (tenant_id, lead_id, phone, event_type, status, run_at)
  VALUES (v_tenant_id, v_lead_id, v_phone, v_event_type, 'pending', NOW())
  ON CONFLICT (tenant_id, phone) WHERE status = 'pending'
  DO UPDATE SET
    event_type = EXCLUDED.event_type,
    updated_at = NOW(),
    run_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Attach triggers to tables
DROP TRIGGER IF EXISTS tr_google_sheets_sync_leads ON leads;
CREATE TRIGGER tr_google_sheets_sync_leads
  AFTER INSERT OR UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION queue_google_sheets_sync();

DROP TRIGGER IF EXISTS tr_google_sheets_sync_conversations ON conversations;
CREATE TRIGGER tr_google_sheets_sync_conversations
  AFTER INSERT OR UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION queue_google_sheets_sync();

DROP TRIGGER IF EXISTS tr_google_sheets_sync_bookings ON restaurant_bookings;
CREATE TRIGGER tr_google_sheets_sync_bookings
  AFTER INSERT OR UPDATE ON restaurant_bookings
  FOR EACH ROW EXECUTE FUNCTION queue_google_sheets_sync();

DROP TRIGGER IF EXISTS tr_google_sheets_sync_shopify ON shopify_events;
CREATE TRIGGER tr_google_sheets_sync_shopify
  AFTER INSERT ON shopify_events
  FOR EACH ROW EXECUTE FUNCTION queue_google_sheets_sync();

DROP TRIGGER IF EXISTS tr_google_sheets_sync_messages ON messages;
CREATE TRIGGER tr_google_sheets_sync_messages
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION queue_google_sheets_sync();

-- Concurrency-Safe Atomic Claims Function for Scaling Workers
CREATE OR REPLACE FUNCTION claim_google_sheets_sync_jobs(p_worker_id TEXT, p_limit INT)
RETURNS TABLE(
  id             UUID,
  tenant_id      UUID,
  lead_id        UUID,
  phone          TEXT,
  event_type     TEXT,
  payload        JSONB,
  attempts       INTEGER
) AS $$
DECLARE
  v_ids UUID[];
BEGIN
  -- Select pending jobs atomically using SKIP LOCKED
  SELECT array_agg(q.id) INTO v_ids FROM (
    SELECT q.id FROM google_sheets_sync_queue q
    WHERE q.status = 'pending' AND q.run_at <= NOW()
    ORDER BY q.run_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) q;

  IF v_ids IS NULL THEN
    RETURN;
  END IF;

  -- Claim the jobs
  RETURN QUERY
  UPDATE google_sheets_sync_queue q
  SET
    status = 'processing',
    updated_at = NOW(),
    payload = jsonb_set(q.payload, '{worker_id}', to_jsonb(p_worker_id))
  WHERE q.id = ANY(v_ids)
  RETURNING q.id, q.tenant_id, q.lead_id, q.phone, q.event_type, q.payload, q.attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
