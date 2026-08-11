-- Migration: escalate_on_unanswered tenant flag
-- Lets a tenant opt in to escalating (shouldEscalate=true) when the AI
-- genuinely doesn't have an answer, instead of the platform default of
-- staying silent (shouldEscalate=false) on "I don't know" replies.
-- Off by default so every existing tenant's behavior is unchanged.
-- See src/lib/ai/engine.ts (tenantConfig.escalateOnUnknownAnswer).

BEGIN;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS escalate_on_unanswered BOOLEAN NOT NULL DEFAULT false;

-- Turn it on for Devprayagjal (259c97b4-7920-4228-bcfe-217ff3a073a4) —
-- the client asked to be alerted whenever the AI can't answer a customer.
UPDATE tenants
  SET escalate_on_unanswered = true
  WHERE id = '259c97b4-7920-4228-bcfe-217ff3a073a4';

COMMIT;
