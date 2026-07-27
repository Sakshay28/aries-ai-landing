-- ═══════════════════════════════════════════════════════════════════════════
-- 📌 Broadcast Correctness Lockdown — immutable recipient snapshot (2026-07-26)
-- ═══════════════════════════════════════════════════════════════════════════
-- Self-contained + idempotent. Creates broadcast_campaign_recipient_cache if it
-- is missing (migration 20260602 was not applied on all environments), WITH the
-- snapshot-lock columns, then adds the columns to existing tables and the
-- campaign-level snapshot metadata. Purely additive; safe to run before the new
-- code deploys (expand phase).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Recipient-cache table (create if missing, with snapshot columns) ──────
CREATE TABLE IF NOT EXISTS broadcast_campaign_recipient_cache (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES leads(id) ON DELETE CASCADE,
  phone_number        TEXT NOT NULL,
  name                TEXT,
  email               TEXT,
  source_type         TEXT,
  source_label        TEXT,
  status              TEXT CHECK (status IN ('eligible','excluded','duplicate_removed','invalid','opted_out')),
  last_interaction_at TIMESTAMPTZ,
  normalized_number   TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  -- snapshot-lock columns
  frozen              BOOLEAN NOT NULL DEFAULT false,
  snapshot_id         TEXT,
  snapshot_version    INTEGER
);

-- If the table already existed WITHOUT the snapshot columns, add them.
ALTER TABLE broadcast_campaign_recipient_cache
  ADD COLUMN IF NOT EXISTS frozen           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS snapshot_id      TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_version INTEGER;

-- ── 2. Campaign-level snapshot integrity + versioning metadata ───────────────
ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS recipient_snapshot_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snapshot_recipient_count INTEGER,
  ADD COLUMN IF NOT EXISTS snapshot_id              TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_hash            TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_version         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS snapshot_created_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by                TEXT,
  ADD COLUMN IF NOT EXISTS lock_reason              TEXT;

-- ── 3. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_broadcast_recipient_cache_campaign ON broadcast_campaign_recipient_cache(campaign_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipient_cache_tenant   ON broadcast_campaign_recipient_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recipient_cache_frozen             ON broadcast_campaign_recipient_cache(campaign_id, frozen, status);

-- ── 4. RLS (defense in depth) ────────────────────────────────────────────────
-- The app accesses this table only via the service role (which bypasses RLS),
-- and the browser never queries it. Enabling RLS with no policy is therefore a
-- safe deny-all for any non-service-role access.
ALTER TABLE broadcast_campaign_recipient_cache ENABLE ROW LEVEL SECURITY;
