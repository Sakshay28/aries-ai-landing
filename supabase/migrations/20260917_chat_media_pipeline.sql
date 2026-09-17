-- ═══════════════════════════════════════════════════════════
-- Operator media sending (2026-09-17)
-- ═══════════════════════════════════════════════════════════
-- Deploy-safe in either order: the code works before this runs (it pre-checks
-- for an existing row); this makes the guarantees hold under true concurrency
-- and at the storage layer.

-- 1. One storage object → at most one message. The send endpoint is keyed on
--    metadata.media.storage_path; two simultaneous identical requests (double
--    tap, lost response + retry) now collide on this index instead of both
--    delivering. Partial: only inbox attachments carry the key.
CREATE UNIQUE INDEX IF NOT EXISTS messages_chat_media_storage_path_uidx
  ON public.messages (tenant_id, ((metadata -> 'media' ->> 'storage_path')))
  WHERE (metadata -> 'media' ->> 'storage_path') IS NOT NULL;

-- 2. Defence in depth for direct browser uploads: the storage API itself now
--    refuses any type WhatsApp can't receive (the server also re-verifies the
--    bytes before sending). 50 MB matches the existing bucket limit.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png',
      'video/mp4', 'video/3gpp',
      'audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg',
      'application/pdf', 'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ],
    file_size_limit = 52428800
WHERE id = 'chat-attachments';

-- Verify:
--   SELECT indexname FROM pg_indexes WHERE indexname = 'messages_chat_media_storage_path_uidx';
--   SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'chat-attachments';
