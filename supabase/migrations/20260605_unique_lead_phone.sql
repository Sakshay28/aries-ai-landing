-- ═══════════════════════════════════════════════════════════
-- Fix duplicate leads: add UNIQUE constraint on (tenant_id, phone)
-- so concurrent webhook calls can't create duplicate records for
-- the same WhatsApp number within a tenant.
-- ═══════════════════════════════════════════════════════════

-- Step 1: Delete exact duplicates — keep the oldest record per (tenant_id, phone)
DELETE FROM leads
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id, phone) id
  FROM leads
  WHERE phone IS NOT NULL
  ORDER BY tenant_id, phone, created_at ASC
)
AND phone IS NOT NULL;

-- Step 2: Add the unique constraint (safe now that dupes are removed)
ALTER TABLE leads
  ADD CONSTRAINT uq_leads_tenant_phone UNIQUE (tenant_id, phone);

-- Step 3: Rebuild the index to use the constraint (replaces the old non-unique one)
DROP INDEX IF EXISTS idx_leads_phone;
CREATE UNIQUE INDEX idx_leads_phone ON leads(tenant_id, phone) WHERE phone IS NOT NULL;
