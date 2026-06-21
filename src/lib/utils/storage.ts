import { supabaseAdmin } from '@/lib/supabase/admin';

// Convert any Supabase storage URL (public or path) to a fresh signed URL.
// WhatsApp Cloud API often can't fetch Supabase public URLs (redirects/CDN issues)
// but signed URLs work reliably.
export async function toSignedMediaUrl(url: string): Promise<string> {
  if (!url) return url;

  if (!url.startsWith('http')) {
    const { data } = await supabaseAdmin.storage
      .from('knowledge-docs')
      .createSignedUrl(url, 600);
    return data?.signedUrl || url;
  }

  if (url.includes('/storage/v1/object/sign/')) return url;

  const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+?)(\?.*)?$/);
  if (publicMatch) {
    const [, bucket, path] = publicMatch;
    const { data } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(decodeURIComponent(path), 600);
    return data?.signedUrl || url;
  }

  return url;
}
