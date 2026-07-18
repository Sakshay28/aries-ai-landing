-- ═══════════════════════════════════════════════════════════
-- Platform-admin access logging
-- ═══════════════════════════════════════════════════════════
-- The generic `audit_logs` table (used by src/lib/audit/logger.ts and the
-- /dashboard/settings/audit-log page) has existed in production since before
-- this repo tracked migrations for it — it was created ad hoc in the Supabase
-- SQL editor. This migration formalizes it (idempotent, safe to run even if
-- it already exists) and is the vehicle for a new category of entries:
-- platform-admin actions that touch a specific tenant's data (viewing/editing
-- their credentials, impersonating a login, approving a signup). Those show
-- up in the client's own Audit Log page — see logAudit() calls added to
-- src/app/api/admin/{provision,impersonate,approvals}/route.ts.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id     uuid,
  actor_email  text,
  action       text NOT NULL,
  entity       text NOT NULL,
  entity_id    text,
  old_value    text,
  new_value    text,
  ip_address   text,
  meta         jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created
  ON audit_logs (tenant_id, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_tenant_isolation'
  ) THEN
    CREATE POLICY audit_logs_tenant_isolation ON audit_logs
      FOR SELECT USING (tenant_id = public.get_current_tenant_id());
  END IF;
END
$$;

-- No INSERT/UPDATE/DELETE policy for authenticated/anon roles on purpose:
-- only supabaseAdmin (service role, bypasses RLS) ever writes a row, via
-- logAudit(). Clients can only ever read their own tenant's rows.
