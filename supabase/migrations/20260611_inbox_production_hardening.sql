-- ══════════════════════════════════════════════════════════════════════════
-- ARIES AI INBOX — Production Hardening Migration (v2 — constraint-aware)
-- Date: 2026-06-11
-- SAFE TO RUN MULTIPLE TIMES
-- ══════════════════════════════════════════════════════════════════════════


-- ── STEP 1: Performance indexes ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_conversations_active_lookup
  ON conversations (tenant_id, sender_id, is_active, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_active_recent
  ON conversations (tenant_id, last_message_at DESC NULLS LAST)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_messages_tenant_conv_created
  ON messages (tenant_id, conversation_id, created_at DESC);


-- ── STEP 2: Merge all existing duplicate conversations ───────────────────────
-- There is already a unique constraint on (tenant_id, sender_id) WHERE is_active = true.
-- Strategy: DEACTIVATE ALL rows for a sender first, then reactivate only the keeper.
-- This avoids any unique-constraint conflicts during the migration.

DO $$
DECLARE
  dup RECORD;
  keep_id UUID;
  dup_ids UUID[];
  merged_count INTEGER := 0;
  total_groups INTEGER := 0;
BEGIN
  RAISE NOTICE '━━━ Aries AI Inbox Deduplication Migration v2 ━━━';

  SELECT COUNT(*) INTO total_groups
  FROM (
    SELECT tenant_id, sender_id
    FROM conversations
    GROUP BY tenant_id, sender_id
    HAVING COUNT(*) > 1
  ) sub;

  RAISE NOTICE 'Found % contact(s) with duplicate conversations', total_groups;

  FOR dup IN (
    SELECT
      tenant_id,
      sender_id,
      COUNT(*) as cnt,
      ARRAY_AGG(id ORDER BY created_at ASC) as conv_ids
    FROM conversations
    GROUP BY tenant_id, sender_id
    HAVING COUNT(*) > 1
    ORDER BY tenant_id, sender_id
  )
  LOOP
    keep_id := dup.conv_ids[1];                                          -- oldest = canonical
    dup_ids := dup.conv_ids[2:array_length(dup.conv_ids, 1)];           -- rest are duplicates

    -- A) Reassign ALL messages from duplicates → keeper
    UPDATE messages
    SET conversation_id = keep_id
    WHERE conversation_id = ANY(dup.conv_ids)   -- includes keep_id so nothing is missed
      AND conversation_id != keep_id;

    -- B) DEACTIVATE EVERY conversation for this sender first
    --    (avoids unique-constraint conflict when we reactivate the keeper)
    UPDATE conversations
    SET is_active = false
    WHERE tenant_id = dup.tenant_id
      AND sender_id = dup.sender_id;

    -- C) Now safely reactivate only the keeper (no other active row exists now)
    UPDATE conversations
    SET is_active        = true,
        last_message_at  = (
          SELECT MAX(created_at) FROM messages WHERE conversation_id = keep_id
        )
    WHERE id = keep_id;

    merged_count := merged_count + array_length(dup_ids, 1);
    RAISE NOTICE 'Merged % duplicate(s) for sender % → kept conversation %',
      array_length(dup_ids, 1),
      LEFT(dup.sender_id, 5) || '****',
      keep_id;
  END LOOP;

  RAISE NOTICE '✅ Done — merged % duplicate conversation row(s)', merged_count;
END $$;


-- ── STEP 3: Unique partial index (skip if constraint already exists) ──────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_active_contact
  ON conversations (tenant_id, sender_id)
  WHERE is_active = true;


-- ── STEP 4: Create whatsapp-media storage bucket ─────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('whatsapp-media', 'whatsapp-media', true, 52428800)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 52428800;


-- ── STEP 5: Storage RLS policies ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'WhatsApp media public read'
  ) THEN
    CREATE POLICY "WhatsApp media public read" ON storage.objects
      FOR SELECT USING (bucket_id = 'whatsapp-media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'WhatsApp media service write'
  ) THEN
    CREATE POLICY "WhatsApp media service write" ON storage.objects
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;


-- ── STEP 6: Verification — all 3 queries should show ✅ ──────────────────────

SELECT
  'Remaining active duplicates' AS check_name,
  COUNT(*) AS count,
  CASE WHEN COUNT(*) = 0 THEN '✅ PASS — no duplicates' ELSE '❌ FAIL' END AS status
FROM (
  SELECT tenant_id, sender_id
  FROM conversations
  WHERE is_active = true
  GROUP BY tenant_id, sender_id
  HAVING COUNT(*) > 1
) sub;

SELECT indexname, '✅ exists' AS status
FROM pg_indexes
WHERE indexname IN (
  'idx_conversations_unique_active_contact',
  'idx_messages_conversation_created',
  'idx_conversations_active_lookup',
  'idx_conversations_tenant_active_recent'
)
ORDER BY indexname;

SELECT id, public, file_size_limit, '✅ bucket ready' AS status
FROM storage.buckets
WHERE id = 'whatsapp-media';
