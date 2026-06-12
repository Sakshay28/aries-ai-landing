-- ═══════════════════════════════════════════════════════════
-- Revenue features: review automation + birthday/anniversary
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── B1: Post-visit review automation ──────────────────────────
-- Track whether a review request was sent for a booking, plus
-- capture the response if the customer rates.
ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS review_request_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS review_request_sent_at TIMESTAMPTZ;
ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS review_rating SMALLINT;       -- 1-5 if captured
ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS review_text TEXT;

-- Index for the review cron: find yesterday's confirmed bookings not yet reviewed
CREATE INDEX IF NOT EXISTS idx_bookings_review_pending
  ON restaurant_bookings(restaurant_id, booking_date)
  WHERE review_request_sent = FALSE AND booking_status = 'confirmed';

-- Tenant's public Google review link (where 5-star reviews are directed)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS google_review_url TEXT;

-- Toggle for the review automation per tenant
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS review_automation_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- ── B3: Birthday & anniversary campaigns ──────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS anniversary_date DATE;
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS last_birthday_greeted_year SMALLINT;  -- prevents double-send

-- Index for the birthday cron (match month+day regardless of year)
CREATE INDEX IF NOT EXISTS idx_leads_birthday
  ON leads(tenant_id, birthday) WHERE birthday IS NOT NULL;

-- ── B2: Visit count for repeat-visitor recognition ────────────
-- Denormalised counter incremented on each confirmed booking.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS visit_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS last_visit_date DATE;

COMMIT;
