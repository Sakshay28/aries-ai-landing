// ═══════════════════════════════════════════════════════════
// Storage object references + who may read them
// ═══════════════════════════════════════════════════════════
// messages.media_url (and a few config columns) hold a Supabase Storage URL of
// the form  {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}. For the
// private buckets below that string is no longer fetchable — it is a durable
// REFERENCE that server code turns into a short-lived signed URL on demand.
//
// Signing uses the service role, which bypasses bucket privacy, so every
// signer must first ask canTenantReadObject(): tenant-controlled strings
// (scripted-reply / flow / automation media URLs) could otherwise point at
// another tenant's customer photos. Every object in the private buckets is
// stored under "{tenantId}/…" (verified against production 2026-09-17).

/** Customer and operator media: never publicly readable. */
export const PRIVATE_MEDIA_BUCKETS = ['whatsapp-media', 'chat-attachments', 'knowledge-docs', 'voice-notes'] as const;

/**
 * Business marketing assets that Meta must fetch as plain links — template
 * headers (broadcast queue sends hours after upload), follow-ups, flows and
 * welcome media. Intentionally public; anything sent to many customers anyway.
 */
export const PUBLIC_MEDIA_BUCKETS = ['template-media'] as const;

export interface StorageObjectRef {
  bucket: string;
  path: string;
}

export function isPublicMediaBucket(bucket: string): boolean {
  return (PUBLIC_MEDIA_BUCKETS as readonly string[]).includes(bucket);
}

function validPath(path: string): boolean {
  return path.length > 0 && path.length <= 1024 && !path.split('/').some(seg => seg === '' || seg === '.' || seg === '..');
}

/**
 * Bucket + path of a URL served by THIS project's Storage (public, signed or
 * authenticated form). Any other host — or a malformed/traversing path — is null.
 */
export function parseStorageUrl(raw: string | null | undefined): StorageObjectRef | null {
  if (!raw) return null;
  // The URL parser silently resolves "/../" (and %2e%2e) — reject such input
  // outright instead of trusting whatever path it normalizes to.
  if (/(^|\/)(\.|%2e){1,2}(\/|$|\?|#)/i.test(raw.split(/[?#]/)[0])) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  let url: URL;
  let own: URL;
  try {
    url = new URL(raw);
    own = new URL(base);
  } catch {
    return null;
  }
  if (url.origin !== own.origin || url.username || url.password) return null;
  const m = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([a-z0-9_-]+)\/(.+)$/i);
  if (!m) return null;
  let path: string;
  try {
    path = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  return validPath(path) ? { bucket: m[1], path } : null;
}

/** Knowledge docs store a bare object path in knowledge_docs.file_url. */
export function knowledgeDocRef(path: string | null | undefined): StorageObjectRef | null {
  if (!path || /^https?:\/\//i.test(path)) return null;
  return validPath(path) ? { bucket: 'knowledge-docs', path } : null;
}

/** Public-bucket objects are readable by anyone; everything else only by its owning tenant. */
export function canTenantReadObject(tenantId: string, ref: StorageObjectRef): boolean {
  if (isPublicMediaBucket(ref.bucket)) return true;
  return !!tenantId && ref.path.startsWith(`${tenantId}/`);
}
