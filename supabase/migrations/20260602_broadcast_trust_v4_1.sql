-- ═══════════════════════════════════════════════════════════
-- 📣 WhatsApp Broadcast Trust, Observability & Telemetry V4.1
-- ═══════════════════════════════════════════════════════════
-- Production-grade multi-tenant tables.
-- Scoped with strict RLS isolation using public.get_current_tenant_id().
-- ═══════════════════════════════════════════════════════════

-- 1. Campaign Execution Events (Phase 1)
CREATE TABLE IF NOT EXISTS broadcast_execution_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'success')),
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_events_campaign ON broadcast_execution_events(campaign_id, created_at DESC);

ALTER TABLE broadcast_execution_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'broadcast_execution_events' AND policyname = 'execution_events_tenant_isolation'
  ) THEN
    CREATE POLICY execution_events_tenant_isolation ON broadcast_execution_events 
      FOR ALL USING (tenant_id = public.get_current_tenant_id());
  END IF;
END
$$;

-- 2. Enterprise Audit Log (Phase 2)
CREATE TABLE IF NOT EXISTS broadcast_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  before_state JSONB DEFAULT '{}',
  after_state JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_campaign ON broadcast_audit_logs(campaign_id, created_at DESC);

ALTER TABLE broadcast_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'broadcast_audit_logs' AND policyname = 'audit_logs_tenant_isolation'
  ) THEN
    CREATE POLICY audit_logs_tenant_isolation ON broadcast_audit_logs 
      FOR ALL USING (tenant_id = public.get_current_tenant_id());
  END IF;
END
$$;

-- 3. Telemetry & Latency Benchmarks (Phase 7)
CREATE TABLE IF NOT EXISTS broadcast_telemetry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC(10, 3) NOT NULL, -- duration in ms
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_metrics ON broadcast_telemetry(metric_name, created_at DESC);

ALTER TABLE broadcast_telemetry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'broadcast_telemetry' AND policyname = 'telemetry_tenant_isolation'
  ) THEN
    CREATE POLICY telemetry_tenant_isolation ON broadcast_telemetry 
      FOR ALL USING (tenant_id = public.get_current_tenant_id());
  END IF;
END
$$;
