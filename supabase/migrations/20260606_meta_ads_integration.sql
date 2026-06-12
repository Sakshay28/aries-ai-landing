-- ═══════════════════════════════════════════════════════════════════
-- META ADS + CLICK-TO-WHATSAPP INTEGRATION — Production Schema
-- ═══════════════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor.
-- All tables use tenant_id + RLS via get_current_tenant_id().
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────
-- 1. meta_connections
-- Stores the Facebook/Meta OAuth connection per tenant.
-- One row per tenant — their connected FB user, business manager,
-- encrypted long-lived token, and connection health.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fb_user_id    TEXT NOT NULL,
  fb_user_name  TEXT,
  business_id   TEXT,
  business_name TEXT,
  access_token  TEXT NOT NULL,  -- AES-256-GCM encrypted
  token_expires_at TIMESTAMPTZ,
  scopes        TEXT[] DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'connected'
                CHECK (status IN ('connected', 'disconnected', 'needs_reauth', 'error')),
  last_refreshed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id)
);

CREATE INDEX idx_meta_connections_tenant ON meta_connections(tenant_id);
CREATE INDEX idx_meta_connections_status ON meta_connections(status);

ALTER TABLE meta_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_connections_tenant_isolation ON meta_connections
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 2. meta_ad_accounts
-- Ad accounts connected to the tenant's Meta connection.
-- A single FB Business Manager can have multiple ad accounts.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id   UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  account_id      TEXT NOT NULL,  -- Meta ad account ID (act_XXXXX)
  account_name    TEXT,
  currency        TEXT DEFAULT 'INR',
  timezone        TEXT DEFAULT 'Asia/Kolkata',
  account_status  INT DEFAULT 1,  -- 1=ACTIVE, 2=DISABLED, 3=UNSETTLED
  is_selected     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, account_id)
);

CREATE INDEX idx_meta_ad_accounts_tenant ON meta_ad_accounts(tenant_id);
CREATE INDEX idx_meta_ad_accounts_connection ON meta_ad_accounts(connection_id);

ALTER TABLE meta_ad_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_ad_accounts_tenant_isolation ON meta_ad_accounts
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 3. meta_pages
-- Facebook Pages connected to the tenant.
-- Required for Click-to-WhatsApp ads.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_pages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  page_id       TEXT NOT NULL,
  page_name     TEXT,
  page_token    TEXT,  -- Encrypted page access token
  instagram_id  TEXT,  -- Linked Instagram Business Account ID
  is_selected   BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, page_id)
);

CREATE INDEX idx_meta_pages_tenant ON meta_pages(tenant_id);

ALTER TABLE meta_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_pages_tenant_isolation ON meta_pages
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 4. meta_whatsapp_numbers
-- WhatsApp Business numbers available to the tenant.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_whatsapp_numbers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id     UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  waba_id           TEXT NOT NULL,   -- WhatsApp Business Account ID
  phone_number_id   TEXT NOT NULL,   -- Meta phone number ID
  display_phone     TEXT,            -- Human-readable phone
  verified_name     TEXT,
  quality_rating    TEXT,
  is_selected       BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, phone_number_id)
);

CREATE INDEX idx_meta_wa_numbers_tenant ON meta_whatsapp_numbers(tenant_id);

ALTER TABLE meta_whatsapp_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_wa_numbers_tenant_isolation ON meta_whatsapp_numbers
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 5. meta_campaigns
-- Click-to-WhatsApp (and other) campaigns created through Aries AI.
-- Mirrors Meta's campaign object with Aries-specific metadata.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ad_account_id     UUID NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  meta_campaign_id  TEXT,  -- Meta's campaign ID (set after publish)
  name              TEXT NOT NULL,
  objective         TEXT NOT NULL DEFAULT 'MESSAGES'
                    CHECK (objective IN ('MESSAGES', 'LEADS', 'AWARENESS', 'TRAFFIC')),
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'pending_review', 'active', 'paused', 'completed', 'rejected', 'error', 'archived')),
  budget_type       TEXT NOT NULL DEFAULT 'daily'
                    CHECK (budget_type IN ('daily', 'lifetime')),
  budget_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency          TEXT DEFAULT 'INR',
  start_date        DATE,
  end_date          DATE,
  whatsapp_number_id UUID REFERENCES meta_whatsapp_numbers(id),
  page_id           UUID REFERENCES meta_pages(id),
  targeting         JSONB DEFAULT '{}',  -- Location, age, gender, interests, etc.
  total_spend       NUMERIC(12,2) DEFAULT 0,
  total_impressions BIGINT DEFAULT 0,
  total_clicks      BIGINT DEFAULT 0,
  total_leads       INT DEFAULT 0,
  total_conversations INT DEFAULT 0,
  total_bookings    INT DEFAULT 0,
  meta_error        TEXT,
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_campaigns_tenant ON meta_campaigns(tenant_id);
CREATE INDEX idx_meta_campaigns_status ON meta_campaigns(tenant_id, status);
CREATE INDEX idx_meta_campaigns_meta_id ON meta_campaigns(meta_campaign_id) WHERE meta_campaign_id IS NOT NULL;
CREATE INDEX idx_meta_campaigns_created ON meta_campaigns(tenant_id, created_at DESC);

ALTER TABLE meta_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_campaigns_tenant_isolation ON meta_campaigns
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 6. meta_adsets
-- Ad sets within a campaign. Contains targeting + budget allocation.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_adsets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id     UUID NOT NULL REFERENCES meta_campaigns(id) ON DELETE CASCADE,
  meta_adset_id   TEXT,  -- Meta's adset ID
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'active', 'paused', 'completed', 'error')),
  targeting       JSONB DEFAULT '{}',
  budget_amount   NUMERIC(12,2) DEFAULT 0,
  bid_strategy    TEXT DEFAULT 'LOWEST_COST_WITHOUT_CAP',
  optimization_goal TEXT DEFAULT 'CONVERSATIONS',
  total_spend     NUMERIC(12,2) DEFAULT 0,
  total_impressions BIGINT DEFAULT 0,
  total_clicks    BIGINT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_adsets_tenant ON meta_adsets(tenant_id);
CREATE INDEX idx_meta_adsets_campaign ON meta_adsets(campaign_id);

ALTER TABLE meta_adsets ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_adsets_tenant_isolation ON meta_adsets
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 7. meta_ads
-- Individual ads within an ad set. Contains creative content.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_ads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  adset_id      UUID NOT NULL REFERENCES meta_adsets(id) ON DELETE CASCADE,
  campaign_id   UUID NOT NULL REFERENCES meta_campaigns(id) ON DELETE CASCADE,
  meta_ad_id    TEXT,  -- Meta's ad ID
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'paused', 'completed', 'rejected', 'error')),
  creative      JSONB DEFAULT '{}',  -- primary_text, headline, description, cta, media_urls
  total_spend   NUMERIC(12,2) DEFAULT 0,
  total_impressions BIGINT DEFAULT 0,
  total_clicks  BIGINT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_ads_tenant ON meta_ads(tenant_id);
CREATE INDEX idx_meta_ads_adset ON meta_ads(adset_id);
CREATE INDEX idx_meta_ads_campaign ON meta_ads(campaign_id);
CREATE INDEX idx_meta_ads_meta_id ON meta_ads(meta_ad_id) WHERE meta_ad_id IS NOT NULL;

ALTER TABLE meta_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_ads_tenant_isolation ON meta_ads
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 8. campaign_leads
-- Every lead that enters through a Meta ad (Click-to-WhatsApp or Lead Gen).
-- Links to the contacts/leads tables for CRM integration.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id     UUID REFERENCES meta_campaigns(id) ON DELETE SET NULL,
  adset_id        UUID REFERENCES meta_adsets(id) ON DELETE SET NULL,
  ad_id           UUID REFERENCES meta_ads(id) ON DELETE SET NULL,
  meta_campaign_id TEXT,
  meta_adset_id   TEXT,
  meta_ad_id      TEXT,
  lead_id         UUID,  -- FK to leads table
  contact_id      UUID,  -- FK to contacts table
  phone           TEXT NOT NULL,
  name            TEXT,
  email           TEXT,
  source          TEXT NOT NULL DEFAULT 'ctwa'
                  CHECK (source IN ('ctwa', 'lead_form', 'sponsored_message', 'manual')),
  ctwa_clid       TEXT,  -- Click-to-WhatsApp click ID
  referral_headline TEXT,
  referral_body   TEXT,
  referral_source_url TEXT,
  referral_source_type TEXT,
  conversation_started BOOLEAN DEFAULT false,
  booking_made    BOOLEAN DEFAULT false,
  revenue         NUMERIC(12,2) DEFAULT 0,
  status          TEXT DEFAULT 'new'
                  CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_leads_tenant ON campaign_leads(tenant_id);
CREATE INDEX idx_campaign_leads_campaign ON campaign_leads(campaign_id);
CREATE INDEX idx_campaign_leads_phone ON campaign_leads(tenant_id, phone);
CREATE INDEX idx_campaign_leads_created ON campaign_leads(tenant_id, created_at DESC);
CREATE INDEX idx_campaign_leads_meta_campaign ON campaign_leads(meta_campaign_id) WHERE meta_campaign_id IS NOT NULL;
CREATE INDEX idx_campaign_leads_ctwa ON campaign_leads(ctwa_clid) WHERE ctwa_clid IS NOT NULL;

ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaign_leads_tenant_isolation ON campaign_leads
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 9. lead_attribution
-- Timeline of events for each campaign lead.
-- Tracks the journey: ad_viewed → ad_clicked → whatsapp_opened → message_sent → booked
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_attribution (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_lead_id UUID NOT NULL REFERENCES campaign_leads(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL
                  CHECK (event_type IN (
                    'ad_impression', 'ad_click', 'whatsapp_open',
                    'message_sent', 'message_received', 'ai_response',
                    'booking_started', 'booking_confirmed', 'payment_made',
                    'lead_qualified', 'lead_converted', 'custom'
                  )),
  event_data      JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_attribution_tenant ON lead_attribution(tenant_id);
CREATE INDEX idx_lead_attribution_lead ON lead_attribution(campaign_lead_id);
CREATE INDEX idx_lead_attribution_created ON lead_attribution(tenant_id, created_at DESC);

ALTER TABLE lead_attribution ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_attribution_tenant_isolation ON lead_attribution
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 10. campaign_analytics
-- Daily aggregated metrics per campaign.
-- Updated by cron or webhook handler using atomic increments.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_analytics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id     UUID NOT NULL REFERENCES meta_campaigns(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  impressions     BIGINT DEFAULT 0,
  clicks          BIGINT DEFAULT 0,
  spend           NUMERIC(12,2) DEFAULT 0,
  leads           INT DEFAULT 0,
  conversations   INT DEFAULT 0,
  bookings        INT DEFAULT 0,
  revenue         NUMERIC(12,2) DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, campaign_id, date)
);

CREATE INDEX idx_campaign_analytics_tenant ON campaign_analytics(tenant_id);
CREATE INDEX idx_campaign_analytics_campaign_date ON campaign_analytics(campaign_id, date DESC);

ALTER TABLE campaign_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaign_analytics_tenant_isolation ON campaign_analytics
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 11. campaign_spend_logs
-- Granular spend tracking — every charge or budget update event.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_spend_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id   UUID NOT NULL REFERENCES meta_campaigns(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL,
  currency      TEXT DEFAULT 'INR',
  event_type    TEXT NOT NULL DEFAULT 'spend'
                CHECK (event_type IN ('spend', 'budget_increase', 'budget_decrease', 'refund')),
  meta_data     JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_spend_logs_tenant ON campaign_spend_logs(tenant_id);
CREATE INDEX idx_campaign_spend_logs_campaign ON campaign_spend_logs(campaign_id, created_at DESC);

ALTER TABLE campaign_spend_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaign_spend_logs_tenant_isolation ON campaign_spend_logs
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 12. meta_ads_notifications
-- Notification center for Meta Ads events.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meta_ads_notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type          TEXT NOT NULL
                CHECK (type IN ('new_lead', 'new_booking', 'high_spend', 'campaign_paused',
                                'campaign_rejected', 'budget_alert', 'token_expiring', 'general')),
  title         TEXT NOT NULL,
  message       TEXT,
  campaign_id   UUID REFERENCES meta_campaigns(id) ON DELETE SET NULL,
  is_read       BOOLEAN DEFAULT false,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_meta_notifications_tenant ON meta_ads_notifications(tenant_id, is_read, created_at DESC);

ALTER TABLE meta_ads_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_notifications_tenant_isolation ON meta_ads_notifications
  FOR ALL USING (tenant_id = get_current_tenant_id());

-- ───────────────────────────────────────────
-- 13. Atomic increment function for campaign analytics
-- ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_campaign_analytics(
  p_tenant_id UUID,
  p_campaign_id UUID,
  p_date DATE,
  p_column TEXT,
  p_amount NUMERIC DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO campaign_analytics (tenant_id, campaign_id, date)
  VALUES (p_tenant_id, p_campaign_id, p_date)
  ON CONFLICT (tenant_id, campaign_id, date) DO NOTHING;

  EXECUTE format(
    'UPDATE campaign_analytics SET %I = %I + $1, updated_at = now()
     WHERE tenant_id = $2 AND campaign_id = $3 AND date = $4',
    p_column, p_column
  ) USING p_amount, p_tenant_id, p_campaign_id, p_date;
END;
$$;

-- ───────────────────────────────────────────
-- 14. Updated_at trigger function (reuse if exists)
-- ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trg_meta_connections_updated BEFORE UPDATE ON meta_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_meta_ad_accounts_updated BEFORE UPDATE ON meta_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_meta_pages_updated BEFORE UPDATE ON meta_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_meta_wa_numbers_updated BEFORE UPDATE ON meta_whatsapp_numbers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_meta_campaigns_updated BEFORE UPDATE ON meta_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_meta_adsets_updated BEFORE UPDATE ON meta_adsets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_meta_ads_updated BEFORE UPDATE ON meta_ads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_campaign_leads_updated BEFORE UPDATE ON campaign_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_campaign_analytics_updated BEFORE UPDATE ON campaign_analytics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
