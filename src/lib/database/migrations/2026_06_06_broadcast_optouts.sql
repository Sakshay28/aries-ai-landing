-- ═══════════════════════════════════════════════════════════
-- Broadcast opt-out registry
-- Fast O(1) phone-level lookup — no need to scan lead tags.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS broadcast_optouts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,          -- E.164 digits only, e.g. "919876543210"
  source      TEXT DEFAULT 'stop_keyword', -- 'stop_keyword' | 'manual' | 'api'
  opted_out_at TIMESTAMPTZ DEFAULT NOW(),
  opted_back_in_at TIMESTAMPTZ,       -- set when user sends START
  is_active   BOOLEAN DEFAULT TRUE,   -- FALSE once opted back in

  CONSTRAINT uq_optout_tenant_phone UNIQUE (tenant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_optouts_tenant_phone
  ON broadcast_optouts(tenant_id, phone) WHERE is_active = TRUE;

-- RLS: scoped to tenant
ALTER TABLE broadcast_optouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Broadcast optouts scoped to tenant" ON broadcast_optouts
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());
