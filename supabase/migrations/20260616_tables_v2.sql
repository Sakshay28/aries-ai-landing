-- ═══════════════════════════════════════════════════════════
-- 🍽️  Tables Module v2 — Production-Grade Rebuild
-- ═══════════════════════════════════════════════════════════
-- STRICTLY ADDITIVE / BACKWARD-COMPATIBLE. Safe to run on the live DB
-- before the new frontend ships (dev and prod share one Supabase project).
--
-- Adds: cleaning/blocked statuses, reservation type (guest/internal),
-- real reserved-for timestamps + duration for double-booking prevention,
-- server/section/blocked_reason, an append-only activity timeline, and
-- table operating-hours settings on tenants.
--
-- Preserves (verified): assign_best_table() signature + return shape
-- (WhatsApp webhook), free_table() review-pump + visit-count behavior
-- (review cron + guest memory).
-- ═══════════════════════════════════════════════════════════

-- ── Step 1: Widen restaurant_tables.status check ────────────────────────────
-- Original inline check only allowed available/reserved/occupied.

ALTER TABLE restaurant_tables
  DROP CONSTRAINT IF EXISTS restaurant_tables_status_check;

ALTER TABLE restaurant_tables
  ADD CONSTRAINT restaurant_tables_status_check
  CHECK (status IN ('available', 'reserved', 'occupied', 'cleaning', 'blocked'));

-- ── Step 2: New restaurant_tables columns (additive) ────────────────────────

ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS reservation_type      VARCHAR(10) DEFAULT 'guest',
  ADD COLUMN IF NOT EXISTS reservation_label     VARCHAR,
  ADD COLUMN IF NOT EXISTS reserved_for          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reserved_duration_min INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS server_name           VARCHAR,
  ADD COLUMN IF NOT EXISTS section                VARCHAR,
  ADD COLUMN IF NOT EXISTS blocked_reason        VARCHAR;

-- ── Step 3: Append-only activity timeline ───────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_table_activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  table_id      UUID REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  table_name    VARCHAR,                 -- denormalized so history survives table deletion
  action        VARCHAR(20) NOT NULL,    -- reserved|seated|walk_in|freed|cleaning|blocked|unblocked|cancelled|status_change|created
  actor         VARCHAR,                 -- user email | 'ai_whatsapp' | 'system'
  guest_name    VARCHAR,
  guest_phone   VARCHAR,
  guest_count   INTEGER,
  from_status   VARCHAR(10),
  to_status     VARCHAR(10),
  detail        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_activity_tenant_time
  ON restaurant_table_activity(restaurant_id, created_at DESC);

ALTER TABLE restaurant_table_activity ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Table activity scoped to tenant" ON restaurant_table_activity
    FOR ALL USING (restaurant_id = public.get_current_tenant_id())
    WITH CHECK (restaurant_id = public.get_current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Step 4: Table operating-hours + count settings on tenants ───────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS tables_open_time     TIME    DEFAULT '11:00',
  ADD COLUMN IF NOT EXISTS tables_close_time    TIME    DEFAULT '23:00',
  ADD COLUMN IF NOT EXISTS tables_slot_interval INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS tables_count         INTEGER;

-- ── Step 5: Internal activity-log helper ────────────────────────────────────

CREATE OR REPLACE FUNCTION log_table_activity(
  p_restaurant_id UUID,
  p_table_id      UUID,
  p_table_name    VARCHAR,
  p_action        VARCHAR,
  p_actor         VARCHAR,
  p_guest_name    VARCHAR,
  p_guest_phone   VARCHAR,
  p_guest_count   INTEGER,
  p_from_status   VARCHAR,
  p_to_status     VARCHAR,
  p_detail        TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO restaurant_table_activity (
    restaurant_id, table_id, table_name, action, actor,
    guest_name, guest_phone, guest_count, from_status, to_status, detail
  ) VALUES (
    p_restaurant_id, p_table_id, p_table_name, p_action, p_actor,
    p_guest_name, p_guest_phone, p_guest_count, p_from_status, p_to_status, p_detail
  );
END;
$$;

-- ── Step 6: Extend assign_best_table (IDENTICAL signature — webhook-safe) ────
-- CRITICAL: keep the EXACT 8-arg signature. Adding a param would create an
-- overload (not a replace), making the WhatsApp webhook's 8-arg call ambiguous.
-- So we only extend the body; the actor on auto-assign is always 'system'.

CREATE OR REPLACE FUNCTION assign_best_table(
  p_restaurant_id    UUID,
  p_party_size       INTEGER,
  p_booking_id       UUID,
  p_guest_name       VARCHAR,
  p_guest_phone      VARCHAR,
  p_reservation_time VARCHAR DEFAULT NULL,
  p_notes            TEXT DEFAULT NULL,
  p_status           VARCHAR DEFAULT 'reserved'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table restaurant_tables%ROWTYPE;
BEGIN
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

  UPDATE restaurant_tables SET
    status             = p_status,
    reservation_type   = 'guest',
    reservation_label  = NULL,
    current_booking_id = p_booking_id,
    guest_name         = p_guest_name,
    guest_phone        = p_guest_phone,
    guest_count        = p_party_size,
    reservation_time   = p_reservation_time,
    notes              = p_notes,
    reserved_at        = CASE WHEN p_status = 'reserved' THEN NOW() ELSE reserved_at END,
    seated_at          = CASE WHEN p_status = 'occupied' THEN NOW() ELSE NULL END
  WHERE id = v_table.id;

  IF p_booking_id IS NOT NULL THEN
    UPDATE restaurant_bookings SET table_id = v_table.id WHERE id = p_booking_id;
  END IF;

  PERFORM log_table_activity(
    p_restaurant_id, v_table.id, v_table.name,
    CASE WHEN p_status = 'occupied' THEN 'seated' ELSE 'reserved' END,
    'system', p_guest_name, p_guest_phone, p_party_size,
    v_table.status, p_status, p_notes
  );

  RETURN jsonb_build_object(
    'assigned',   true,
    'table_id',   v_table.id,
    'table_name', v_table.name,
    'capacity',   v_table.capacity
  );
END;
$$;

-- ── Step 7: Extend free_table (KEEP review-pump + visit-count behavior) ──────
-- Adds optional p_to_status (default 'available') so "guest left → Cleaning"
-- still records freed_at/last_guest and bumps visit_count, and p_actor.
-- Adding params changes the signature, so DROP the old 1-arg version first to
-- avoid creating an ambiguous overload. The single new function (2 defaulted
-- params) is still callable with just p_table_id, so any in-flight 1-arg caller
-- (the soon-to-be-removed cycle route) keeps working.

DROP FUNCTION IF EXISTS free_table(UUID);

CREATE OR REPLACE FUNCTION free_table(
  p_table_id   UUID,
  p_to_status  VARCHAR DEFAULT 'available',
  p_actor      VARCHAR DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table   restaurant_tables%ROWTYPE;
  v_status  VARCHAR;
BEGIN
  SELECT * INTO v_table FROM restaurant_tables WHERE id = p_table_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'table_not_found');
  END IF;

  v_status := CASE WHEN p_to_status IN ('available', 'cleaning') THEN p_to_status ELSE 'available' END;

  UPDATE restaurant_tables SET
    status                 = v_status,
    reservation_type       = 'guest',
    reservation_label      = NULL,
    reserved_for           = NULL,
    current_booking_id     = NULL,
    guest_name             = NULL,
    guest_phone            = NULL,
    guest_count            = NULL,
    reservation_time       = NULL,
    notes                  = NULL,
    seated_at              = NULL,
    reserved_at            = NULL,
    freed_at               = NOW(),
    last_guest_phone       = v_table.guest_phone,
    last_guest_name        = v_table.guest_name,
    review_request_sent_at = NULL
  WHERE id = p_table_id;

  -- Increment visit count for this guest (guest memory + review pump)
  IF v_table.guest_phone IS NOT NULL AND v_table.restaurant_id IS NOT NULL THEN
    INSERT INTO restaurant_guests (restaurant_id, customer_phone, customer_name, visit_count, last_visit_date, first_visit_date)
    VALUES (v_table.restaurant_id, v_table.guest_phone, v_table.guest_name, 1, CURRENT_DATE, CURRENT_DATE)
    ON CONFLICT (restaurant_id, customer_phone)
    DO UPDATE SET
      visit_count      = restaurant_guests.visit_count + 1,
      last_visit_date  = CURRENT_DATE,
      first_visit_date = COALESCE(restaurant_guests.first_visit_date, CURRENT_DATE),
      customer_name    = COALESCE(EXCLUDED.customer_name, restaurant_guests.customer_name);
  END IF;

  PERFORM log_table_activity(
    v_table.restaurant_id, v_table.id, v_table.name, 'freed',
    p_actor, v_table.guest_name, v_table.guest_phone, v_table.guest_count,
    v_table.status, v_status, NULL
  );

  RETURN jsonb_build_object(
    'success',          true,
    'to_status',        v_status,
    'last_guest_phone', v_table.guest_phone,
    'last_guest_name',  v_table.guest_name
  );
END;
$$;

-- ── Step 8: reserve_specific_table — explicit reserve + double-booking guard ─

CREATE OR REPLACE FUNCTION reserve_specific_table(
  p_restaurant_id     UUID,
  p_table_id          UUID,
  p_party_size        INTEGER,
  p_reservation_type  VARCHAR,        -- 'guest' | 'internal'
  p_guest_name        VARCHAR,
  p_guest_phone       VARCHAR,
  p_reservation_label VARCHAR,
  p_booking_date      DATE,
  p_reserved_min      INTEGER,        -- minutes since midnight of requested time
  p_duration_min      INTEGER,
  p_reserved_for      TIMESTAMPTZ,
  p_time_display      VARCHAR,
  p_notes             TEXT,
  p_booking_id        UUID,
  p_actor             VARCHAR DEFAULT 'system',
  p_is_edit           BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table     restaurant_tables%ROWTYPE;
  v_conflict  INTEGER;
  v_dur       INTEGER := COALESCE(p_duration_min, 120);
BEGIN
  SELECT * INTO v_table
  FROM restaurant_tables
  WHERE id = p_table_id AND restaurant_id = p_restaurant_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'table_not_found');
  END IF;

  -- Physically unusable right now
  IF v_table.status IN ('occupied', 'blocked') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'table_unavailable');
  END IF;

  -- Already holds a different active reservation (single-current-reservation
  -- model). When editing the reservation that's already on this table, skip.
  IF NOT p_is_edit
     AND v_table.status = 'reserved'
     AND (p_booking_id IS NULL OR v_table.current_booking_id IS DISTINCT FROM p_booking_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'table_unavailable');
  END IF;

  -- Booking-level double-booking guard: any confirmed booking on this table for
  -- the same date whose slot window overlaps the requested window.
  SELECT 1 INTO v_conflict
  FROM restaurant_bookings b
  JOIN restaurant_slots s ON s.id = b.slot_id
  WHERE b.table_id = p_table_id
    AND b.booking_date = p_booking_date
    AND b.booking_status = 'confirmed'
    AND (p_booking_id IS NULL OR b.id <> p_booking_id)
    AND (EXTRACT(HOUR FROM s.slot_time) * 60 + EXTRACT(MINUTE FROM s.slot_time)) < (p_reserved_min + v_dur)
    AND (p_reserved_min) < (EXTRACT(HOUR FROM s.slot_time) * 60 + EXTRACT(MINUTE FROM s.slot_time) + v_dur)
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'time_conflict');
  END IF;

  UPDATE restaurant_tables SET
    status                = 'reserved',
    reservation_type      = COALESCE(p_reservation_type, 'guest'),
    reservation_label     = CASE WHEN p_reservation_type = 'internal' THEN p_reservation_label ELSE NULL END,
    current_booking_id    = p_booking_id,
    guest_name            = p_guest_name,
    guest_phone           = p_guest_phone,
    guest_count           = p_party_size,
    reservation_time      = p_time_display,
    reserved_for          = p_reserved_for,
    reserved_duration_min = v_dur,
    notes                 = p_notes,
    reserved_at           = NOW(),
    seated_at             = NULL
  WHERE id = p_table_id;

  IF p_booking_id IS NOT NULL THEN
    UPDATE restaurant_bookings SET table_id = p_table_id WHERE id = p_booking_id;
  END IF;

  PERFORM log_table_activity(
    p_restaurant_id, p_table_id, v_table.name, 'reserved',
    p_actor,
    COALESCE(p_guest_name, p_reservation_label),
    p_guest_phone, p_party_size,
    v_table.status, 'reserved',
    COALESCE(p_reservation_label, p_notes)
  );

  RETURN jsonb_build_object('ok', true, 'table_id', p_table_id, 'table_name', v_table.name);
END;
$$;

-- ── Step 9: seat_table — explicit seat (walk-in or seat a reservation) ───────
-- Does NOT mark a linked booking 'completed' (fixes prior cycle-route bug —
-- a booking is only completed when the table is freed).

CREATE OR REPLACE FUNCTION seat_table(
  p_restaurant_id UUID,
  p_table_id      UUID,
  p_party_size    INTEGER,
  p_guest_name    VARCHAR,
  p_guest_phone   VARCHAR,
  p_notes         TEXT,
  p_actor         VARCHAR DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table       restaurant_tables%ROWTYPE;
  v_action      VARCHAR;
  v_was_reserved BOOLEAN;
BEGIN
  SELECT * INTO v_table
  FROM restaurant_tables
  WHERE id = p_table_id AND restaurant_id = p_restaurant_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'table_not_found');
  END IF;

  IF v_table.status IN ('occupied', 'blocked') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'table_unavailable');
  END IF;

  v_was_reserved := (v_table.status = 'reserved');
  v_action := CASE WHEN v_was_reserved THEN 'seated' ELSE 'walk_in' END;

  UPDATE restaurant_tables SET
    status        = 'occupied',
    guest_name    = COALESCE(p_guest_name, v_table.guest_name),
    guest_phone   = COALESCE(p_guest_phone, v_table.guest_phone),
    guest_count   = COALESCE(p_party_size, v_table.guest_count),
    notes         = COALESCE(p_notes, v_table.notes),
    seated_at     = NOW(),
    reserved_for  = NULL
  WHERE id = p_table_id;

  PERFORM log_table_activity(
    p_restaurant_id, p_table_id, v_table.name, v_action,
    p_actor,
    COALESCE(p_guest_name, v_table.guest_name),
    COALESCE(p_guest_phone, v_table.guest_phone),
    COALESCE(p_party_size, v_table.guest_count),
    v_table.status, 'occupied', p_notes
  );

  RETURN jsonb_build_object('ok', true, 'table_name', v_table.name, 'was_reserved', v_was_reserved);
END;
$$;

-- ── Step 10: set_table_status — cleaning / blocked / unblock transitions ─────

CREATE OR REPLACE FUNCTION set_table_status(
  p_table_id  UUID,
  p_to_status VARCHAR,            -- 'cleaning' | 'blocked' | 'available'
  p_reason    VARCHAR DEFAULT NULL,
  p_actor     VARCHAR DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table  restaurant_tables%ROWTYPE;
  v_action VARCHAR;
BEGIN
  IF p_to_status NOT IN ('cleaning', 'blocked', 'available') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  SELECT * INTO v_table FROM restaurant_tables WHERE id = p_table_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'table_not_found');
  END IF;

  -- Block/cleaning should not silently discard an active guest/reservation
  IF p_to_status IN ('cleaning', 'blocked') AND v_table.status IN ('occupied', 'reserved') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'table_busy');
  END IF;

  v_action := CASE
    WHEN p_to_status = 'blocked' THEN 'blocked'
    WHEN p_to_status = 'cleaning' THEN 'cleaning'
    WHEN v_table.status = 'blocked' THEN 'unblocked'
    ELSE 'status_change'
  END;

  UPDATE restaurant_tables SET
    status         = p_to_status,
    blocked_reason = CASE WHEN p_to_status = 'blocked' THEN p_reason ELSE NULL END
  WHERE id = p_table_id;

  PERFORM log_table_activity(
    v_table.restaurant_id, p_table_id, v_table.name, v_action,
    p_actor, NULL, NULL, NULL, v_table.status, p_to_status, p_reason
  );

  RETURN jsonb_build_object('ok', true, 'table_name', v_table.name, 'to_status', p_to_status);
END;
$$;

-- ── Step 11: Grants (service_role only — API routes use supabaseAdmin) ───────

REVOKE ALL ON FUNCTION log_table_activity     FROM PUBLIC;
REVOKE ALL ON FUNCTION assign_best_table       FROM PUBLIC;
REVOKE ALL ON FUNCTION free_table              FROM PUBLIC;
REVOKE ALL ON FUNCTION reserve_specific_table  FROM PUBLIC;
REVOKE ALL ON FUNCTION seat_table              FROM PUBLIC;
REVOKE ALL ON FUNCTION set_table_status        FROM PUBLIC;

GRANT EXECUTE ON FUNCTION log_table_activity     TO service_role;
GRANT EXECUTE ON FUNCTION assign_best_table       TO service_role;
GRANT EXECUTE ON FUNCTION free_table              TO service_role;
GRANT EXECUTE ON FUNCTION reserve_specific_table  TO service_role;
GRANT EXECUTE ON FUNCTION seat_table              TO service_role;
GRANT EXECUTE ON FUNCTION set_table_status        TO service_role;
