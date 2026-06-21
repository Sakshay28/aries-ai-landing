-- ════════════════════════════════════════════════════════════
-- Migration: Automations System
-- Date: 2026-06-21
-- Description: Event-triggered automated messages with
--   configurable delays. Tenants create rules (automations)
--   and the system queues/sends messages via cron or inline.
-- ════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════
-- Table 1: automations (rule definitions)
-- ════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS automations (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name              TEXT          NOT NULL,
  trigger_event     TEXT          NOT NULL
                      CHECK (trigger_event IN (
                        'booking_confirmed',
                        'new_lead',
                        'escalation_triggered',
                        'escalation_resolved',
                        'payment_received'
                      )),
  delay_value       INT           NOT NULL DEFAULT 0,
  delay_unit        TEXT          NOT NULL DEFAULT 'minutes'
                      CHECK (delay_unit IN ('minutes', 'hours', 'days')),
  message_text      TEXT          NOT NULL,
  media_url         TEXT,
  media_type        TEXT          CHECK (media_type IS NULL OR media_type IN ('image', 'video', 'document')),
  status            TEXT          NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'paused')),
  cancel_on_reply   BOOLEAN       NOT NULL DEFAULT true,
  customers_reached INT           NOT NULL DEFAULT 0,
  messages_sent     INT           NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_tenant
  ON automations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_automations_tenant_trigger
  ON automations(tenant_id, trigger_event)
  WHERE status = 'active';

-- ════════════════════════════════════════════════
-- Table 2: automation_queue (scheduled sends)
-- ════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS automation_queue (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id     UUID          NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  tenant_id         UUID          NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id           UUID          NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id   UUID          REFERENCES conversations(id) ON DELETE SET NULL,
  scheduled_at      TIMESTAMPTZ   NOT NULL,
  status            TEXT          NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  sent_at           TIMESTAMPTZ,
  error_message     TEXT,
  wa_message_id     TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_queue_pending
  ON automation_queue(scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_automation_queue_tenant
  ON automation_queue(tenant_id);

CREATE INDEX IF NOT EXISTS idx_automation_queue_lead
  ON automation_queue(lead_id)
  WHERE status = 'pending';

-- ════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_automations" ON automations;
CREATE POLICY "tenant_isolation_automations" ON automations
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

ALTER TABLE automation_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_automation_queue" ON automation_queue;
CREATE POLICY "tenant_isolation_automation_queue" ON automation_queue
  FOR ALL USING (tenant_id = public.get_current_tenant_id())
  WITH CHECK (tenant_id = public.get_current_tenant_id());

COMMIT;
