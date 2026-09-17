import { NextRequest } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { isOwnStorageUrl } from '@/lib/media/storage-url';

// Fetches a chat image so the "Copy image" action can put real image bytes on
// the clipboard (storage responses lack the CORS headers canvas needs).
//
// Previously unauthenticated and willing to fetch ANY url — an open SSRF proxy.
// Now: signed-in users only, this project's Supabase Storage only, no redirects,
// images only, size-capped. Other links fall back to copying the URL text.
const MAX_BYTES = 10 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return new Response('Unauthorized', { status: 401 });

  const url = req.nextUrl.searchParams.get('url');
  if (!url || !isOwnStorageUrl(url)) {
    return new Response('URL not allowed', { status: 400 });
  }

  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return new Response('Failed to fetch from source', { status: 502 });

    const contentType = res.headers.get('content-type') || '';
    const length = Number(res.headers.get('content-length') || 0);
    if (!contentType.startsWith('image/') || length > MAX_BYTES) {
      return new Response('Not an image', { status: 415 });
    }
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return new Response('Image too large', { status: 413 });

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[copy-proxy] fetch failed:', (err as Error)?.name);
    return new Response('Internal server error', { status: 500 });
  }
}
