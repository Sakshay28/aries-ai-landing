-- ═══════════════════════════════════════════════════════════
-- Hospitality OS v2 — Waitlist + Guest Profiles
-- Run in Supabase SQL Editor (idempotent).
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── Persistent guest profiles (keyed by phone per restaurant) ─────────────
CREATE TABLE IF NOT EXISTS restaurant_guests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_phone  VARCHAR NOT NULL,
  customer_name   VARCHAR,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  notes           TEXT,
  vip_status      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(restaurant_id, customer_phone)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_guests_restaurant
  ON restaurant_guests(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_guests_phone
  ON restaurant_guests(restaurant_id, customer_phone);

CREATE TRIGGER tr_restaurant_guests_updated
  BEFORE UPDATE ON restaurant_guests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Waitlist ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurant_waitlist (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_name    VARCHAR NOT NULL,
  customer_phone   VARCHAR NOT NULL,
  party_size       INTEGER NOT NULL DEFAULT 1 CHECK (party_size > 0),
  booking_date     DATE NOT NULL,
  requested_slot_id UUID REFERENCES restaurant_slots(id),
  position         INTEGER NOT NULL DEFAULT 1,
  status           VARCHAR(20) NOT NULL DEFAULT 'waiting'
                     CHECK (status IN ('waiting','notified','converted','removed')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_restaurant_waitlist_restaurant_date
  ON restaurant_waitlist(restaurant_id, booking_date);

CREATE TRIGGER tr_restaurant_waitlist_updated
  BEFORE UPDATE ON restaurant_waitlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE restaurant_guests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "tenant_guests"  ON restaurant_guests
  USING (restaurant_id = get_current_tenant_id());
CREATE POLICY IF NOT EXISTS "tenant_waitlist" ON restaurant_waitlist
  USING (restaurant_id = get_current_tenant_id());

COMMIT;
