-- ═══════════════════════════════════════════════════════════
-- Hospitality OS v1 — booking source + internal notes
-- Run in Supabase SQL Editor (idempotent).
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- Booking source: how the reservation was made
ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'staff_manual';

-- Internal staff notes (not visible to guests)
ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- special_request (may already exist — safe with IF NOT EXISTS)
ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS special_request TEXT;

-- booking_hold_minutes on restaurant settings (may already exist)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS booking_hold_minutes INT NOT NULL DEFAULT 20;

COMMIT;

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'restaurant_bookings'
-- ORDER BY ordinal_position;
