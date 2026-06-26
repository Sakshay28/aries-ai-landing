-- Add metadata JSONB column to messages for storing interactive payloads
-- (buttons, list rows, header, footer) so the Live Chat can render them.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

COMMENT ON COLUMN messages.metadata IS 'Interactive payload: buttons, list rows, header/footer for WhatsApp interactive messages';
