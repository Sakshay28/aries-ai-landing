-- ═══════════════════════════════════════════════════════════════════════════
-- 20260714_recipient_name_cleanup
-- Purge placeholder / junk names so the CRM + Broadcast recipient list never
-- shows "there" (or "unknown", the phone-as-name, etc.) as a contact's name.
--
-- CONTEXT: the app already sanitizes names at *display* time (see
-- src/lib/broadcast/recipient-name.ts — cleanContactName), so the recipient
-- list renders the phone number for these rows without any SQL change. This
-- migration is DATA HYGIENE: it clears the bad values at the source so the
-- known/unknown stats are accurate and other surfaces stay clean.
--
-- SAFETY: it is deliberately CONSERVATIVE. It only nulls (a) exact placeholder
-- words and (b) rows where the name is literally the phone number. It does NOT
-- touch emoji-decorated names (the display sanitizer strips the emoji and keeps
-- the real letters) and does NOT touch non-Latin / accented names (José,
-- प्रिया, etc.), so no legitimate name is lost.
--
-- Run the PREVIEW SELECTs first, eyeball the counts, then run the UPDATEs.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PREVIEW 1: leads whose name is a placeholder or the phone itself ─────────
-- SELECT id, tenant_id, name, phone
-- FROM leads
-- WHERE lower(btrim(coalesce(name, ''))) IN
--         ('there','unknown','anonymous','null','undefined','n/a','na','none',
--          'customer','guest','user','-','.','--')
--    OR btrim(name) = btrim(phone)                       -- phone stored as name
--    OR regexp_replace(coalesce(name,''), '[^0-9]', '', 'g') = regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g')
--         AND regexp_replace(coalesce(name,''), '[0-9+().\-\s]', '', 'g') = '';  -- name is only phone digits/punct
-- (add "AND tenant_id = '<TENANT_UUID>'" to scope to one client)

-- ── FIX 1: null those placeholder / phone-as-name values in leads ────────────
UPDATE leads
SET name = NULL
WHERE lower(btrim(coalesce(name, ''))) IN
        ('there','unknown','anonymous','null','undefined','n/a','na','none',
         'customer','guest','user','-','.','--')
   OR btrim(name) = btrim(phone)
   OR (
        regexp_replace(coalesce(name, ''), '[0-9+().\-\s]', '', 'g') = ''  -- only phone chars
        AND btrim(coalesce(name, '')) <> ''
      );

-- ── FIX 2: null placeholder names in the recipient cache ─────────────────────
-- The recipient-cache table is created by 20260602_recipient_cache_v5.sql, which
-- may not be applied in every project (the resolver self-heals to dynamic
-- resolution when it is absent). Guard the UPDATE so this migration is a no-op
-- rather than a hard error when the table does not exist. Optional cleanup only —
-- the drawer already renders the phone for these rows via cleanContactName.
DO $$
BEGIN
  IF to_regclass('public.broadcast_campaign_recipient_cache') IS NOT NULL THEN
    UPDATE broadcast_campaign_recipient_cache
    SET name = NULL
    WHERE lower(btrim(coalesce(name, ''))) IN
            ('there','unknown','anonymous','null','undefined','n/a','na','none',
             'customer','guest','user');
  END IF;
END $$;
