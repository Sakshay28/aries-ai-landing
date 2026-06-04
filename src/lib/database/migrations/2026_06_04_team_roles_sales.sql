-- ═══════════════════════════════════════════════════════════
-- Team Roles + Sales Team + Per-Tenant Seat Limits
-- Run in Supabase SQL Editor (idempotent & safe to re-run)
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- 1. Widen the users.role check to include 'manager'.
--    Robustly drop whatever role check constraint currently exists,
--    then re-add the widened one. (Inline checks get auto-named, so we
--    discover the name instead of guessing it.)
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'viewer'));

-- 2. Sales-team flag. Members marked here receive auto-assigned leads
--    (Click-to-WhatsApp / Meta-ad leads round-robin among them).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_sales_agent BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_sales ON public.users(tenant_id, is_sales_agent);

-- 3. Per-tenant seat limit (how many team members a workspace can have).
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS seat_limit INT NOT NULL DEFAULT 5;

-- Backfill existing tenants by plan so current customers aren't capped at 5.
UPDATE public.tenants
SET seat_limit = CASE plan
  WHEN 'growth'     THEN 6
  WHEN 'pro'        THEN 12
  WHEN 'enterprise' THEN 25
  ELSE seat_limit
END;

-- 4. Client-specific seats:
--    Globesome needs all 6 members concurrently (2 admin + 1 manager + 3 agents).
UPDATE public.tenants
SET seat_limit = GREATEST(seat_limit, 6)
WHERE business_name ILIKE '%globesome%';

--    Clock Tower restaurant needs 4-5 (default 5 already covers this).
UPDATE public.tenants
SET seat_limit = GREATEST(seat_limit, 5)
WHERE business_name ILIKE '%clock tower%';

COMMIT;

-- ── Verify ──
-- SELECT business_name, plan, seat_limit FROM tenants ORDER BY business_name;
-- SELECT email, role, is_sales_agent FROM users ORDER BY created_at;
