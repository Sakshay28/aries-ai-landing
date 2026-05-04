-- ═══════════════════════════════════════════════════════════
-- 🗄️  Project Bolt — Multi-Tenant Database Schema
-- ═══════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor to set up the database.
-- Every table is tenant-scoped with Row-Level Security (RLS).
-- ═══════════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════
-- 1. TENANTS (Each client business)
-- ═══════════════════════════════════════
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Business Identity
  business_name TEXT NOT NULL,
  business_type TEXT DEFAULT 'Restaurant',
  business_phone TEXT,
  business_address TEXT,
  business_website TEXT,
  business_email TEXT,
  logo_url TEXT,
  
  -- Bot Configuration
  bot_name TEXT DEFAULT 'Assistant',
  bot_personality TEXT DEFAULT 'friendly and professional',
  welcome_message TEXT,
  welcome_offer TEXT,
  usps TEXT[] DEFAULT '{}',  -- Unique selling points array
  working_hours JSONB DEFAULT '{"mon-fri": "9:00-22:00", "sat-sun": "10:00-23:00"}',
  
  -- WhatsApp Cloud API Credentials (encrypted at app level)
  wa_phone_number_id TEXT,
  wa_access_token TEXT,
  wa_business_account_id TEXT,
  wa_app_secret TEXT,
  wa_verify_token TEXT DEFAULT encode(gen_random_bytes(16), 'hex'),
  wa_webhook_verified BOOLEAN DEFAULT false,
  wa_token_expired BOOLEAN DEFAULT false,
  
  -- Instagram Credentials
  ig_access_token TEXT,
  ig_page_id TEXT,
  
  -- Shopify Integration
  shopify_store_url TEXT,
  shopify_access_token TEXT,
  shopify_webhook_secret TEXT,
  
  -- Subscription & Billing
  plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'pro', 'enterprise')),
  plan_status TEXT DEFAULT 'active', -- active, past_due, cancelled, suspended
  razorpay_customer_id TEXT,
  razorpay_subscription_id TEXT,
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  
  -- Usage Tracking
  message_limit INTEGER DEFAULT 1000,
  messages_used_this_month INTEGER DEFAULT 0,
  ai_conversation_limit INTEGER DEFAULT 100,
  ai_conversations_this_month INTEGER DEFAULT 0,
  ai_tokens_used_this_month INTEGER DEFAULT 0,
  current_billing_period_start TIMESTAMPTZ DEFAULT NOW(),
  
  -- Staff Contacts
  staff_phone TEXT,
  staff_name TEXT,
  manager_phone TEXT,
  
  -- Follow-up Config
  followup_30min BOOLEAN DEFAULT true,
  followup_3hr BOOLEAN DEFAULT true,
  followup_24hr BOOLEAN DEFAULT true,
  followup_7day BOOLEAN DEFAULT false,
  escalation_timeout_mins INTEGER DEFAULT 30,
  
  -- Lead Scoring Keywords (overridable per tenant)
  hot_keywords TEXT[] DEFAULT ARRAY['today', 'tonight', 'now', 'asap', 'urgent', 'book', 'reserve', 'confirm'],
  warm_keywords TEXT[] DEFAULT ARRAY['interested', 'looking', 'when', 'available', 'weekend', 'plan', 'thinking'],
  
  -- Custom FAQs (Fix #7: tenant-specific Q&A for AI)
  custom_faqs JSONB DEFAULT '[]',  -- Array of {question, answer} objects
  
  -- Off-Hours Config (Fix #8)
  off_hours_message TEXT,
  off_hours_capture_lead BOOLEAN DEFAULT true,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for webhook routing (critical path)
CREATE UNIQUE INDEX idx_tenants_wa_phone ON tenants(wa_phone_number_id) WHERE wa_phone_number_id IS NOT NULL;
CREATE INDEX idx_tenants_active ON tenants(is_active);
CREATE INDEX idx_tenants_plan ON tenants(plan);

-- ═══════════════════════════════════════
-- 2. USERS (People who log into dashboards)
-- ═══════════════════════════════════════
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Auth (linked to Supabase Auth)
  auth_id UUID UNIQUE,  -- Supabase auth.users.id
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  
  -- Role
  role TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'staff', 'viewer')),
  
  -- Platform admin (us, not clients)
  is_platform_admin BOOLEAN DEFAULT false,
  
  -- Metadata
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE UNIQUE INDEX idx_users_auth ON users(auth_id) WHERE auth_id IS NOT NULL;
CREATE INDEX idx_users_email ON users(email);

-- ═══════════════════════════════════════
-- 3. LEADS (Customer contacts per tenant)
-- ═══════════════════════════════════════
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Contact Info
  name TEXT,
  phone TEXT,
  email TEXT,
  
  -- Source
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram_dm', 'instagram_comment', 'shopify', 'website', 'manual')),
  source_detail TEXT,  -- e.g., "Click-to-WhatsApp ad", "Instagram post #123"
  
  -- Qualification
  enquiry_type TEXT,
  guest_count TEXT,
  date_requested TEXT,
  occasion TEXT,
  lead_status TEXT DEFAULT 'new' CHECK (lead_status IN ('new', 'hot', 'warm', 'cold', 'converted', 'lost')),
  lead_score INTEGER DEFAULT 0,
  
  -- Assignment
  staff_assigned TEXT,
  notes TEXT,
  
  -- Shopify
  shopify_customer_id TEXT,
  total_order_value DECIMAL(10,2) DEFAULT 0,
  
  -- Metadata
  first_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_tenant ON leads(tenant_id);
CREATE INDEX idx_leads_tenant_status ON leads(tenant_id, lead_status);
CREATE INDEX idx_leads_tenant_channel ON leads(tenant_id, channel);
CREATE INDEX idx_leads_phone ON leads(tenant_id, phone);
CREATE INDEX idx_leads_created ON leads(tenant_id, created_at DESC);

-- ═══════════════════════════════════════
-- 4. CONVERSATIONS (Chat sessions)
-- ═══════════════════════════════════════
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Identifiers
  channel TEXT NOT NULL,
  sender_id TEXT NOT NULL,     -- WhatsApp phone or IG user ID
  sender_name TEXT,
  
  -- State Machine
  current_step TEXT DEFAULT 'greeting',
  flow_type TEXT,
  context JSONB DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  bot_paused BOOLEAN DEFAULT false,
  escalated BOOLEAN DEFAULT false,
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT,
  
  -- AI
  ai_model_used TEXT DEFAULT 'gemini-2.0-flash',
  ai_tokens_used INTEGER DEFAULT 0,
  
  -- Metadata
  message_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conv_tenant ON conversations(tenant_id);
CREATE INDEX idx_conv_active ON conversations(tenant_id, sender_id, channel, created_at DESC) WHERE is_active = true;
CREATE INDEX idx_conv_lead ON conversations(lead_id);
CREATE INDEX idx_conv_created ON conversations(tenant_id, created_at DESC);

-- ═══════════════════════════════════════
-- 5. MESSAGES (Individual chat messages)
-- ═══════════════════════════════════════
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Content
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'interactive', 'template', 'image', 'video', 'audio', 'document', 'location', 'reaction')),
  
  -- WhatsApp Metadata
  wa_message_id TEXT,        -- Meta's message ID
  channel TEXT NOT NULL,
  sender_id TEXT,
  
  -- Delivery Status
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  error_message TEXT,
  
  -- AI
  ai_generated BOOLEAN DEFAULT false,
  ai_latency_ms INTEGER,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_messages_wa_message_id ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX idx_msg_tenant ON messages(tenant_id);
CREATE INDEX idx_msg_conversation ON messages(conversation_id, created_at ASC);
CREATE INDEX idx_msg_conv_direction ON messages(conversation_id, created_at ASC) WHERE direction = 'inbound';
CREATE INDEX idx_msg_tenant_created ON messages(tenant_id, created_at DESC);

-- ═══════════════════════════════════════
-- 6. FOLLOW-UPS (Scheduled messages)
-- ═══════════════════════════════════════
CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  
  -- Schedule
  follow_up_type TEXT NOT NULL CHECK (follow_up_type IN ('30min', '3hr', '24hr', '7day', 'custom')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  
  -- Content
  message TEXT,
  ai_generated BOOLEAN DEFAULT false,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_followup_pending ON follow_ups(scheduled_at, status) WHERE status = 'pending';
CREATE INDEX idx_followup_tenant_pending ON follow_ups(tenant_id, scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_followup_tenant ON follow_ups(tenant_id);
CREATE INDEX idx_followup_lead ON follow_ups(lead_id);

-- ═══════════════════════════════════════
-- 7. BOOKINGS (Table reservations, events)
-- ═══════════════════════════════════════
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Booking Details
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  booking_date DATE,
  booking_time TIME,
  guest_count TEXT,
  occasion TEXT,
  special_requests TEXT,
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  staff_assigned TEXT,
  confirmed_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_booking_tenant ON bookings(tenant_id);
CREATE INDEX idx_booking_date ON bookings(tenant_id, booking_date);
CREATE INDEX idx_booking_status ON bookings(tenant_id, status);

-- ═══════════════════════════════════════
-- 8. SHOPIFY EVENTS (Order/Cart tracking)
-- ═══════════════════════════════════════
CREATE TABLE shopify_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  
  -- Event
  event_type TEXT NOT NULL CHECK (event_type IN ('order_created', 'order_fulfilled', 'order_cancelled', 'cart_abandoned', 'checkout_started')),
  shopify_order_id TEXT,
  order_value DECIMAL(10,2),
  currency TEXT DEFAULT 'INR',
  
  -- Cart Recovery
  cart_recovery_sent BOOLEAN DEFAULT false,
  cart_recovered BOOLEAN DEFAULT false,
  
  -- Raw Data
  payload JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shopify_tenant ON shopify_events(tenant_id);
CREATE INDEX idx_shopify_order ON shopify_events(shopify_order_id);

-- ═══════════════════════════════════════
-- 9. ANALYTICS EVENTS (Everything tracked)
-- ═══════════════════════════════════════
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Event
  event_type TEXT NOT NULL,
  channel TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_tenant ON analytics_events(tenant_id);
CREATE INDEX idx_analytics_type ON analytics_events(tenant_id, event_type);
CREATE INDEX idx_analytics_created ON analytics_events(tenant_id, created_at DESC);
CREATE INDEX idx_analytics_tenant_type_created ON analytics_events(tenant_id, event_type, created_at DESC);

-- ═══════════════════════════════════════
-- 10. PLATFORM STATS (Global admin metrics)
-- ═══════════════════════════════════════
CREATE TABLE platform_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_tenants INTEGER DEFAULT 0,
  active_tenants INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  total_leads INTEGER DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0, -- Stored in Rupees (INR), NOT paise
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(stat_date)
);

-- ═══════════════════════════════════════
-- 10.5 AUDIT LOGS (Compliance)
-- ═══════════════════════════════════════
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
-- 11. AUTO-UPDATE TIMESTAMPS
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_tenants_updated BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_leads_updated BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_bookings_updated BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════
-- 12. ROW-LEVEL SECURITY (Tenant Isolation)
-- ═══════════════════════════════════════
-- This ensures Client A can NEVER see Client B's data,
-- even if there's a bug in the application code.

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (for webhooks and admin)
-- Client-side queries go through RLS automatically

-- Users can only see their own tenant's data
CREATE POLICY "Users see own tenant" ON users
  FOR ALL USING (
    auth.uid() = auth_id
    OR tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Leads scoped to tenant
CREATE POLICY "Leads scoped to tenant" ON leads
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Conversations scoped to tenant
CREATE POLICY "Conversations scoped to tenant" ON conversations
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Messages scoped to tenant
CREATE POLICY "Messages scoped to tenant" ON messages
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Follow-ups scoped to tenant
CREATE POLICY "Follow-ups scoped to tenant" ON follow_ups
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Bookings scoped to tenant
CREATE POLICY "Bookings scoped to tenant" ON bookings
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Shopify events scoped to tenant
CREATE POLICY "Shopify events scoped to tenant" ON shopify_events
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Analytics scoped to tenant
CREATE POLICY "Analytics scoped to tenant" ON analytics_events
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- Tenants: users can see their own tenant
CREATE POLICY "Tenant owners see own tenant" ON tenants
  FOR ALL USING (
    id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
  );

-- ═══════════════════════════════════════
-- 13. HELPER FUNCTIONS
-- ═══════════════════════════════════════

-- Get tenant ID for current authenticated user
CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Increment message counter for a tenant
CREATE OR REPLACE FUNCTION increment_message_count(t_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET messages_used_this_month = messages_used_this_month + 1
  WHERE id = t_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_message_count(t_id UUID, count INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET messages_used_this_month = GREATEST(messages_used_this_month, count)
  WHERE id = t_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_ai_tokens(t_id UUID, token_count INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET ai_tokens_used_this_month = ai_tokens_used_this_month + token_count
  WHERE id = t_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_ai_conversations(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET ai_conversations_this_month = ai_conversations_this_month + 1
  WHERE id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset monthly counters (run via cron on 1st of each month).
-- Note: voice_calls_used_this_month is reset here only if the column exists
-- (added by voice-agent/supabase_voice_migration.sql). The DO-block safely
-- no-ops when voice features are not yet installed.
CREATE OR REPLACE FUNCTION reset_monthly_counters()
RETURNS void AS $$
BEGIN
  UPDATE tenants
  SET messages_used_this_month = 0,
      ai_conversations_this_month = 0,
      current_billing_period_start = NOW(),
      updated_at = NOW()
  WHERE is_active = true;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'voice_calls_used_this_month'
  ) THEN
    EXECUTE 'UPDATE tenants SET voice_calls_used_this_month = 0 WHERE is_active = true';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Plan counts aggregate — used by admin MRR dashboard (avoids full table scan)
CREATE OR REPLACE FUNCTION get_plan_counts()
RETURNS TABLE(plan TEXT, count BIGINT) AS $$
  SELECT plan, COUNT(*) as count
  FROM tenants
  WHERE is_active = true
  GROUP BY plan;
$$ LANGUAGE sql SECURITY DEFINER;
