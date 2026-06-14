-- ═══════════════════════════════════════════════════════════
-- 🧠 Guest Memory + Google Review Pump — Migration
-- ═══════════════════════════════════════════════════════════
-- 1. Enriches restaurant_guests with visit history
-- 2. Adds freed_at + review tracking to restaurant_tables
-- 3. Adds google_review_url to tenants
-- Safe to run on existing database (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

-- ── Step 1: Enrich restaurant_guests with memory fields ─────────────────────

ALTER TABLE restaurant_guests
  ADD COLUMN IF NOT EXISTS visit_count      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_visit_date  DATE,
  ADD COLUMN IF NOT EXISTS first_visit_date DATE,
  ADD COLUMN IF NOT EXISTS preferences      TEXT,
  ADD COLUMN IF NOT EXISTS avg_spend        INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS birthday         DATE;

-- ── Step 2: Add freed_at + review tracking to restaurant_tables ─────────────

ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS freed_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_guest_phone        VARCHAR,
  ADD COLUMN IF NOT EXISTS last_guest_name         VARCHAR,
  ADD COLUMN IF NOT EXISTS review_request_sent_at  TIMESTAMPTZ;

-- Index for the review cron: find tables freed ~30 min ago where review not yet sent
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_review_pending
  ON restaurant_tables(restaurant_id, freed_at)
  WHERE freed_at IS NOT NULL AND review_request_sent_at IS NULL;

-- ── Step 3: Add google_review_url to tenants ────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS google_review_url VARCHAR;

-- ── Step 4: Track review requests sent ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_review_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_phone   VARCHAR NOT NULL,
  customer_name    VARCHAR,
  table_name       VARCHAR,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_on          DATE NOT NULL DEFAULT CURRENT_DATE,
  booking_id       UUID REFERENCES restaurant_bookings(id) ON DELETE SET NULL,
  -- One review request per customer per day (no double-messaging)
  UNIQUE(restaurant_id, customer_phone, sent_on)
);

CREATE INDEX IF NOT EXISTS idx_review_requests_tenant_date
  ON restaurant_review_requests(restaurant_id, sent_at);

ALTER TABLE restaurant_review_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Review requests scoped to tenant" ON restaurant_review_requests
    FOR ALL USING (restaurant_id = public.get_current_tenant_id())
    WITH CHECK (restaurant_id = public.get_current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Step 5: Update free_table RPC to record freed_at + last guest ───────────

CREATE OR REPLACE FUNCTION free_table(
  p_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table restaurant_tables%ROWTYPE;
BEGIN
  -- Capture current guest info before clearing
  SELECT * INTO v_table FROM restaurant_tables WHERE id = p_table_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'table_not_found');
  END IF;

  UPDATE restaurant_tables SET
    status                = 'available',
    current_booking_id    = NULL,
    guest_name            = NULL,
    guest_phone           = NULL,
    guest_count           = NULL,
    reservation_time      = NULL,
    notes                 = NULL,
    seated_at             = NULL,
    reserved_at           = NULL,
    freed_at              = NOW(),
    last_guest_phone      = v_table.guest_phone,
    last_guest_name       = v_table.guest_name,
    review_request_sent_at = NULL
  WHERE id = p_table_id;

  -- Increment visit count for this guest
  IF v_table.guest_phone IS NOT NULL AND v_table.restaurant_id IS NOT NULL THEN
    INSERT INTO restaurant_guests (restaurant_id, customer_phone, customer_name, visit_count, last_visit_date, first_visit_date)
    VALUES (v_table.restaurant_id, v_table.guest_phone, v_table.guest_name, 1, CURRENT_DATE, CURRENT_DATE)
    ON CONFLICT (restaurant_id, customer_phone)
    DO UPDATE SET
      visit_count     = restaurant_guests.visit_count + 1,
      last_visit_date = CURRENT_DATE,
      first_visit_date = COALESCE(restaurant_guests.first_visit_date, CURRENT_DATE),
      customer_name   = COALESCE(EXCLUDED.customer_name, restaurant_guests.customer_name);
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'last_guest_phone', v_table.guest_phone,
    'last_guest_name',  v_table.guest_name
  );
END;
$$;

REVOKE ALL ON FUNCTION free_table FROM PUBLIC;
GRANT EXECUTE ON FUNCTION free_table TO service_role;
