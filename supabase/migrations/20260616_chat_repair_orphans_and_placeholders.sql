-- ══════════════════════════════════════════════════════════════════════════
-- 20260616_chat_repair_orphans_and_placeholders.sql
-- Forensic chat audit — data repair for the two P0 bugs fixed in code.
-- SAFE TO RUN MULTIPLE TIMES (idempotent).
--
-- Companion to the code fixes:
--   • webhook conversation lookup is now is_active-agnostic (no more orphan threads)
--   • follow-up engine now stores the delivered copy (no more "[follow_up_template:*]")
--
-- This migration cleans up the rows those bugs already left in the database.
-- service_role / SQL editor bypasses RLS — run it in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════════════════

-- ── STEP 1: Replace legacy follow-up placeholder tokens with readable copy ───
-- The dashboard already renders these gracefully, but normalize the stored data
-- so previews, search and exports never surface the raw token again.
UPDATE messages
SET content = 'Follow-up reminder sent'
WHERE content ~ '^\[follow_up_template:.+\]$';

-- ── STEP 2: Consolidate duplicate / orphaned conversations per contact ───────
-- Group by tenant + DIGITS-ONLY phone so "+91…" and "91…" variants merge. Keep
-- the OLDEST thread (canonical, holds the history), reassign every message to it,
-- deactivate the husks, then reactivate ONLY the canonical so the unique partial
-- index (tenant_id, sender_id) WHERE is_active=true is never violated.
DO $$
DECLARE
  dup RECORD;
  keep_id UUID;
BEGIN
  FOR dup IN (
    SELECT tenant_id,
           regexp_replace(sender_id, '\D', '', 'g') AS norm_phone,
           ARRAY_AGG(id ORDER BY created_at ASC) AS ids
    FROM conversations
    WHERE sender_id IS NOT NULL AND sender_id <> ''
    GROUP BY tenant_id, regexp_replace(sender_id, '\D', '', 'g')
    HAVING COUNT(*) > 1
  )
  LOOP
    keep_id := dup.ids[1];

    UPDATE messages
    SET conversation_id = keep_id
    WHERE conversation_id = ANY(dup.ids)
      AND conversation_id <> keep_id;

    UPDATE conversations SET is_active = false WHERE id = ANY(dup.ids);

    UPDATE conversations
    SET is_active = true,
        last_message_at = COALESCE(
          (SELECT MAX(created_at) FROM messages WHERE conversation_id = keep_id),
          last_message_at
        )
    WHERE id = keep_id;

    RAISE NOTICE 'Consolidated % thread(s) for %**** → kept %',
      array_length(dup.ids, 1) - 1, LEFT(dup.norm_phone, 5), keep_id;
  END LOOP;
END $$;

-- ── STEP 3: Reconcile message_count drift ────────────────────────────────────
-- The increment RPC + message reassignment had decoupled this column from reality
-- (observed: an empty conversation showing message_count=95). Rebuild from truth.
UPDATE conversations c
SET message_count = sub.cnt
FROM (
  SELECT conversation_id, COUNT(*)::int AS cnt
  FROM messages
  GROUP BY conversation_id
) sub
WHERE c.id = sub.conversation_id
  AND c.message_count IS DISTINCT FROM sub.cnt;

UPDATE conversations c
SET message_count = 0
WHERE c.message_count IS DISTINCT FROM 0
  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id);

-- ── STEP 4: Verification (all should read ✅) ────────────────────────────────
SELECT 'Remaining [follow_up_template:*] messages' AS check_name,
       COUNT(*) AS count,
       CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END AS status
FROM messages WHERE content ~ '^\[follow_up_template:.+\]$';

SELECT 'Contacts with >1 ACTIVE thread (index-evading dupes)' AS check_name,
       COUNT(*) AS count,
       CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END AS status
FROM (
  SELECT tenant_id, regexp_replace(sender_id, '\D', '', 'g') AS p
  FROM conversations
  WHERE is_active = true AND sender_id IS NOT NULL
  GROUP BY tenant_id, regexp_replace(sender_id, '\D', '', 'g')
  HAVING COUNT(*) > 1
) sub;

SELECT 'Conversations whose message_count <> real count' AS check_name,
       COUNT(*) AS count,
       CASE WHEN COUNT(*) = 0 THEN '✅ PASS' ELSE '❌ FAIL' END AS status
FROM conversations c
LEFT JOIN (SELECT conversation_id, COUNT(*)::int cnt FROM messages GROUP BY conversation_id) m
  ON m.conversation_id = c.id
WHERE COALESCE(c.message_count, 0) <> COALESCE(m.cnt, 0);
