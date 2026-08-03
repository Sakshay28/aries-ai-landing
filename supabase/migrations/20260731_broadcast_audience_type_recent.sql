-- ═══════════════════════════════════════════════════════════
-- Broadcast Fix: 2026-07-31
-- Add 'recent' to broadcast_audiences.audience_type check constraint.
--
-- The "Recently Added" audience option (AudienceBuilder.tsx, wired into
-- the save API's zod schema since its introduction) was never given a
-- matching DB migration. Every save while that audience type was selected
-- 500'd with 23514 (check constraint violation), which silently blocked
-- both autosave (looked like "Save failed" in the campaign name pill) and
-- Launch (handleLaunch's `if (!savedId) throw` fired before the launch
-- API was ever called, so clicking Launch appeared to do nothing).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE broadcast_audiences
  DROP CONSTRAINT IF EXISTS broadcast_audiences_audience_type_check;

ALTER TABLE broadcast_audiences
  ADD CONSTRAINT broadcast_audiences_audience_type_check
    CHECK (audience_type IN ('all', 'tags', 'custom', 'retarget', 'csv', 'manual', 'recent'));
