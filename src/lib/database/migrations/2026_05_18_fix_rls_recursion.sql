-- ═══════════════════════════════════════════════════════════
-- 🔒 Migration: Fix RLS infinite recursion (2026-05-18)
-- ═══════════════════════════════════════════════════════════
-- The previous policies referenced
--   tenant_id IN (SELECT tenant_id FROM users WHERE auth_id = auth.uid())
-- The inner SELECT against `users` re-triggers the same `users` policy
-- (which itself contains a subquery against `users`), causing Postgres
-- to abort with `42P17: infinite recursion detected in policy`.
--
-- Fix: rebuild every tenant-scoped policy on top of a SECURITY DEFINER
-- helper, public.get_current_tenant_id(), which BYPASSES RLS while
-- still being scoped to the calling auth.uid(). Also collapse the
-- self-referential users policy down to a simple `auth.uid() = auth_id`
-- check.
--
-- Robust to schema drift: every table-specific block is wrapped in a
-- `to_regclass` check so the migration succeeds even on databases that
-- never created the optional tables (shopify_events, follow_ups, etc.).
--
-- Run this once in the Supabase SQL editor against an existing
-- database. It is idempotent.
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Rebuild the helper function ──────────────────────────
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
GRANT EXECUTE ON FUNCTION public.get_current_tenant_id()
  TO authenticated, service_role;

-- ── 2. Rebuild policies, skipping tables that don't exist ───
DO $migration$
DECLARE
  -- (table_name, policy_name, condition_column)
  -- condition_column = 'tenant_id' for all tenant-scoped tables,
  --                  = 'id'        for the tenants table itself.
  rec RECORD;
BEGIN
  -- ── Users table: non-recursive self-row policy ──
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.users ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users see own tenant" ON public.users';
    EXECUTE 'DROP POLICY IF EXISTS "Users see own row"    ON public.users';
    EXECUTE $sql$
      CREATE POLICY "Users see own row" ON public.users
        FOR ALL USING (auth.uid() = auth_id)
        WITH CHECK (auth.uid() = auth_id)
    $sql$;
  END IF;

  -- ── Tenant-scoped tables: same shape, only column differs ──
  FOR rec IN
    SELECT * FROM (VALUES
      ('public.leads',            'Leads scoped to tenant',           'tenant_id'),
      ('public.conversations',    'Conversations scoped to tenant',   'tenant_id'),
      ('public.messages',         'Messages scoped to tenant',        'tenant_id'),
      ('public.follow_ups',       'Follow-ups scoped to tenant',      'tenant_id'),
      ('public.bookings',         'Bookings scoped to tenant',        'tenant_id'),
      ('public.shopify_events',   'Shopify events scoped to tenant',  'tenant_id'),
      ('public.analytics_events', 'Analytics scoped to tenant',       'tenant_id'),
      ('public.tenants',          'Tenant owners see own tenant',     'id')
    ) AS t(tbl, policy, col)
  LOOP
    IF to_regclass(rec.tbl) IS NULL THEN
      RAISE NOTICE 'Skipping %: table does not exist on this database', rec.tbl;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', rec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', rec.policy, rec.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %s FOR ALL USING (%I = public.get_current_tenant_id()) WITH CHECK (%I = public.get_current_tenant_id())',
      rec.policy, rec.tbl, rec.col, rec.col
    );
    RAISE NOTICE 'Rebuilt policy % on %', rec.policy, rec.tbl;
  END LOOP;
END
$migration$;

COMMIT;

-- ── 3. Verification queries (run separately as service role) ──
-- 1) Helper function exists and is SECURITY DEFINER:
--    SELECT proname, prosecdef, provolatile
--    FROM pg_proc WHERE proname = 'get_current_tenant_id';
--
-- 2) All expected policies exist:
--    SELECT tablename, policyname FROM pg_policies
--    WHERE schemaname = 'public' ORDER BY tablename;
--
-- 3) From an authenticated browser session, hitting Supabase REST:
--    GET /rest/v1/leads?select=id&limit=1
--    Expected: 200 OK with [] or rows. NOT 42P17.
