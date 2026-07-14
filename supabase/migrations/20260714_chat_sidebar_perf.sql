-- ══════════════════════════════════════════════════════════════════════════
-- 20260714_chat_sidebar_perf.sql
-- Dashboard chat inbox was lagging badly: /api/dashboard/chat/conversations
-- (run on every 20s poll AND every single realtime message/conversation event
-- tenant-wide) fetched up to 2000 conversations THEN a second query for up to
-- 5000 messages tenant-wide just to compute a preview snippet in JS. That's
-- the dominant cost behind the slow/stuck loading skeleton.
--
-- Fix: maintain last_message_preview / last_message_type on `conversations`
-- via trigger (same pattern as the existing message_count trigger from
-- 20260616_chat_realtime_and_count_trigger.sql), so the sidebar route can
-- read them directly with zero extra message-table scan. Also makes
-- last_message_at trigger-guaranteed (previously only set ad-hoc by whichever
-- app code path wrote the message), matching the message_count trigger's own
-- stated rationale.
--
-- RUN IN THE SUPABASE SQL EDITOR. Idempotent.
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_preview TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_type TEXT;

CREATE OR REPLACE FUNCTION public.sync_conversation_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_preview TEXT;
BEGIN
  v_preview := CASE
    WHEN NEW.content = '__DELETED__' THEN 'You deleted this message'
    WHEN NEW.content ~* '^\[follow_up_template:.+\]$' THEN 'Follow-up reminder sent'
    WHEN NEW.message_type = 'image'    THEN COALESCE('📷 Photo · ' || NEW.media_caption, '📷 Photo')
    WHEN NEW.message_type = 'video'    THEN COALESCE('🎥 Video · ' || NEW.media_caption, '🎥 Video')
    WHEN NEW.message_type = 'audio'    THEN COALESCE('🎵 Audio · ' || NEW.media_caption, '🎵 Audio')
    WHEN NEW.message_type = 'voice'    THEN COALESCE('🎵 Voice message · ' || NEW.media_caption, '🎵 Voice message')
    WHEN NEW.message_type = 'document' THEN COALESCE('📄 Document · ' || NEW.media_caption, '📄 Document')
    WHEN NEW.message_type = 'sticker'  THEN COALESCE('💟 Sticker · ' || NEW.media_caption, '💟 Sticker')
    ELSE NEW.content
  END;

  -- Guard against out-of-order writes (e.g. WhatsApp coexistence historical
  -- import — see project_whatsapp_coexistence): only the row that is actually
  -- the newest message in the conversation gets to set the preview.
  UPDATE conversations
    SET last_message_preview = v_preview,
        last_message_type = NEW.message_type,
        last_message_at = GREATEST(COALESCE(last_message_at, NEW.created_at), NEW.created_at)
    WHERE id = NEW.conversation_id
      AND NEW.created_at = (
        SELECT MAX(created_at) FROM messages WHERE conversation_id = NEW.conversation_id
      );
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_conv_last_message ON public.messages;
CREATE TRIGGER trg_sync_conv_last_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.sync_conversation_last_message();

-- Backfill existing conversations from their actual most recent message.
UPDATE conversations c SET
  last_message_preview = sub.preview,
  last_message_type = sub.message_type
FROM (
  SELECT DISTINCT ON (conversation_id)
    conversation_id,
    CASE
      WHEN content = '__DELETED__' THEN 'You deleted this message'
      WHEN content ~* '^\[follow_up_template:.+\]$' THEN 'Follow-up reminder sent'
      WHEN message_type = 'image'    THEN COALESCE('📷 Photo · ' || media_caption, '📷 Photo')
      WHEN message_type = 'video'    THEN COALESCE('🎥 Video · ' || media_caption, '🎥 Video')
      WHEN message_type = 'audio'    THEN COALESCE('🎵 Audio · ' || media_caption, '🎵 Audio')
      WHEN message_type = 'voice'    THEN COALESCE('🎵 Voice message · ' || media_caption, '🎵 Voice message')
      WHEN message_type = 'document' THEN COALESCE('📄 Document · ' || media_caption, '📄 Document')
      WHEN message_type = 'sticker'  THEN COALESCE('💟 Sticker · ' || media_caption, '💟 Sticker')
      ELSE content
    END AS preview,
    message_type
  FROM messages
  ORDER BY conversation_id, created_at DESC
) sub
WHERE c.id = sub.conversation_id;

-- Speeds up the sidebar's tenant_id + order-by-last_message_at query directly.
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_last_msg ON conversations(tenant_id, last_message_at DESC);
