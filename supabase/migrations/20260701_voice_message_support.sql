-- ═══════════════════════════════════════════════════════════════════
-- Voice Message Support — 2026-07-01
-- ═══════════════════════════════════════════════════════════════════
-- Root cause: The messages.message_type CHECK constraint was missing
-- 'voice' and 'sticker', causing WhatsApp voice notes (type='voice')
-- to fail the DB INSERT with a 23514 constraint violation. They were
-- silently dropped — never saved, never visible in the inbox.
--
-- This migration also adds duration_secs so voice note length can be
-- displayed before playback starts.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Drop the old CHECK constraint that is missing 'voice' and 'sticker'
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_message_type_check;

-- 2. Add the corrected constraint with all types the webhook can produce
ALTER TABLE messages
  ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN (
    'text', 'interactive', 'template',
    'image', 'video', 'audio', 'voice', 'sticker',
    'document', 'location', 'reaction', 'unsupported'
  ));

-- 3. Add duration column — filled client-side after audio loads;
--    server-side backfill possible later via ffprobe
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS duration_secs FLOAT;

-- 4. Index for fast media lookups by tenant (e.g. admin media health page)
CREATE INDEX IF NOT EXISTS idx_messages_media_url_not_null
  ON messages (tenant_id, created_at DESC)
  WHERE media_url IS NOT NULL;

-- 5. Update schema.sql comment (non-executable; tracked for documentation)
-- MessageType now includes: text | interactive | template | image | video |
--   audio | voice | sticker | document | location | reaction | unsupported
