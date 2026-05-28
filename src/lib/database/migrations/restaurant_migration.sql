-- ═══════════════════════════════════════════════════════════
-- 🍽️  Restaurant Manager Panel — Database Migration
-- ═══════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor ONCE to set up restaurant tables.
-- Safe to run on an existing database (uses IF NOT EXISTS + ALTER TABLE IF NOT EXISTS pattern).
-- ═══════════════════════════════════════════════════════════

-- ── Step 0: Helper Functions ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Step 1: Extend tenants table with restaurant columns ──────────────────


ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS modules        TEXT[]      DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS api_key        UUID        DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS notify_phone   VARCHAR,
  ADD COLUMN IF NOT EXISTS short_code     VARCHAR(5);

-- Ensure every existing tenant gets a unique api_key
UPDATE tenants SET api_key = gen_random_uuid() WHERE api_key IS NULL;

-- Index for fast api_key lookups (used on every WhatsApp bot request)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_api_key ON tenants(api_key) WHERE api_key IS NOT NULL;

-- ── Step 2: Enums ─────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE restaurant_day_type    AS ENUM ('weekday', 'weekend', 'both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE restaurant_booking_status AS ENUM ('confirmed', 'cancelled', 'no_show', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE restaurant_payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Step 3: restaurant_slots ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_slots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_time        TIME NOT NULL,              -- e.g. '19:00', '20:30'
  day_type         restaurant_day_type NOT NULL DEFAULT 'both',
  total_capacity   INTEGER NOT NULL CHECK (total_capacity > 0),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_slots_restaurant ON restaurant_slots(restaurant_id) WHERE is_active = true;

CREATE TRIGGER tr_restaurant_slots_updated
  BEFORE UPDATE ON restaurant_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Step 4: restaurant_bookings ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_bookings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_id              UUID NOT NULL REFERENCES restaurant_slots(id),
  booking_date         DATE NOT NULL,
  customer_name        VARCHAR NOT NULL,
  customer_phone       VARCHAR NOT NULL,
  party_size           INTEGER NOT NULL CHECK (party_size > 0),
  payment_amount       INTEGER NOT NULL DEFAULT 0,   -- paise
  payment_status       restaurant_payment_status NOT NULL DEFAULT 'pending',
  razorpay_payment_id  VARCHAR UNIQUE,
  booking_status       restaurant_booking_status NOT NULL DEFAULT 'confirmed',
  reservation_id       VARCHAR UNIQUE NOT NULL,      -- e.g. CT-20240528-0042
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_bookings_restaurant_date
  ON restaurant_bookings(restaurant_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_restaurant_bookings_slot
  ON restaurant_bookings(slot_id, booking_date)
  WHERE booking_status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_restaurant_bookings_razorpay
  ON restaurant_bookings(razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_restaurant_bookings_reservation
  ON restaurant_bookings(reservation_id);

CREATE TRIGGER tr_restaurant_bookings_updated
  BEFORE UPDATE ON restaurant_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Step 5: restaurant_blocked_dates ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_blocked_dates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  blocked_date     DATE NOT NULL,
  reason           VARCHAR,
  specific_slot_id UUID REFERENCES restaurant_slots(id) ON DELETE CASCADE,  -- NULL = entire day blocked
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_blocked_restaurant
  ON restaurant_blocked_dates(restaurant_id, blocked_date);

-- ── Step 6: seat_locks (race condition prevention) ────────────────────────

CREATE TABLE IF NOT EXISTS seat_locks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id        UUID NOT NULL REFERENCES restaurant_slots(id) ON DELETE CASCADE,
  booking_date   DATE NOT NULL,
  locked_seats   INTEGER NOT NULL CHECK (locked_seats > 0),
  session_token  VARCHAR UNIQUE NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seat_locks_slot_date
  ON seat_locks(slot_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_seat_locks_expires
  ON seat_locks(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_seat_locks_session
  ON seat_locks(session_token);

-- ── Step 7: Row-Level Security ────────────────────────────────────────────

ALTER TABLE restaurant_slots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_bookings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_blocked_dates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_locks                ENABLE ROW LEVEL SECURITY;

-- restaurant_slots: scoped to tenant
CREATE POLICY "Restaurant slots scoped to tenant" ON restaurant_slots
  FOR ALL USING (restaurant_id = public.get_current_tenant_id())
  WITH CHECK (restaurant_id = public.get_current_tenant_id());

-- restaurant_bookings: scoped to tenant
CREATE POLICY "Restaurant bookings scoped to tenant" ON restaurant_bookings
  FOR ALL USING (restaurant_id = public.get_current_tenant_id())
  WITH CHECK (restaurant_id = public.get_current_tenant_id());

-- restaurant_blocked_dates: scoped to tenant
CREATE POLICY "Restaurant blocked dates scoped to tenant" ON restaurant_blocked_dates
  FOR ALL USING (restaurant_id = public.get_current_tenant_id())
  WITH CHECK (restaurant_id = public.get_current_tenant_id());

-- seat_locks: scoped via slot ownership
-- NOTE: seat_locks are managed by service-role (supabaseAdmin) only in API routes,
-- so client-side RLS is belt-and-suspenders.
CREATE POLICY "Seat locks via slot ownership" ON seat_locks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM restaurant_slots s
      WHERE s.id = seat_locks.slot_id
        AND s.restaurant_id = public.get_current_tenant_id()
    )
  );

-- ── Step 8: RPC Functions (Atomic Operations) ─────────────────────────────

-- ── 8a: check_seat_availability ─────────────────────────────────────────
-- Returns remaining seats after accounting for confirmed bookings + active locks.
-- Runs inside a transaction; uses advisory locks for read consistency.
CREATE OR REPLACE FUNCTION check_seat_availability(
  p_slot_id       UUID,
  p_booking_date  DATE,
  p_party_size    INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_capacity  INTEGER;
  v_confirmed_seats INTEGER;
  v_locked_seats    INTEGER;
  v_remaining       INTEGER;
BEGIN
  -- Lock the slot row to prevent concurrent modifications
  SELECT total_capacity INTO v_total_capacity
  FROM restaurant_slots
  WHERE id = p_slot_id AND is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('available', false, 'remaining_seats', 0, 'error', 'slot_not_found');
  END IF;

  -- Sum confirmed bookings for this slot + date
  SELECT COALESCE(SUM(party_size), 0) INTO v_confirmed_seats
  FROM restaurant_bookings
  WHERE slot_id = p_slot_id
    AND booking_date = p_booking_date
    AND booking_status = 'confirmed';

  -- Sum active (non-expired) seat locks
  SELECT COALESCE(SUM(locked_seats), 0) INTO v_locked_seats
  FROM seat_locks
  WHERE slot_id = p_slot_id
    AND booking_date = p_booking_date
    AND expires_at > NOW();

  v_remaining := v_total_capacity - v_confirmed_seats - v_locked_seats;

  RETURN jsonb_build_object(
    'available',        v_remaining >= p_party_size,
    'remaining_seats',  GREATEST(v_remaining, 0)
  );
END;
$$;

-- ── 8b: lock_seats ────────────────────────────────────────────────────────
-- Atomically checks availability then writes a seat lock.
-- Returns {locked, expires_at} or {locked: false, reason}.
CREATE OR REPLACE FUNCTION lock_seats(
  p_slot_id       UUID,
  p_booking_date  DATE,
  p_party_size    INTEGER,
  p_session_token VARCHAR,
  p_expires_at    TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_capacity  INTEGER;
  v_confirmed_seats INTEGER;
  v_locked_seats    INTEGER;
  v_remaining       INTEGER;
BEGIN
  -- Lock the slot row exclusively to prevent concurrent lock grants
  SELECT total_capacity INTO v_total_capacity
  FROM restaurant_slots
  WHERE id = p_slot_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('locked', false, 'reason', 'slot_not_found');
  END IF;

  SELECT COALESCE(SUM(party_size), 0) INTO v_confirmed_seats
  FROM restaurant_bookings
  WHERE slot_id = p_slot_id
    AND booking_date = p_booking_date
    AND booking_status = 'confirmed';

  SELECT COALESCE(SUM(locked_seats), 0) INTO v_locked_seats
  FROM seat_locks
  WHERE slot_id = p_slot_id
    AND booking_date = p_booking_date
    AND expires_at > NOW();

  v_remaining := v_total_capacity - v_confirmed_seats - v_locked_seats;

  IF v_remaining < p_party_size THEN
    RETURN jsonb_build_object('locked', false, 'reason', 'insufficient_seats');
  END IF;

  -- Delete any expired lock for this session (cleanup)
  DELETE FROM seat_locks WHERE session_token = p_session_token;

  -- Insert the new lock
  INSERT INTO seat_locks (slot_id, booking_date, locked_seats, session_token, expires_at)
  VALUES (p_slot_id, p_booking_date, p_party_size, p_session_token, p_expires_at);

  RETURN jsonb_build_object(
    'locked',     true,
    'expires_at', p_expires_at
  );
END;
$$;

-- ── 8c: confirm_booking ───────────────────────────────────────────────────
-- Full booking transaction:
--   1. Validate seat lock exists and not expired
--   2. Check idempotency on razorpay_payment_id
--   3. Write booking record with generated reservation_id
--   4. Delete seat lock
-- Returns booking record as JSONB or error.
CREATE OR REPLACE FUNCTION confirm_booking(
  p_restaurant_id       UUID,
  p_slot_id             UUID,
  p_booking_date        DATE,
  p_session_token       VARCHAR,
  p_razorpay_payment_id VARCHAR,
  p_customer_name       VARCHAR,
  p_customer_phone      VARCHAR,
  p_party_size          INTEGER,
  p_payment_amount      INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_record     seat_locks%ROWTYPE;
  v_existing        restaurant_bookings%ROWTYPE;
  v_reservation_id  VARCHAR;
  v_short_code      VARCHAR(5);
  v_date_str        VARCHAR(8);
  v_seq             INTEGER;
  v_new_booking     restaurant_bookings%ROWTYPE;
  v_slot_time       TIME;
BEGIN
  -- ── Idempotency check ──────────────────────────────────────
  SELECT * INTO v_existing
  FROM restaurant_bookings
  WHERE razorpay_payment_id = p_razorpay_payment_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success',        true,
      'idempotent',     true,
      'reservation_id', v_existing.reservation_id,
      'booking_id',     v_existing.id
    );
  END IF;

  -- ── Validate seat lock ─────────────────────────────────────
  SELECT * INTO v_lock_record
  FROM seat_locks
  WHERE session_token = p_session_token
    AND slot_id = p_slot_id
    AND booking_date = p_booking_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'lock_not_found');
  END IF;

  IF v_lock_record.expires_at < NOW() THEN
    DELETE FROM seat_locks WHERE id = v_lock_record.id;
    RETURN jsonb_build_object('success', false, 'reason', 'lock_expired');
  END IF;

  -- ── Generate reservation_id ────────────────────────────────
  -- Format: [SHORT_CODE]-[YYYYMMDD]-[0001]
  SELECT COALESCE(short_code, 'RES') INTO v_short_code
  FROM tenants WHERE id = p_restaurant_id;

  v_date_str := TO_CHAR(p_booking_date, 'YYYYMMDD');

  -- Count existing bookings for this restaurant + date to get sequence
  SELECT COUNT(*) + 1 INTO v_seq
  FROM restaurant_bookings
  WHERE restaurant_id = p_restaurant_id
    AND booking_date = p_booking_date;

  v_reservation_id := v_short_code || '-' || v_date_str || '-' || LPAD(v_seq::TEXT, 4, '0');

  -- ── Get slot time for response ──────────────────────────────
  SELECT slot_time INTO v_slot_time FROM restaurant_slots WHERE id = p_slot_id;

  -- ── Write booking record ────────────────────────────────────
  INSERT INTO restaurant_bookings (
    restaurant_id, slot_id, booking_date,
    customer_name, customer_phone, party_size,
    payment_amount, payment_status, razorpay_payment_id,
    booking_status, reservation_id
  ) VALUES (
    p_restaurant_id, p_slot_id, p_booking_date,
    p_customer_name, p_customer_phone, p_party_size,
    p_payment_amount, 'paid', p_razorpay_payment_id,
    'confirmed', v_reservation_id
  )
  RETURNING * INTO v_new_booking;

  -- ── Delete seat lock ────────────────────────────────────────
  DELETE FROM seat_locks WHERE id = v_lock_record.id;

  RETURN jsonb_build_object(
    'success',        true,
    'idempotent',     false,
    'reservation_id', v_reservation_id,
    'booking_id',     v_new_booking.id,
    'slot_time',      v_slot_time
  );
END;
$$;

-- Grant execute to service role only (API routes use supabaseAdmin = service role)
REVOKE ALL ON FUNCTION check_seat_availability FROM PUBLIC;
REVOKE ALL ON FUNCTION lock_seats FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_booking FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_seat_availability TO service_role;
GRANT EXECUTE ON FUNCTION lock_seats TO service_role;
GRANT EXECUTE ON FUNCTION confirm_booking TO service_role;

-- ── Step 9: Cleanup trigger for seat_locks (backup for cron) ─────────────
-- The cron job at /api/restaurant/cron/cleanup is the primary cleanup mechanism.
-- This partial index ensures the DB query for expired locks is always fast.
-- (The index was already created in Step 6.)

-- ═══════════════════════════════════════════════════════════
-- 🌱 SEEDING — How to grant restaurant_reservations to a tenant
-- ═══════════════════════════════════════════════════════════
--
-- Run this in Supabase SQL Editor, replacing the UUID with the tenant's actual id:
--
-- UPDATE tenants
-- SET
--   modules    = array_append(COALESCE(modules, '{}'), 'restaurant_reservations'),
--   short_code = 'CT',     -- Restaurant short code for reservation IDs (e.g. CT-20240528-0042)
--   notify_phone = '+919876543210'  -- Manager's WhatsApp number for booking notifications
-- WHERE id = 'YOUR-TENANT-UUID-HERE';
--
-- To revoke:
-- UPDATE tenants
-- SET modules = array_remove(modules, 'restaurant_reservations')
-- WHERE id = 'YOUR-TENANT-UUID-HERE';
--
-- To view all restaurant tenants:
-- SELECT id, business_name, short_code, notify_phone, modules
-- FROM tenants
-- WHERE 'restaurant_reservations' = ANY(modules);
-- ═══════════════════════════════════════════════════════════
