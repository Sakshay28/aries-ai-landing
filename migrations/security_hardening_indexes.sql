-- ═══════════════════════════════════════════════════════════
-- Security Hardening: Performance indexes for webhook hot paths
-- Run in Supabase Dashboard → SQL Editor
-- Safe to run multiple times (all use IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════

-- messages: covers the new tenant_id defence-in-depth filter added to the
-- AI context history fetch (conversation_id + tenant_id + latest-first).
-- The existing idx_msg_conversation (conversation_id, created_at ASC) covers
-- most cases since conversation_id is highly selective, but this composite
-- index makes the added .eq('tenant_id', ...) filter zero-cost.
CREATE INDEX IF NOT EXISTS idx_messages_conv_tenant_created
  ON messages(conversation_id, tenant_id, created_at DESC);

-- Confirm the leads + conversations indexes referenced by the webhook handler
-- exist (they are in schema.sql but may not have been applied to older Supabase
-- projects that were created before schema.sql was written).
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_phone
  ON leads(tenant_id, phone) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conv_active
  ON conversations(tenant_id, sender_id, channel, created_at DESC) WHERE is_active = true;

-- messages: fast lookup of recent messages per tenant (broadcast + analytics queries)
CREATE INDEX IF NOT EXISTS idx_msg_tenant_created
  ON messages(tenant_id, created_at DESC);
