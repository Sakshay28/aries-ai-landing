-- ═══════════════════════════════════════════════════════════════════════════
-- 📎 Broadcast media-header support (2026-07-28)
-- ═══════════════════════════════════════════════════════════════════════════
-- Templates with an IMAGE / VIDEO / DOCUMENT header require a public HTTPS media
-- link on every send. Store the per-campaign header media URL here; the send
-- engine already reads broadcast_campaigns.header_media_url first when building
-- the Meta header component (broadcast-engine.service.ts). Additive + idempotent.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS header_media_url TEXT;
