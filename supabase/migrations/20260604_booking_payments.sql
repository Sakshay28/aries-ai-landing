-- ═══════════════════════════════════════════════════════════
-- Booking commitment fee (restaurant) — pay-to-confirm via WhatsApp
-- Run in Supabase SQL Editor (idempotent).
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ₹ per guest charged to confirm a booking. 0 = no prepayment (default).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS booking_fee_per_person INT NOT NULL DEFAULT 0;

-- Track the Razorpay payment link issued for each booking.
ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_id  TEXT;

CREATE INDEX IF NOT EXISTS idx_restaurant_bookings_paylink
  ON restaurant_bookings(payment_link_id);

-- Clock Tower: ₹10 per guest to confirm (adjust anytime via Restaurant settings).
UPDATE tenants
SET booking_fee_per_person = 10
WHERE business_name ILIKE '%clock tower%' AND booking_fee_per_person = 0;

COMMIT;

-- Verify: SELECT business_name, booking_fee_per_person FROM tenants;
