-- ══════════════════════════════════════════════════════════════════════════════
-- Aries AI Voice Agent — Supabase Migration (v2 — strict tenant isolation)
-- Run once in Supabase SQL Editor (safe to re-run; uses IF NOT EXISTS / DROP IF EXISTS).
--
-- This replaces the previous wide-open RLS policies that allowed any anon
-- client to read every tenant's call data. Service-role key (used by the
-- Python agent and Next.js server) bypasses RLS naturally and continues to work.
-- ══════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Voice-usage tracking columns on tenants
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS voice_calls_used_this_month INTEGER DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS voice_call_limit            INTEGER DEFAULT 0;
-- Plan defaults: starter/growth = 0, pro = 0 (no included calls), ultra_premium = 150.
-- Adjust per-tenant via the dashboard or in the createSubscription flow.

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. call_logs — primary record of every completed call
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_logs (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id        UUID        REFERENCES tenants(id) ON DELETE CASCADE,
    phone_number     TEXT,
    caller_name      TEXT,
    duration_seconds INTEGER     DEFAULT 0,
    transcript       TEXT,
    summary          TEXT,
    recording_url    TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Drop the old TEXT tenant_id column type if it exists from the previous migration
-- (only fires if the column type mismatches; safely no-ops otherwise).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'call_logs' AND column_name = 'tenant_id' AND data_type = 'text'
    ) THEN
        ALTER TABLE call_logs ALTER COLUMN tenant_id TYPE UUID USING tenant_id::uuid;
    END IF;
END$$;

-- Analytics columns (added safely)
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS sentiment           TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS estimated_cost_usd  NUMERIC(10,5);
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS call_date           DATE;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS call_hour           INTEGER;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS call_day_of_week    TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS was_booked          BOOLEAN DEFAULT FALSE;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS interrupt_count     INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_call_logs_tenant   ON call_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_phone    ON call_logs (phone_number);
CREATE INDEX IF NOT EXISTS idx_call_logs_created  ON call_logs (created_at DESC);

ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

-- Drop legacy permissive policies
DROP POLICY IF EXISTS "Allow anon insert call_logs"  ON call_logs;
DROP POLICY IF EXISTS "Allow anon select call_logs"  ON call_logs;
DROP POLICY IF EXISTS "tenant_isolation_select_call_logs" ON call_logs;
DROP POLICY IF EXISTS "tenant_isolation_modify_call_logs" ON call_logs;

-- Authenticated tenants can only read their own call logs.
-- Mirrors the pattern used in `users` / `leads` / `messages` in schema.sql.
CREATE POLICY "tenant_isolation_select_call_logs"
    ON call_logs FOR SELECT TO authenticated
    USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

-- Inserts/updates/deletes from clients are forbidden — only the server
-- (service-role key, which bypasses RLS) writes call logs.
CREATE POLICY "tenant_isolation_modify_call_logs"
    ON call_logs FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. call_transcripts — streaming live transcript chunks
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_transcripts (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id    UUID        REFERENCES tenants(id) ON DELETE CASCADE,
    call_room_id TEXT        NOT NULL,
    phone        TEXT,
    role         TEXT        CHECK (role IN ('user', 'assistant')),
    content      TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE call_transcripts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_call_transcripts_tenant ON call_transcripts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_room   ON call_transcripts (call_room_id);
CREATE INDEX IF NOT EXISTS idx_call_transcripts_phone  ON call_transcripts (phone);

ALTER TABLE call_transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert transcripts" ON call_transcripts;
DROP POLICY IF EXISTS "Allow anon select transcripts" ON call_transcripts;
DROP POLICY IF EXISTS "tenant_isolation_select_transcripts" ON call_transcripts;
DROP POLICY IF EXISTS "tenant_isolation_modify_transcripts" ON call_transcripts;

CREATE POLICY "tenant_isolation_select_transcripts"
    ON call_transcripts FOR SELECT TO authenticated
    USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "tenant_isolation_modify_transcripts"
    ON call_transcripts FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. active_calls — live call tracking (auto-cleared on call end)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS active_calls (
    room_id      TEXT        PRIMARY KEY,
    tenant_id    UUID        REFERENCES tenants(id) ON DELETE CASCADE,
    phone        TEXT,
    caller_name  TEXT,
    status       TEXT        DEFAULT 'ringing',
    started_at   TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE active_calls ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_active_calls_tenant ON active_calls (tenant_id);

ALTER TABLE active_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon all active_calls"        ON active_calls;
DROP POLICY IF EXISTS "tenant_isolation_select_active"     ON active_calls;
DROP POLICY IF EXISTS "tenant_isolation_modify_active"     ON active_calls;

CREATE POLICY "tenant_isolation_select_active"
    ON active_calls FOR SELECT TO authenticated
    USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "tenant_isolation_modify_active"
    ON active_calls FOR ALL TO authenticated
    USING (false) WITH CHECK (false);

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. RPC: increment voice-call usage atomically (used by /api/calls/outbound)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_voice_calls(t_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE tenants
    SET voice_calls_used_this_month = voice_calls_used_this_month + 1
    WHERE id = t_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════════════════
-- DONE. Safe to re-run at any time.
-- Service-role writes (Python agent, Next.js server) bypass RLS as expected.
-- Authenticated dashboard reads are tenant-scoped via the users.tenant_id link.
-- ══════════════════════════════════════════════════════════════════════════════
