-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: broadcast_campaigns.status CHECK constraint was missing several statuses
-- the application actually writes — most importantly 'cancelled' (Cancel button)
-- and 'launching' (scheduler CAS claim). Writes of a disallowed status fail with
-- Postgres 23514 and, where the error isn't checked, leave the campaign stuck
-- (e.g. Cancel aborts the queue but the card stays on 'sending').
--
-- This recreates the constraint to allow the complete set used in code
-- (src/app/dashboard/broadcast/types/index.ts CampaignStatus + 'launching').
--
-- Safe & idempotent: DROP IF EXISTS then ADD. The new set is a superset of every
-- status the app writes, so no existing row can violate it.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE broadcast_campaigns
  DROP CONSTRAINT IF EXISTS broadcast_campaigns_status_check;

ALTER TABLE broadcast_campaigns
  ADD CONSTRAINT broadcast_campaigns_status_check
  CHECK (status IN (
    'draft',
    'scheduled',
    'launching',
    'sending',
    'paused',
    'retrying',
    'completed',
    'failed',
    'cancelled',
    'archived'
  ));
