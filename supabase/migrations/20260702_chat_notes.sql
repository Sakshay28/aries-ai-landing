-- Migration: Chat Notes System
-- Creates the `notes` table for storing conversation notes, enables RLS, sets up indexes, and configures realtime sync.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  contact_id      UUID        NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  created_by      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name TEXT        NOT NULL DEFAULT 'Agent',
  text            TEXT        NOT NULL,
  idempotency_key VARCHAR(100) UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_notes_tenant_id ON public.notes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notes_conversation_created ON public.notes (conversation_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policy
DROP POLICY IF EXISTS "notes_tenant_isolation" ON public.notes;
DROP POLICY IF EXISTS "tenant_isolation_core" ON public.notes;
CREATE POLICY "tenant_isolation_core" ON public.notes
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

-- Triggers: auto-update updated_at on modify
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notes_updated ON public.notes;
CREATE TRIGGER trg_notes_updated
    BEFORE UPDATE ON public.notes
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add to Realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'notes'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notes;
    END IF;
  END IF;
END $$;

COMMIT;
