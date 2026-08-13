-- Migration: order_confirmation_copy_and_reminders
-- Follow-up to 20260813_order_confirmation_flow.sql. Adds:
--   1. tenants.shopify_order_confirmation_copy — per-tenant override text for
--      the 5 free-form (non-template) replies the order-confirmation flow
--      sends: confirm/cancel/change_request/change_received/change_reminder.
--      These are sent via plain sendTextMessage (not Meta templates — the
--      customer's button tap reopens the 24h session window), so they use
--      simple {{customer_name}}/{{order_id}} substitution, not Meta's
--      positional {{n}} format. See src/lib/shopify/orderConfirmationCopy.ts.
--   2. shopify_orders.change_details_reply — raw text of the customer's
--      reply after tapping "Change Details", for staff visibility.
--   3. shopify_orders.change_reminder_sent_at — guards the 1h reminder cron
--      (src/app/api/cron/shopify-order-confirmation-reminders) from sending
--      more than once per order.
--   4. 'details_received' added to confirmation_status — set once the
--      customer replies with updated details, which also stops the reminder
--      cron from matching that order (it only targets 'change_requested').

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS shopify_order_confirmation_copy JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE shopify_orders
  ADD COLUMN IF NOT EXISTS change_details_reply TEXT,
  ADD COLUMN IF NOT EXISTS change_reminder_sent_at TIMESTAMPTZ;

ALTER TABLE shopify_orders DROP CONSTRAINT IF EXISTS shopify_orders_confirmation_status_check;
ALTER TABLE shopify_orders ADD CONSTRAINT shopify_orders_confirmation_status_check
  CHECK (confirmation_status IN ('pending', 'confirmed', 'cancel_requested', 'change_requested', 'details_received'));

CREATE INDEX IF NOT EXISTS idx_shopify_orders_change_reminder_pending
  ON shopify_orders(tenant_id, confirmation_responded_at)
  WHERE confirmation_status = 'change_requested' AND change_reminder_sent_at IS NULL;

COMMIT;

-- Rollback:
-- BEGIN;
-- DROP INDEX IF EXISTS idx_shopify_orders_change_reminder_pending;
-- ALTER TABLE shopify_orders DROP CONSTRAINT IF EXISTS shopify_orders_confirmation_status_check;
-- ALTER TABLE shopify_orders ADD CONSTRAINT shopify_orders_confirmation_status_check
--   CHECK (confirmation_status IN ('pending', 'confirmed', 'cancel_requested', 'change_requested'));
-- ALTER TABLE shopify_orders DROP COLUMN IF EXISTS change_details_reply, DROP COLUMN IF EXISTS change_reminder_sent_at;
-- ALTER TABLE tenants DROP COLUMN IF EXISTS shopify_order_confirmation_copy;
-- COMMIT;
