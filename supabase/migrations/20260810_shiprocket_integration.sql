-- Migration: Shiprocket Integration (MVP vertical slice)
-- Tables: connections, shipments (keyed off shopify_orders), tracking events,
-- webhook dedup, and a small async job queue mirroring shopify_sync_jobs.
--
-- IMPORTANT: RLS below uses public.get_current_tenant_id() (auth_id = auth.uid()),
-- the CORRECT pattern from 20260518_fix_rls_recursion.sql. Do NOT copy
-- 20260801_shopify_integration.sql's tenant-isolation loop — it uses
-- `users.id = auth.uid()`, which compares the internal PK to the Auth UID and
-- never matches. That migration shipped a real bug; this one avoids it.

BEGIN;

-- ── 1. Connection (one Shiprocket account per tenant) ─────────
CREATE TABLE IF NOT EXISTS shiprocket_connections (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email                       TEXT NOT NULL,
  password_enc                TEXT NOT NULL,                 -- encryptTokenV2 — Shiprocket auth is email+password, no OAuth
  auth_token_enc               TEXT,                          -- encryptTokenV2 — current JWT from /v1/external/auth/login
  token_expires_at             TIMESTAMPTZ,                   -- ~10 days from issue [UNVERIFIED exact TTL]
  webhook_secret_enc           TEXT NOT NULL,                 -- OUR random secret; merchant pastes into Shiprocket's webhook config as x-api-key
  default_pickup_location      TEXT,
  default_item_weight_kg       NUMERIC(6,3) NOT NULL DEFAULT 0.5,
  default_package_length_cm    NUMERIC(6,2) NOT NULL DEFAULT 15,
  default_package_breadth_cm   NUMERIC(6,2) NOT NULL DEFAULT 10,
  default_package_height_cm    NUMERIC(6,2) NOT NULL DEFAULT 5,
  status                       TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connected','error')),
  last_auth_error              TEXT,
  connected_at                 TIMESTAMPTZ,
  last_token_refresh_at        TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shiprocket_connections_tenant ON shiprocket_connections(tenant_id);

-- ── 2. Shipments — 1 row per shopify_order shipped via Shiprocket ──
CREATE TABLE IF NOT EXISTS shiprocket_shipments (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_order_id            UUID REFERENCES shopify_orders(id) ON DELETE SET NULL,  -- SET NULL, not CASCADE: shopify_orders rows are purged after 90 days, shipment history must outlive the order snapshot
  shopify_order_number        TEXT,             -- denormalised snapshot, survives shopify_orders purge
  shopify_order_shopify_id    BIGINT,           -- denormalised numeric Shopify order id snapshot
  customer_name                TEXT,
  customer_phone                TEXT,
  customer_email                TEXT,
  shiprocket_order_id           BIGINT,
  shiprocket_shipment_id        BIGINT,
  courier_id                    BIGINT,
  courier_name                   TEXT,
  awb_code                       TEXT,
  pickup_scheduled_at            TIMESTAMPTZ,
  pickup_token_number            TEXT,
  label_url                      TEXT,
  manifest_url                   TEXT,           -- reserved column, unused until the manifests fast-follow
  payment_method                  TEXT CHECK (payment_method IN ('Prepaid','COD')),
  status                          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                                     'pending','creating','created','awb_assigned',
                                     'pickup_scheduled','label_generated','in_transit',
                                     'out_for_delivery','delivered','cancelled','failed','rto'
                                   )),
  status_raw                      TEXT,           -- last raw Shiprocket status string, unnormalised
  last_error                      TEXT,
  shiprocket_created_at           TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- The idempotency guard: one shipment per order per tenant. This, not a
-- disabled frontend button, is what prevents a double-click from creating
-- two Shiprocket orders for the same Aries order.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shiprocket_shipments_tenant_order ON shiprocket_shipments(tenant_id, shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_shiprocket_shipments_tenant_status ON shiprocket_shipments(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_shiprocket_shipments_awb ON shiprocket_shipments(awb_code) WHERE awb_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shiprocket_shipments_sr_order ON shiprocket_shipments(shiprocket_order_id) WHERE shiprocket_order_id IS NOT NULL;

-- ── 3. Tracking events — append-only raw history ────────────
CREATE TABLE IF NOT EXISTS shiprocket_tracking_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shipment_id       UUID REFERENCES shiprocket_shipments(id) ON DELETE CASCADE,
  awb_code          TEXT,
  raw_status        TEXT,
  normalized_status TEXT,
  status_location   TEXT,
  event_time        TIMESTAMPTZ,
  payload           JSONB NOT NULL,           -- full raw webhook body, never discarded — the correction path if a field-name guess is wrong
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shiprocket_tracking_events_shipment ON shiprocket_tracking_events(shipment_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_shiprocket_tracking_events_tenant ON shiprocket_tracking_events(tenant_id, received_at DESC);

-- ── 4. Webhook dedup ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shiprocket_webhook_events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dedupe_key     TEXT NOT NULL,   -- sha256(raw body) — Shiprocket docs don't document a stable delivery id [UNVERIFIED]
  awb_code       TEXT,
  status         TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','failed','skipped')),
  payload        JSONB,
  error_message  TEXT,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shiprocket_webhook_events_dedupe ON shiprocket_webhook_events(tenant_id, dedupe_key);

-- ── 5. Async queue (mirrors shopify_sync_jobs; MVP only uses 'webhook_event') ──
CREATE TABLE IF NOT EXISTS shiprocket_sync_jobs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_type       TEXT NOT NULL,          -- 'webhook_event' for MVP; reserved for fast-follow job types
  payload        JSONB DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  max_attempts   INTEGER NOT NULL DEFAULT 6,
  worker_id      TEXT,
  error_message  TEXT,
  run_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shiprocket_sync_jobs_status_run ON shiprocket_sync_jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_shiprocket_sync_jobs_tenant ON shiprocket_sync_jobs(tenant_id, status);

-- ── 6. RLS ─────────────────────────────────────────────────────
ALTER TABLE shiprocket_connections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shiprocket_shipments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shiprocket_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE shiprocket_webhook_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE shiprocket_sync_jobs       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'shiprocket_connections','shiprocket_shipments','shiprocket_tracking_events',
    'shiprocket_webhook_events','shiprocket_sync_jobs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_isolation" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "%s_tenant_isolation" ON %I FOR ALL USING (tenant_id = public.get_current_tenant_id()) WITH CHECK (tenant_id = public.get_current_tenant_id())',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ── 7. Claim / reclaim RPCs — pattern adapted from claim_shopify_sync_jobs /
--     reclaim_stuck_shopify_jobs (that queue logic is correct; only the RLS
--     tenant-check pattern needed fixing, not this), renamed to avoid collision.
CREATE OR REPLACE FUNCTION claim_shiprocket_sync_jobs(p_worker_id TEXT, p_limit INT)
RETURNS TABLE(id UUID, tenant_id UUID, job_type TEXT, payload JSONB, attempts INTEGER) AS $$
DECLARE v_ids UUID[];
BEGIN
  SELECT array_agg(q.id) INTO v_ids FROM (
    SELECT j.id FROM shiprocket_sync_jobs j
    WHERE j.status = 'pending' AND j.run_at <= NOW()
    ORDER BY j.run_at ASC LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) q;
  IF v_ids IS NULL THEN RETURN; END IF;
  RETURN QUERY
  UPDATE shiprocket_sync_jobs j
  SET status = 'processing', worker_id = p_worker_id,
      started_at = COALESCE(j.started_at, NOW()), updated_at = NOW(), attempts = j.attempts + 1
  WHERE j.id = ANY(v_ids)
  RETURNING j.id, j.tenant_id, j.job_type, j.payload, j.attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reclaim_stuck_shiprocket_jobs(p_timeout_minutes INT DEFAULT 10)
RETURNS INTEGER AS $$
DECLARE n INT;
BEGIN
  UPDATE shiprocket_sync_jobs
  SET status = 'pending', run_at = NOW(), worker_id = NULL, updated_at = NOW()
  WHERE status = 'processing' AND started_at < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL
    AND attempts < max_attempts;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- Rollback (manual):
-- DROP TABLE IF EXISTS shiprocket_sync_jobs, shiprocket_webhook_events,
--   shiprocket_tracking_events, shiprocket_shipments, shiprocket_connections CASCADE;
-- DROP FUNCTION IF EXISTS claim_shiprocket_sync_jobs(TEXT, INT), reclaim_stuck_shiprocket_jobs(INT);
