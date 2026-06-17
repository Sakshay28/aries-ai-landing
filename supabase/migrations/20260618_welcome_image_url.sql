-- Add welcome_image_url column to tenants table
-- Stores the URL of an optional image sent before the welcome text message
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS welcome_image_url TEXT DEFAULT NULL;

COMMENT ON COLUMN tenants.welcome_image_url IS 'Public URL of an image sent before the welcome text message on first contact';
