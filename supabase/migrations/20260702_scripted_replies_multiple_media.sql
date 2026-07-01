-- Add media_urls column to scripted_replies table to support multiple media attachments (e.g. food and bar menu PDFs)
ALTER TABLE scripted_replies
  ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';

-- Migrate existing single media_url values to the new media_urls array
UPDATE scripted_replies
  SET media_urls = ARRAY[media_url]
  WHERE media_url IS NOT NULL AND (media_urls IS NULL OR cardinality(media_urls) = 0);

COMMENT ON COLUMN scripted_replies.media_urls IS 'Array of public URLs for media attachments to send with this reply';
