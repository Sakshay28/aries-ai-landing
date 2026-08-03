-- ═══════════════════════════════════════════════════════════
-- Add Shopify order/checkout trigger events to automations
-- ═══════════════════════════════════════════════════════════
-- Enables merchants to configure automations like:
--   "On order created → send order confirmation template"
--   "On order fulfilled → send tracking template"
--   "On order cancelled → apology + support handoff"
--   "On checkout abandoned → recovery template after N min"
--
-- The Shopify webhook dispatcher calls triggerAutomations()
-- with these event names. This migration keeps the existing
-- events (booking, escalation, payment, session-window) and
-- adds the Shopify set.

BEGIN;

ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_event_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_event_check
  CHECK (trigger_event IN (
    'booking_confirmed',
    'booking_reminder',
    'new_lead',
    'escalation_triggered',
    'escalation_resolved',
    'payment_received',
    'session_window_expiring',
    'shopify_order_created',
    'shopify_order_paid',
    'shopify_order_fulfilled',
    'shopify_order_cancelled',
    'shopify_checkout_abandoned'
  ));

COMMIT;
