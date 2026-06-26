-- Add metadata + raw_webhook JSONB columns to messages for storing
-- interactive payloads and the complete Meta webhook for debugging.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS raw_webhook jsonb DEFAULT NULL;

COMMENT ON COLUMN messages.metadata IS 'Interactive payload: buttons, list rows, header/footer, template info';
COMMENT ON COLUMN messages.raw_webhook IS 'Complete raw Meta webhook message object for debugging';
