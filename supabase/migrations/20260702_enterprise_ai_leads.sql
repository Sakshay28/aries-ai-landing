-- ═══════════════════════════════════════════════════════════
-- Enterprise AI Lead Scoring & Pipeline Classification Rebuild
-- Migration: 20260702_enterprise_ai_leads.sql
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Widen lead_status check constraint ─────────────────────────────────────
-- Drop any old status constraint that limits the stages to cold/warm/hot etc.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_lead_status_check;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS check_lead_status;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE leads 
  ADD CONSTRAINT leads_lead_status_check 
  CHECK (lead_status IN ('new', 'interested', 'warm', 'hot', 'cold', 'qualified', 'converted', 'lost'));

-- ── 2. Add New Enterprise CRM AI Columns to Leads ─────────────────────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS ai_reason TEXT,
  ADD COLUMN IF NOT EXISTS buying_intent INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_intent TEXT,
  ADD COLUMN IF NOT EXISTS last_ai_scan TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recommended_action TEXT,
  ADD COLUMN IF NOT EXISTS qualification_status TEXT,
  ADD COLUMN IF NOT EXISTS booking_probability INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS human_intervention_probability INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_type TEXT,
  ADD COLUMN IF NOT EXISTS last_customer_message TEXT,
  ADD COLUMN IF NOT EXISTS sentiment TEXT,
  ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversation_depth INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_stage TEXT,
  ADD COLUMN IF NOT EXISTS ai_stage TEXT,
  ADD COLUMN IF NOT EXISTS classification_version TEXT DEFAULT '2.0';

-- Index for fast score sorting on the Kanban board / Analytics
CREATE INDEX IF NOT EXISTS idx_leads_ai_score ON leads(tenant_id, ai_score DESC);

-- ── 3. Partial Unique Index on ai_jobs for Debouncing ────────────────────────
-- Enforces that at most one job is active/pending per conversation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_jobs_pending_conv 
  ON ai_jobs(conversation_id) 
  WHERE status IN ('pending', 'retry', 'processing');

-- ── 4. Trigger Function for Auto-Reclassification ────────────────────────────
CREATE OR REPLACE FUNCTION public.enqueue_ai_job_on_event()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_tenant_id UUID;
  v_lead_id UUID;
  v_conv_id UUID;
  v_message_id TEXT := NULL;
  v_priority INT := 5;
  v_trigger_type TEXT := 'message';
BEGIN
  -- ── Handle Messages Table trigger ──
  IF TG_TABLE_NAME = 'messages' THEN
    -- Ignore reactions or metadata only messages
    IF NEW.message_type = 'reaction' THEN
      RETURN NEW;
    END IF;
    
    SELECT tenant_id, lead_id INTO v_tenant_id, v_lead_id
    FROM conversations
    WHERE id = NEW.conversation_id;
    
    v_conv_id := NEW.conversation_id;
    v_message_id := NEW.id::text;
    v_trigger_type := 'message';
    
  -- ── Handle Bookings Table trigger ──
  ELSIF TG_TABLE_NAME = 'bookings' THEN
    v_tenant_id := NEW.tenant_id;
    v_lead_id := NEW.lead_id;
    v_trigger_type := 'status_change';
    
    SELECT id INTO v_conv_id
    FROM conversations
    WHERE lead_id = NEW.lead_id AND is_active = true
    LIMIT 1;
    
  -- ── Handle Shopify Events Table trigger ──
  ELSIF TG_TABLE_NAME = 'shopify_events' THEN
    v_tenant_id := NEW.tenant_id;
    v_lead_id := NEW.lead_id;
    v_trigger_type := 'status_change';
    
    SELECT id INTO v_conv_id
    FROM conversations
    WHERE lead_id = NEW.lead_id AND is_active = true
    LIMIT 1;
    
  -- ── Handle Leads Table trigger (Tags or Notes change) ──
  ELSIF TG_TABLE_NAME = 'leads' THEN
    IF TG_OP = 'UPDATE' THEN
      IF (OLD.tags IS NOT DISTINCT FROM NEW.tags) AND (OLD.notes IS NOT DISTINCT FROM NEW.notes) THEN
        RETURN NEW;
      END IF;
    END IF;
    
    v_tenant_id := NEW.tenant_id;
    v_lead_id := NEW.id;
    v_trigger_type := 'status_change';
    
    SELECT id INTO v_conv_id
    FROM conversations
    WHERE lead_id = NEW.id AND is_active = true
    LIMIT 1;
  END IF;

  -- Ensure we have valid identifiers before enqueuing
  IF v_tenant_id IS NOT NULL AND v_lead_id IS NOT NULL AND v_conv_id IS NOT NULL THEN
    INSERT INTO ai_jobs (
      tenant_id, lead_id, conversation_id, message_id, status, priority, trigger_type, enqueued_at, idempotency_key
    ) VALUES (
      v_tenant_id, v_lead_id, v_conv_id, v_message_id, 'pending', v_priority, v_trigger_type, NOW(), COALESCE(v_message_id, gen_random_uuid()::text)
    )
    ON CONFLICT (conversation_id) WHERE status IN ('pending', 'retry', 'processing')
    DO UPDATE SET
      enqueued_at = NOW(),
      message_id = COALESCE(EXCLUDED.message_id, ai_jobs.message_id);
  END IF;

  RETURN NEW;
END;
$$;

-- ── 5. Attach Triggers ────────────────────────────────────────────────────────
-- Messages trigger (enqueues rescoring for incoming, outgoing, human, bot replies)
DROP TRIGGER IF EXISTS trg_enqueue_ai_job_on_message ON public.messages;
CREATE TRIGGER trg_enqueue_ai_job_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_ai_job_on_event();

-- Bookings trigger (reclassifies lead when booking status updates/created)
DROP TRIGGER IF EXISTS trg_enqueue_ai_job_on_booking ON public.bookings;
CREATE TRIGGER trg_enqueue_ai_job_on_booking
  AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_ai_job_on_event();

-- Shopify trigger (reclassifies lead on orders/cart events)
DROP TRIGGER IF EXISTS trg_enqueue_ai_job_on_shopify ON public.shopify_events;
CREATE TRIGGER trg_enqueue_ai_job_on_shopify
  AFTER INSERT ON public.shopify_events
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_ai_job_on_event();

-- Leads trigger (reclassifies when tags or notes change)
DROP TRIGGER IF EXISTS trg_enqueue_ai_job_on_lead_change ON public.leads;
CREATE TRIGGER trg_enqueue_ai_job_on_lead_change
  AFTER UPDATE OF tags, notes ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_ai_job_on_event();

COMMIT;
