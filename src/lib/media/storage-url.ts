// SSRF guard for routes that fetch media server-side: only objects served by
// this project's own Supabase Storage are ever fetched. Anything else — other
// hosts, internal/metadata addresses, non-https, look-alike domains — is refused.

export function isOwnStorageUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  let url: URL;
  let own: URL;
  try {
    url = new URL(raw);
    own = new URL(base);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && own.protocol === 'https:') return false;
  if (url.username || url.password) return false;
  return url.origin === own.origin && url.pathname.startsWith('/storage/v1/object/');
}
