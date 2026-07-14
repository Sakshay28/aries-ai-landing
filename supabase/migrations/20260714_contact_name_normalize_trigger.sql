-- ═══════════════════════════════════════════════════════════════════════════
-- 20260714_contact_name_normalize_trigger
-- DEFENSE-IN-DEPTH: a database-level guard so a placeholder / junk contact name
-- can NEVER be written to `leads.name` or `conversations.sender_name`, no matter
-- which code path (importer, webhook, API, manual SQL) does the write. Invalid
-- values are coerced to NULL — the app then renders the phone number.
--
-- This mirrors the app-layer single source of truth (cleanContactName in
-- src/lib/utils/contact-name.ts). The two layers are intentionally redundant:
-- the app keeps garbage out of the UI, the trigger keeps garbage out of the DB.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── normalize_contact_name(raw, phone) → clean name or NULL ──────────────────
-- Conservative: only nulls placeholder words, phone-as-name, and values with no
-- letters at all (pure emoji/symbols/digits). Real non-Latin / accented names
-- (José, प्रिया) have letters and are preserved. It does NOT strip decorative
-- emoji from an otherwise-real name (the app display layer handles that) — it
-- only rejects values that are wholly unusable as a name.
CREATE OR REPLACE FUNCTION public.normalize_contact_name(raw text, phone text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v            text;
  ascii_letters text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  v := btrim(raw);
  IF v = '' THEN
    RETURN NULL;
  END IF;

  -- Placeholder words, compared on ASCII letters only so "n/a", "N A",
  -- "there123" etc. all collapse to the same token.
  ascii_letters := lower(regexp_replace(v, '[^a-zA-Z]', '', 'g'));
  IF ascii_letters <> '' AND ascii_letters IN (
       'there','unknown','anonymous','null','undefined','na','none','nil',
       'customer','guest','user','contact','test'
     ) THEN
    RETURN NULL;
  END IF;

  -- Name is literally the phone number (all digits match).
  IF phone IS NOT NULL
     AND btrim(phone) <> ''
     AND regexp_replace(v, '\D', '', 'g') <> ''
     AND regexp_replace(v, '\D', '', 'g') = regexp_replace(phone, '\D', '', 'g') THEN
    RETURN NULL;
  END IF;

  -- No alphabetic character at all (pure symbols / emoji / digits). In a UTF-8
  -- database [[:alpha:]] matches Unicode letters, so accented / Indic names pass.
  IF v !~ '[[:alpha:]]' THEN
    RETURN NULL;
  END IF;

  RETURN raw;
END;
$$;

-- ── leads.name trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leads_normalize_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := public.normalize_contact_name(NEW.name, NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_normalize_name ON public.leads;
CREATE TRIGGER trg_leads_normalize_name
  BEFORE INSERT OR UPDATE OF name ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_normalize_name();

-- ── conversations.sender_name trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.conversations_normalize_sender_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.sender_name := public.normalize_contact_name(NEW.sender_name, NEW.sender_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversations_normalize_sender_name ON public.conversations;
CREATE TRIGGER trg_conversations_normalize_sender_name
  BEFORE INSERT OR UPDATE OF sender_name ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.conversations_normalize_sender_name();

-- ── Sanity checks (optional; run after applying) ─────────────────────────────
-- SELECT public.normalize_contact_name('there', '919876543210');      -- NULL
-- SELECT public.normalize_contact_name('919876543210','919876543210'); -- NULL
-- SELECT public.normalize_contact_name('🌸','919876543210');           -- NULL
-- SELECT public.normalize_contact_name('Priya Sharma','919876543210'); -- 'Priya Sharma'
-- SELECT public.normalize_contact_name('प्रिया','919876543210');        -- 'प्रिया'
