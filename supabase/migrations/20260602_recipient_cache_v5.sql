-- ═══════════════════════════════════════════════════════════
-- 📣 WhatsApp Broadcast Recipient Cache (Phase 6)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS broadcast_campaign_recipient_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  name TEXT,
  email TEXT,
  source_type TEXT,
  source_label TEXT,
  status TEXT CHECK (status IN ('eligible', 'excluded', 'duplicate_removed', 'invalid', 'opted_out')),
  last_interaction_at TIMESTAMPTZ,
  normalized_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_broadcast_recipient_cache_campaign ON broadcast_campaign_recipient_cache(campaign_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipient_cache_tenant ON broadcast_campaign_recipient_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipient_cache_status ON broadcast_campaign_recipient_cache(campaign_id, status);

-- Enable Row Level Security
ALTER TABLE broadcast_campaign_recipient_cache ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policy
DROP POLICY IF EXISTS "Recipient cache scoped to tenant" ON broadcast_campaign_recipient_cache;
CREATE POLICY "Recipient cache scoped to tenant" ON broadcast_campaign_recipient_cache
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());
