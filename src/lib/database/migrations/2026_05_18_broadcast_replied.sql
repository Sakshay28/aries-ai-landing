-- Migration: Broadcast replied_count
-- Adds replied_count to broadcast_campaigns (if not already present).

BEGIN;

ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS replied_count INT NOT NULL DEFAULT 0;

COMMIT;
