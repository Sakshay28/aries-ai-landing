-- Creates columns that the dashboard layout depends on but were never
-- formally migrated. Without these, the layout query errors silently
-- and the admin + restaurant sidebar sections disappear.

-- Platform admin flag on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN DEFAULT false;

-- Business type on tenants (used for sidebar restaurant section gating)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT '';

-- Custom monthly price per tenant (overrides plan-based pricing in admin dashboard)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS monthly_price INTEGER DEFAULT NULL;
