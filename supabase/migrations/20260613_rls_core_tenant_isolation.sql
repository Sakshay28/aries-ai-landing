-- ════════════════════════════════════════════════════════════════════════
-- 20260613_rls_core_tenant_isolation.sql
-- CRITICAL SECURITY FIX — enable Row-Level Security on the core tenant tables
-- that the browser (anon key) reads/writes directly.
--
-- Problem: messages, conversations, leads, tenants had NO RLS. The dashboard
-- browser client uses the ANON key and queries these tables directly (and in
-- several places scopes only by `id`, not tenant_id). Without RLS, any
-- authenticated user could read or modify ANOTHER tenant's chats / leads.
--
-- Fix: enable RLS + a standard tenant-isolation policy on every public table
-- that has a `tenant_id` column, plus the `tenants` table itself (keyed by id).
--
-- Safe because:
--   • service_role (used by supabaseAdmin in all server routes / webhook) has
--     BYPASSRLS — every server-side query keeps working unchanged.
--   • Authenticated browser clients get auth.uid() in the JWT, so
--     public.get_current_tenant_id() resolves their tenant. They can only
--     see/modify their own tenant's rows.
--   • Realtime (postgres_changes) honours these policies, so the existing
--     per-tenant subscriptions keep delivering only this tenant's events.
--
-- Idempotent: re-running is a no-op (guards on pg_policies / relrowsecurity).
-- Requires: public.get_current_tenant_id() (from 20260518_fix_rls_recursion.sql).
-- ════════════════════════════════════════════════════════════════════════

-- 0. Ensure the tenant resolver exists (defensive — should already be present).
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_current_tenant_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_id() TO authenticated, service_role;

-- 1. Catch-all: every public table that has a tenant_id column gets RLS + a
--    standard isolation policy (if it doesn't already have one).
DO $rls$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'tenant_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    -- Enable RLS (no-op if already enabled)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', rec.table_name);

    -- Create a standard tenant-isolation policy only if none named the same exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = rec.table_name
        AND policyname = 'tenant_isolation_core'
    ) THEN
      EXECUTE format($f$
        CREATE POLICY "tenant_isolation_core" ON public.%I
          FOR ALL
          TO authenticated
          USING (tenant_id = public.get_current_tenant_id())
          WITH CHECK (tenant_id = public.get_current_tenant_id());
      $f$, rec.table_name);
    END IF;
  END LOOP;
END
$rls$;

-- 2. The tenants table is keyed by `id` (not tenant_id) — handle explicitly.
--    Holds WhatsApp tokens + business config; must never be cross-readable.
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DO $tenants$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tenants'
      AND policyname = 'tenant_self_isolation'
  ) THEN
    CREATE POLICY "tenant_self_isolation" ON public.tenants
      FOR ALL
      TO authenticated
      USING (id = public.get_current_tenant_id())
      WITH CHECK (id = public.get_current_tenant_id());
  END IF;
END
$tenants$;

-- 3. Verification helper (run manually after applying):
--    SELECT relname, relrowsecurity
--    FROM pg_class
--    WHERE relname IN ('messages','conversations','leads','tenants');
--    -- relrowsecurity must be TRUE for all four.
