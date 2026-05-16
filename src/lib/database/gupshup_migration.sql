-- ═══════════════════════════════════════════════════════════
-- 🔄 Gupshup Migration — Add Gupshup credentials to tenants
-- ═══════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor ONCE.
-- Adds Gupshup API fields alongside existing Meta WA fields.
-- ═══════════════════════════════════════════════════════════

-- Add Gupshup credentials columns to tenants table
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS gupshup_api_key TEXT,
  ADD COLUMN IF NOT EXISTS gupshup_phone_number TEXT,  -- e.g. "919876543210" (no + prefix)
  ADD COLUMN IF NOT EXISTS gupshup_app_name TEXT;

-- Create index for fast webhook routing by Gupshup phone number
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_gupshup_phone
  ON tenants(gupshup_phone_number)
  WHERE gupshup_phone_number IS NOT NULL;

-- ── Helper RPC for safe message count increment on conversations ──
-- Call this after inserting a new message to keep message_count in sync.
CREATE OR REPLACE FUNCTION increment_message_count_conv(conv_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE conversations
  SET message_count = message_count + 1
  WHERE id = conv_id;
$$;
