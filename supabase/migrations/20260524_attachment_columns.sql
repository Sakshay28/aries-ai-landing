-- ═══════════════════════════════════════════════════════
-- Chat Attachments Migration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- ═══════════════════════════════════════════════════════

-- 1. Add media columns to messages table
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_url      TEXT,
  ADD COLUMN IF NOT EXISTS file_name      TEXT,
  ADD COLUMN IF NOT EXISTS file_size      BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type      TEXT,
  ADD COLUMN IF NOT EXISTS media_caption  TEXT;

-- 2. Update content constraint to allow empty string for media messages
--    (media messages may have no text content)
ALTER TABLE messages
  ALTER COLUMN content SET DEFAULT '';

-- 3. Index for media messages lookup
CREATE INDEX IF NOT EXISTS idx_messages_media ON messages(conversation_id)
  WHERE media_url IS NOT NULL;

-- Done! 
SELECT 'Migration complete ✅' AS result;
