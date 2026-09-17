// Browser-safe: where the dashboard loads a message's media from.
//
// Persisted media is always requested through the authenticated, tenant-scoped
// /api/media/{id}/stream route, which redirects to a short-lived signed URL —
// never the raw messages.media_url, which for private buckets is only a
// reference. Optimistic bubbles keep their local blob: preview.

import type { Message } from '@/lib/types';

export function mediaStreamPath(messageId: string): string {
  return `/api/media/${encodeURIComponent(messageId)}/stream`;
}

export function renderableMediaSrc(msg: Pick<Message, 'id' | 'media_url' | 'message_type'>): string | null {
  if (!msg.media_url) return null;
  if (msg.id.startsWith('__optimistic__') || msg.media_url.startsWith('blob:')) return msg.media_url;
  // Location rows reuse media_url for a Google Maps link — not a stored object.
  if (msg.message_type === 'location') return msg.media_url;
  return mediaStreamPath(msg.id);
}
