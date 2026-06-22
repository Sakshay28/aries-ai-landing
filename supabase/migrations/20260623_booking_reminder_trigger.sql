-- ════════════════════════════════════════════════════════════
-- Migration: Add 'booking_reminder' automation trigger
-- Date: 2026-06-23
-- Pre-event reminders — scheduled a configurable lead time BEFORE
-- the reservation (vs all existing triggers which fire AFTER an event).
-- ════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_event_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_event_check
  CHECK (trigger_event IN (
    'booking_confirmed',
    'booking_reminder',
    'new_lead',
    'escalation_triggered',
    'escalation_resolved',
    'payment_received'
  ));

COMMIT;
