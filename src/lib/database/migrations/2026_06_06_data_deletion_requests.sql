-- ═══════════════════════════════════════════════════════════
-- GDPR / DPDP data deletion request queue
-- Tenant-initiated deletion with 30-day grace period.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  requested_by    UUID,              -- user_id who requested it
  email           TEXT NOT NULL,     -- for notification
  reason          TEXT,              -- optional reason
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  scheduled_for   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  processed_at    TIMESTAMPTZ,
  confirmation_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_scheduled
  ON data_deletion_requests(scheduled_for, status)
  WHERE status = 'pending';
