-- ═══════════════════════════════════════════════════════════
-- Lead Assignment & Round-Robin Distribution
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Add assigned_to column to leads (FK to users)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;

-- Track round-robin counter per tenant (which agent gets the next lead)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lead_assignment_counter INT DEFAULT 0;

-- Index for fast assignment queries
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_assigned ON leads(tenant_id, assigned_to);
