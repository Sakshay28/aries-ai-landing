-- Migration: Add system_prompt to tenants
-- This stores the custom Staff Guidelines for the AI agent

BEGIN;

ALTER TABLE tenants 
  ADD COLUMN IF NOT EXISTS system_prompt TEXT;

COMMENT ON COLUMN tenants.system_prompt IS 'Custom Staff Guidelines instructions for the AI bot';

COMMIT;
