-- ═══════════════════════════════════════════════════════════
-- 📣 Broadcast Campaigns Schema
-- ═══════════════════════════════════════════════════════════
-- Required for Mission 3.1: Wire Broadcast to Gupshup Templates
-- ═══════════════════════════════════════════════════════════

-- 1. Broadcast Campaigns
CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Campaign Info
  name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_variables JSONB DEFAULT '[]',
  
  -- Audience Targeting
  audience_filter JSONB DEFAULT '{}',
  audience_count INTEGER DEFAULT 0,
  
  -- Execution Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'failed')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  
  -- Analytics
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON broadcast_campaigns(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON broadcast_campaigns(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON broadcast_campaigns(scheduled_at) WHERE status = 'scheduled';

-- 2. Broadcast Messages (Tracking individual recipients)
CREATE TABLE IF NOT EXISTS broadcast_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Delivery
  recipient_phone TEXT NOT NULL,
  wa_message_id TEXT,  -- ID from Gupshup API
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  
  -- Metadata
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bmsg_campaign ON broadcast_messages(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_bmsg_tenant ON broadcast_messages(tenant_id, recipient_phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bmsg_wa_id ON broadcast_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
