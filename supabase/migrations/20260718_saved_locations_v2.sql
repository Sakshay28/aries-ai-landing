-- ════════════════════════════════════════════════════════════════════════
-- 20260718_saved_locations_v2.sql
-- Native WhatsApp Location Message Support with Version Audit History
-- ════════════════════════════════════════════════════════════════════════

-- 1. Create Location Categories Enum
DO $$ BEGIN
  CREATE TYPE location_category_enum AS ENUM (
    'MAIN', 'PARKING', 'VALET', 'PICKUP', 'BANQUET', 'HOTEL', 
    'RECEPTION', 'OFFICE', 'WAREHOUSE', 'DELIVERY', 'VIP', 'CUSTOM'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Create saved_locations table
CREATE TABLE IF NOT EXISTS public.saved_locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id       UUID, -- Nullable branch association for future branch scale
  name            TEXT NOT NULL,
  address         TEXT NOT NULL,
  latitude        DOUBLE PRECISION NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude       DOUBLE PRECISION NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  google_maps_url TEXT NOT NULL, -- Computed or direct Open-in-Maps link
  place_id        TEXT,
  category        location_category_enum NOT NULL DEFAULT 'MAIN',
  priority        INT NOT NULL DEFAULT 0,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at     TIMESTAMPTZ
);

-- 3. Create saved_locations_history for automatic audit version tracking
CREATE TABLE IF NOT EXISTS public.saved_locations_history (
  history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     UUID NOT NULL REFERENCES public.saved_locations(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  address         TEXT NOT NULL,
  latitude        DOUBLE PRECISION NOT NULL,
  longitude       DOUBLE PRECISION NOT NULL,
  version         INT NOT NULL,
  updated_by      UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_saved_locations_tenant ON public.saved_locations(tenant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_saved_locations_category ON public.saved_locations(tenant_id, category) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_saved_locations_history ON public.saved_locations_history(location_id);

-- 5. Auto-update updated_at trigger function (if not already defined)
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

-- 6. Trigger function to insert version audit records automatically on insert or update
CREATE OR REPLACE FUNCTION public.audit_saved_locations_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  next_version INT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.saved_locations_history (
      location_id, tenant_id, name, address, latitude, longitude, version, updated_by, updated_at
    ) VALUES (
      NEW.id, NEW.tenant_id, NEW.name, NEW.address, NEW.latitude, NEW.longitude, 1, NEW.created_by, NEW.created_at
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Get next version number
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_version
    FROM public.saved_locations_history
    WHERE location_id = OLD.id;

    INSERT INTO public.saved_locations_history (
      location_id, tenant_id, name, address, latitude, longitude, version, updated_by, updated_at
    ) VALUES (
      NEW.id, NEW.tenant_id, NEW.name, NEW.address, NEW.latitude, NEW.longitude, next_version, NEW.created_by, NEW.updated_at
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_saved_locations_version ON public.saved_locations;
CREATE TRIGGER trg_audit_saved_locations_version
  AFTER INSERT OR UPDATE ON public.saved_locations
  FOR EACH ROW EXECUTE FUNCTION public.audit_saved_locations_version();

-- 7. RLS isolation policies
ALTER TABLE public.saved_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_locations_history ENABLE ROW LEVEL SECURITY;

DO $rls$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'saved_locations'
      AND policyname = 'tenant_isolation_saved_locations'
  ) THEN
    CREATE POLICY tenant_isolation_saved_locations ON public.saved_locations
      FOR ALL TO authenticated
      USING (tenant_id = public.get_current_tenant_id())
      WITH CHECK (tenant_id = public.get_current_tenant_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'saved_locations_history'
      AND policyname = 'tenant_isolation_saved_locations_history'
  ) THEN
    CREATE POLICY tenant_isolation_saved_locations_history ON public.saved_locations_history
      FOR SELECT TO authenticated
      USING (tenant_id = public.get_current_tenant_id());
  END IF;
END;
$rls$;

-- 8. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_locations TO authenticated;
GRANT SELECT ON public.saved_locations_history TO authenticated;
GRANT ALL ON public.saved_locations TO service_role;
GRANT ALL ON public.saved_locations_history TO service_role;
