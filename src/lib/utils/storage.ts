import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  canTenantReadObject,
  isPublicMediaBucket,
  knowledgeDocRef,
  parseStorageUrl,
  type StorageObjectRef,
} from '@/lib/media/storage-ref';

// Turn a stored media reference into something Meta (or a browser) can fetch.
//
// Accepts a Storage URL from this project (public or signed form) or a bare
// knowledge-docs object path. Returns:
//   • a fresh signed URL — works for private buckets, and WhatsApp Cloud API
//     fetches signed URLs more reliably than public CDN URLs anyway;
//   • the input unchanged when it isn't one of our Storage objects (an
//     external https URL — not ours to sign);
//   • null when the tenant doesn't own the object or it can't be signed.
//     Signing uses the service role, so this ownership check is the only thing
//     stopping a tenant-supplied URL (scripted reply, automation, flow) from
//     exfiltrating another tenant's private customer media.
export async function toSignedMediaUrl(url: string, tenantId: string, ttlSecs = 600): Promise<string | null> {
  if (!url) return null;

  let ref: StorageObjectRef | null;
  if (/^https?:\/\//i.test(url)) {
    ref = parseStorageUrl(url);
    if (!ref) return url;
  } else {
    ref = knowledgeDocRef(url);
    if (!ref) return null;
  }

  if (!canTenantReadObject(tenantId, ref)) {
    console.warn(`[storage] refused to sign ${ref.bucket} object outside tenant ${tenantId}`);
    return null;
  }

  const { data, error } = await supabaseAdmin.storage.from(ref.bucket).createSignedUrl(ref.path, ttlSecs);
  if (error || !data?.signedUrl) {
    // A public-bucket object is still fetchable as-is; a private one is not.
    return isPublicMediaBucket(ref.bucket) && /^https?:\/\//i.test(url) ? url : null;
  }
  return data.signedUrl;
}

// The durable value to persist in messages.media_url for a stored object: the
// canonical object URL. For private buckets it is a reference (not fetchable) —
// the dashboard renders it through /api/media/{id}/stream. Never persist a
// signed URL: it expires (KB media used to show "Image unavailable" after 10 min).
export function storageRefUrl(bucket: string, path: string): string {
  return supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
