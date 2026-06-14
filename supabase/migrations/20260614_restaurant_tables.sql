-- ═══════════════════════════════════════════════════════════
-- 🍽️  Restaurant Physical Tables — Migration
-- ═══════════════════════════════════════════════════════════
-- Adds physical table entities (T1, T2, ...) with status tracking,
-- links bookings to tables, adds reminder tracking.
-- Safe to run on existing database (IF NOT EXISTS pattern).
-- ═══════════════════════════════════════════════════════════

-- ── Step 1: restaurant_tables ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             VARCHAR(10) NOT NULL,
  capacity         INTEGER NOT NULL CHECK (capacity > 0),
  status           VARCHAR(10) NOT NULL DEFAULT 'available'
                     CHECK (status IN ('available', 'reserved', 'occupied')),
  current_booking_id UUID REFERENCES restaurant_bookings(id) ON DELETE SET NULL,
  guest_name       VARCHAR,
  guest_phone      VARCHAR,
  guest_count      INTEGER,
  reservation_time VARCHAR(20),
  notes            TEXT,
  seated_at        TIMESTAMPTZ,
  reserved_at      TIMESTAMPTZ,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_tenant
  ON restaurant_tables(restaurant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_status
  ON restaurant_tables(restaurant_id, status) WHERE is_active = true;

DROP TRIGGER IF EXISTS tr_restaurant_tables_updated ON restaurant_tables;
CREATE TRIGGER tr_restaurant_tables_updated
  BEFORE UPDATE ON restaurant_tables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Step 2: Add table_id + reminder columns to restaurant_bookings ──────────

ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL;
ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'manual';
ALTER TABLE restaurant_bookings
  ADD COLUMN IF NOT EXISTS special_request TEXT;

CREATE INDEX IF NOT EXISTS idx_restaurant_bookings_table
  ON restaurant_bookings(table_id)
  WHERE booking_status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_restaurant_bookings_reminder
  ON restaurant_bookings(booking_date, reminder_sent_at)
  WHERE booking_status = 'confirmed' AND reminder_sent_at IS NULL;

-- ── Step 3: RLS for restaurant_tables ───────────────────────────────────────

ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Restaurant tables scoped to tenant" ON restaurant_tables
    FOR ALL USING (restaurant_id = public.get_current_tenant_id())
    WITH CHECK (restaurant_id = public.get_current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Step 4: assign_best_table RPC ───────────────────────────────────────────
-- Atomically finds the smallest available table that fits the party,
-- marks it reserved, and returns the table info.

CREATE OR REPLACE FUNCTION assign_best_table(
  p_restaurant_id  UUID,
  p_party_size     INTEGER,
  p_booking_id     UUID,
  p_guest_name     VARCHAR,
  p_guest_phone    VARCHAR,
  p_reservation_time VARCHAR DEFAULT NULL,
  p_notes          TEXT DEFAULT NULL,
  p_status         VARCHAR DEFAULT 'reserved'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table restaurant_tables%ROWTYPE;
BEGIN
  -- Find smallest available table that fits, lock it
  SELECT * INTO v_table
  FROM restaurant_tables
  WHERE restaurant_id = p_restaurant_id
    AND status = 'available'
    AND is_active = true
    AND capacity >= p_party_size
  ORDER BY capacity ASC, sort_order ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('assigned', false, 'reason', 'no_available_table');
  END IF;

  -- Mark table as reserved/occupied
  UPDATE restaurant_tables SET
    status             = p_status,
    current_booking_id = p_booking_id,
    guest_name         = p_guest_name,
    guest_phone        = p_guest_phone,
    guest_count        = p_party_size,
    reservation_time   = p_reservation_time,
    notes              = p_notes,
    reserved_at        = CASE WHEN p_status = 'reserved' THEN NOW() ELSE reserved_at END,
    seated_at          = CASE WHEN p_status = 'occupied' THEN NOW() ELSE NULL END
  WHERE id = v_table.id;

  -- Link booking to table
  IF p_booking_id IS NOT NULL THEN
    UPDATE restaurant_bookings SET table_id = v_table.id WHERE id = p_booking_id;
  END IF;

  RETURN jsonb_build_object(
    'assigned',   true,
    'table_id',   v_table.id,
    'table_name', v_table.name,
    'capacity',   v_table.capacity
  );
END;
$$;

-- ── Step 5: free_table RPC ──────────────────────────────────────────────────
-- Resets a table back to available state.

CREATE OR REPLACE FUNCTION free_table(
  p_table_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE restaurant_tables SET
    status             = 'available',
    current_booking_id = NULL,
    guest_name         = NULL,
    guest_phone        = NULL,
    guest_count        = NULL,
    reservation_time   = NULL,
    notes              = NULL,
    seated_at          = NULL,
    reserved_at        = NULL
  WHERE id = p_table_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'table_not_found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant to service_role only
REVOKE ALL ON FUNCTION assign_best_table FROM PUBLIC;
REVOKE ALL ON FUNCTION free_table FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assign_best_table TO service_role;
GRANT EXECUTE ON FUNCTION free_table TO service_role;
