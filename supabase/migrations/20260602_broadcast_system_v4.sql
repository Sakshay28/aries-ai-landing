-- ═══════════════════════════════════════════════════════════
-- 📣 WhatsApp Broadcast System V4 Normalized Database Schema
-- ═══════════════════════════════════════════════════════════
-- Production-grade, highly normalized multi-tenant tables.
-- Scoped with strict RLS isolation using public.get_current_tenant_id().
-- ═══════════════════════════════════════════════════════════

-- 1. Upgrade Existing broadcast_campaigns Table Safely
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS template_category TEXT DEFAULT 'MARKETING';
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS delivery_mode TEXT DEFAULT 'now' CHECK (delivery_mode IN ('now', 'scheduled', 'recurring'));
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(10, 2) DEFAULT 0.00;
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS estimated_duration INTEGER DEFAULT 0; -- in minutes
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Asia/Kolkata';
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS spam_risk TEXT DEFAULT 'LOW' CHECK (spam_risk IN ('LOW', 'MEDIUM', 'HIGH'));
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT FALSE;
ALTER TABLE broadcast_campaigns ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Ensure RLS is active on campaign table
ALTER TABLE broadcast_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaigns scoped to tenant" ON broadcast_campaigns
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- 2. Meta Approved Templates Cache
CREATE TABLE IF NOT EXISTS broadcast_templates_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meta_template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL,
  template_json JSONB DEFAULT '{}',
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_meta_template UNIQUE (tenant_id, name, language)
);

ALTER TABLE broadcast_templates_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates cache scoped to tenant" ON broadcast_templates_cache
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_templates_cache_tenant ON broadcast_templates_cache(tenant_id, name);

-- 3. Variable Mapping Table
CREATE TABLE IF NOT EXISTS broadcast_variable_mapping (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  variable_key TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('crm_field', 'static', 'custom')),
  crm_field TEXT,
  custom_value TEXT,
  ai_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_variable_key UNIQUE (campaign_id, variable_key)
);

ALTER TABLE broadcast_variable_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Variable mappings scoped to tenant" ON broadcast_variable_mapping
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_var_map_campaign ON broadcast_variable_mapping(campaign_id);

-- 4. Cohort Audiences Table
CREATE TABLE IF NOT EXISTS broadcast_audiences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('all', 'tags', 'custom', 'retarget', 'csv')),
  contact_count INTEGER NOT NULL DEFAULT 0,
  filters JSONB DEFAULT '{}',
  segment_ids UUID[] DEFAULT '{}',
  tag_ids UUID[] DEFAULT '{}',
  csv_upload_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_campaign_audience UNIQUE (campaign_id)
);

ALTER TABLE broadcast_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Audiences scoped to tenant" ON broadcast_audiences
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_audiences_campaign ON broadcast_audiences(campaign_id);

-- 5. Delivery Settings
CREATE TABLE IF NOT EXISTS broadcast_delivery_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  send_mode TEXT NOT NULL DEFAULT 'now',
  throttle_per_minute INTEGER NOT NULL DEFAULT 300,
  quiet_hours BOOLEAN NOT NULL DEFAULT TRUE,
  business_hours BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  retry_failed BOOLEAN NOT NULL DEFAULT TRUE,
  pause_on_failure BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_campaign_delivery UNIQUE (campaign_id)
);

ALTER TABLE broadcast_delivery_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery settings scoped to tenant" ON broadcast_delivery_settings
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_delivery_settings_campaign ON broadcast_delivery_settings(campaign_id);

-- 6. Follow-up Automation Rules
CREATE TABLE IF NOT EXISTS broadcast_automation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('replied', 'no_reply', 'cta_clicked', 'stop_received', 'failed')),
  action_type TEXT NOT NULL CHECK (action_type IN ('assign_human', 'trigger_flow', 'send_followup', 'notify_email', 'auto_optout', 'retry')),
  delay_minutes INTEGER DEFAULT 0,
  payload JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE broadcast_automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Automation rules scoped to tenant" ON broadcast_automation_rules
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_automation_rules_campaign ON broadcast_automation_rules(campaign_id);

-- 7. Production Deliveries Table (Individual recipient state log)
CREATE TABLE IF NOT EXISTS broadcast_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'read', 'failed')),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE broadcast_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deliveries scoped to tenant" ON broadcast_deliveries
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_deliveries_campaign_status ON broadcast_deliveries(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_deliveries_phone ON broadcast_deliveries(tenant_id, phone);

-- 8. Campaign Analytics Table
CREATE TABLE IF NOT EXISTS broadcast_analytics (
  campaign_id UUID PRIMARY KEY REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  read_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  clicked_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  opt_out_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE broadcast_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign analytics scoped to tenant" ON broadcast_analytics
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- 9. Broadcast Auditing System Logs
CREATE TABLE IF NOT EXISTS broadcast_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE broadcast_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Logs scoped to tenant" ON broadcast_logs
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_logs_campaign ON broadcast_logs(campaign_id);

-- 10. Audit Events Timeline Table
CREATE TABLE IF NOT EXISTS broadcast_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE broadcast_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Events scoped to tenant" ON broadcast_events
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

CREATE INDEX IF NOT EXISTS idx_events_campaign ON broadcast_events(campaign_id);
