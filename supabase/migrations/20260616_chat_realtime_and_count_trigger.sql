-- ══════════════════════════════════════════════════════════════════════════
-- 20260616_chat_realtime_and_count_trigger.sql
-- Production hardening uncovered by the forensic chat audit (2026-06-16).
-- Requires raw SQL — RUN IN THE SUPABASE SQL EDITOR. Idempotent.
--
-- Fixes two non-P0 reliability gaps:
--   1. Supabase Realtime was never enabled for messages/conversations, so the
--      dashboard silently depended on 2s polling. Enable the publication +
--      REPLICA IDENTITY FULL so live INSERT/UPDATE/DELETE events fire (and the
--      conversation_id filter on UPDATE/DELETE works).
--   2. conversations.message_count drifted because only the inbound webhook path
--      incremented it (AI replies, follow-ups, manual sends, reassignment did
--      not). Replace the ad-hoc increments with a trigger that is always correct,
--      regardless of which code path writes a message.
-- ══════════════════════════════════════════════════════════════════════════

-- ── PART 1: Realtime ─────────────────────────────────────────────────────────
ALTER TABLE public.messages      REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;

-- ── PART 2: message_count trigger (single source of truth) ───────────────────
CREATE OR REPLACE FUNCTION public.sync_conversation_message_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE conversations SET message_count = COALESCE(message_count,0) + 1
      WHERE id = NEW.conversation_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE conversations SET message_count = GREATEST(COALESCE(message_count,0) - 1, 0)
      WHERE id = OLD.conversation_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
    -- message reassigned during duplicate-thread consolidation
    UPDATE conversations SET message_count = GREATEST(COALESCE(message_count,0) - 1, 0)
      WHERE id = OLD.conversation_id;
    UPDATE conversations SET message_count = COALESCE(message_count,0) + 1
      WHERE id = NEW.conversation_id;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_sync_conv_message_count ON public.messages;
CREATE TRIGGER trg_sync_conv_message_count
  AFTER INSERT OR UPDATE OF conversation_id OR DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.sync_conversation_message_count();

-- One-time reconcile so the column matches reality the moment the trigger goes live.
UPDATE conversations c SET message_count = COALESCE(sub.cnt, 0)
FROM (SELECT conversation_id, COUNT(*)::int cnt FROM messages GROUP BY conversation_id) sub
WHERE c.id = sub.conversation_id AND c.message_count IS DISTINCT FROM sub.cnt;
UPDATE conversations c SET message_count = 0
WHERE c.message_count IS DISTINCT FROM 0
  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id);

-- ── Verification ─────────────────────────────────────────────────────────────
SELECT tablename, '✅ in realtime publication' AS status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  AND tablename IN ('messages','conversations')
ORDER BY tablename;

SELECT 'message_count drift' AS check_name, COUNT(*) AS count,
       CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END AS status
FROM conversations c
LEFT JOIN (SELECT conversation_id, COUNT(*)::int cnt FROM messages GROUP BY conversation_id) m
  ON m.conversation_id = c.id
WHERE COALESCE(c.message_count,0) <> COALESCE(m.cnt,0);
