ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS service_disabled BOOLEAN DEFAULT false;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS service_disabled_message TEXT;

COMMENT ON COLUMN tenants.service_disabled IS 'When true, the webhook replies to every inbound message with service_disabled_message and skips the AI engine entirely. Unlike is_active=false, the tenant still resolves normally (staff alerts, dashboard, etc. keep working) — only the customer-facing AI reply is replaced.';
COMMENT ON COLUMN tenants.service_disabled_message IS 'Fixed text sent verbatim to every inbound customer message while service_disabled is true.';
