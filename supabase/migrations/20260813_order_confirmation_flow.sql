-- Migration: order_confirmation_flow
-- Adds the WhatsApp order-confirmation-request feature (Confirm/Cancel/Change
-- Details quick-reply buttons sent the instant a Shopify order is created).
-- Reusable per-tenant, opt-in — every tenant starts disabled so no existing
-- Shopify-connected tenant's behavior changes silently.
--
-- shopify_order_confirmation_message is an ops-editable override of the
-- platform-default template body (read only at provisioning time — there is
-- no self-serve live-editing UI yet since Meta template edits require
-- re-approval). See src/lib/shopify/templates.ts (shopifyTemplateSpecs,
-- provisionShopifyTemplates) and src/lib/shopify/notify.ts.
--
-- confirmation_sent_at doubles as an atomic send-claim (guards against the
-- Shopify sync queue retrying a whole webhook-processing job on any later
-- failure — see src/lib/shopify/queue.ts ShopifyWorker.failJob, up to 6
-- retries) and as the dashboard-visible "awaiting customer response" signal.

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS shopify_order_confirmation_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shopify_order_confirmation_message TEXT;

ALTER TABLE shopify_orders
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_status TEXT
    CHECK (confirmation_status IN ('pending', 'confirmed', 'cancel_requested', 'change_requested')),
  ADD COLUMN IF NOT EXISTS confirmation_responded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_shopify_orders_confirmation_status
  ON shopify_orders(tenant_id, confirmation_status)
  WHERE confirmation_status IS NOT NULL;

COMMIT;

-- Rollback:
-- BEGIN;
-- DROP INDEX IF EXISTS idx_shopify_orders_confirmation_status;
-- ALTER TABLE shopify_orders DROP COLUMN IF EXISTS confirmation_sent_at, DROP COLUMN IF EXISTS confirmation_status, DROP COLUMN IF EXISTS confirmation_responded_at;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS shopify_order_confirmation_enabled, DROP COLUMN IF EXISTS shopify_order_confirmation_message;
-- COMMIT;
