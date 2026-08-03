-- ════════════════════════════════════════════════════════════════════════
-- 20260718_saved_locations_and_location_messages.sql
-- Native WhatsApp Location Message Support
--
-- Creates the saved_locations table for businesses to store reusable
-- locations (restaurant, parking, valet, pickup points, etc.).
-- RLS enforced — every tenant can only access their own locations.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Create saved_locations table
CREATE TABLE IF NOT EXISTS public.saved_locations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  address       TEXT NOT NULL,
  latitude      DOUBLE PRECISION NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude     DOUBLE PRECISION NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  google_maps_url TEXT,
  place_id      TEXT,
  category      TEXT NOT NULL DEFAULT 'general',
  created_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_saved_locations_tenant
  ON public.saved_locations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_saved_locations_category
  ON public.saved_locations(tenant_id, category);

-- 3. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.saved_locations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_saved_locations_updated_at ON public.saved_locations;
CREATE TRIGGER trg_saved_locations_updated_at
  BEFORE UPDATE ON public.saved_locations
  FOR EACH ROW EXECUTE FUNCTION public.saved_locations_updated_at();

-- 4. RLS — tenant isolation
ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'saved_locations'
      AND policyname = 'tenant_isolation_saved_locations'
  ) THEN
    EXECUTE format(
      'CREATE POLICY tenant_isolation_saved_locations ON public.saved_locations '
      || 'FOR ALL TO authenticated '
      || 'USING (tenant_id = public.get_current_tenant_id()) '
      || 'WITH CHECK (tenant_id = public.get_current_tenant_id())'
    );
  END IF;
END;
$rls$;

-- 5. Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_locations TO authenticated;
GRANT ALL ON public.saved_locations TO service_role;
