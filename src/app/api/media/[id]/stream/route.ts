// ═══════════════════════════════════════════════════════════════════
// GET /api/media/[id]/stream
// ═══════════════════════════════════════════════════════════════════
// The ONLY way the dashboard loads a stored message's media. The media
// buckets are private, so messages.media_url is a reference, not a URL a
// browser can open. This route:
//   • Auth gate         — unauthenticated requests get 401
//   • Tenant isolation  — the message must belong to the caller's tenant AND
//                         the referenced object must live under that tenant's
//                         prefix (media_url can come from tenant-configured
//                         scripted replies/flows, so it is not trusted)
//   • Images / video / documents → 302 to a short-lived signed URL. Bytes go
//     browser ↔ Storage directly (a Vercel function can't return > 4.5 MB or
//     run past 10 s on Hobby); <video> seeking re-issues Range requests to the
//     signed URL itself.
//   • Audio / voice notes → proxied with Range + CORS, which the waveform
//     player (VoiceMessageBubble) relies on.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { canTenantReadObject, parseStorageUrl } from '@/lib/media/storage-ref';
import { isUuid } from '@/lib/media/outbound-media';

// Signed URL lifetime. The redirect itself may be cached by the browser for
// slightly less, so a cached redirect never points at an expired URL.
const SIGNED_URL_TTL_SECS = 3600;
const REDIRECT_CACHE_SECS = 3000;

function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: messageId } = await params;

  // ── Auth: verify session and resolve tenant ──────────────────────────────
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isUuid(messageId)) return notFound();

  // ── Lookup message — enforce tenant isolation ────────────────────────────
  const { data: message, error: msgErr } = await supabaseAdmin
    .from('messages')
    .select('id, media_url, mime_type, message_type, file_name, tenant_id')
    .eq('id', messageId)
    .eq('tenant_id', tenantId) // critical: can't access another tenant's message
    .maybeSingle();

  if (msgErr) {
    console.error('[media/stream] DB error:', msgErr.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  if (!message?.media_url) return notFound();

  const mediaUrl = message.media_url as string;
  const ref = parseStorageUrl(mediaUrl);

  if (!ref) {
    // Not one of our Storage objects (an external https link, e.g. a Shopify
    // product image). Let the browser fetch it — never fetch arbitrary URLs
    // server-side (SSRF). Anything that isn't plain http(s) is refused.
    return /^https?:\/\//i.test(mediaUrl) ? NextResponse.redirect(mediaUrl, 302) : notFound();
  }

  if (!canTenantReadObject(tenantId, ref)) {
    console.warn(`[media/stream] message ${message.id} references a ${ref.bucket} object outside tenant ${tenantId}`);
    return notFound();
  }

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, SIGNED_URL_TTL_SECS);
  if (signErr || !signed?.signedUrl) {
    console.error('[media/stream] signed URL creation failed:', signErr?.message);
    return /not.?found/i.test(signErr?.message || '')
      ? notFound()
      : NextResponse.json({ error: 'Media temporarily unavailable' }, { status: 502 });
  }

  const mimeType = (message.mime_type as string | null) || '';
  const isAudio = mimeType.startsWith('audio/') || message.message_type === 'audio' || message.message_type === 'voice';

  if (!isAudio) {
    const redirect = NextResponse.redirect(signed.signedUrl, 302);
    redirect.headers.set('Cache-Control', `private, max-age=${REDIRECT_CACHE_SECS}`);
    return redirect;
  }

  // ── Audio: Range Request proxy ───────────────────────────────────────────
  // When the browser sends a Range header (for seeking), proxy the request
  // through so Storage handles 206 Partial Content responses. This makes
  // audio seeking instant instead of re-downloading from the start.
  const rangeHeader = req.headers.get('range');

  const upstreamResp = await fetch(signed.signedUrl, {
    headers: {
      ...(rangeHeader ? { 'Range': rangeHeader } : {}),
      'Accept': mimeType || 'audio/*',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  }).catch((err) => {
    console.error('[media/stream] upstream fetch error:', err.message);
    return null;
  });

  if (!upstreamResp) {
    return NextResponse.json({ error: 'Failed to fetch media from storage' }, { status: 502 });
  }

  // Forward the upstream response with proper CORS headers for audio elements
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Range, Content-Type');
  headers.set('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length, Content-Type');

  // Preserve storage headers the browser needs for buffering / seeking
  const passthrough = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
  for (const h of passthrough) {
    const v = upstreamResp.headers.get(h);
    if (v) headers.set(h, v);
  }

  // Ensure the correct MIME type is always set (some OGG files store without codec)
  if (mimeType && !headers.has('content-type')) {
    headers.set('content-type', mimeType);
  }

  // Inline disposition — let the browser play rather than download
  const fileName = ((message.file_name as string | null) || 'voice-note').replace(/["\r\n]/g, '');
  headers.set('content-disposition', `inline; filename="${fileName}"`);

  headers.set('cache-control', 'private, max-age=3600');

  return new Response(upstreamResp.body, {
    status: upstreamResp.status, // 200 or 206
    headers,
  });
}

// Support CORS preflight for browser audio elements
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
