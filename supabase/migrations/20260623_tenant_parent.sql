-- Link tenants in a parent-child relationship (e.g. holding company → brand).
-- The admin onboard panel reads/writes this to group tenants in the sidebar.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS parent_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tenants_parent_tenant_id_idx ON tenants (parent_tenant_id);
