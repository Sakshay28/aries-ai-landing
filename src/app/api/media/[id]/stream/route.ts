// ═══════════════════════════════════════════════════════════════════
// GET /api/media/[id]/stream
// ═══════════════════════════════════════════════════════════════════
// Authenticated media streaming proxy for WhatsApp voice notes and
// all other media attachments. Provides:
//   • Tenant isolation  — a tenant cannot access another tenant's media
//   • Auth gate         — unauthenticated requests get 401
//   • Signed URL        — Supabase public CDN URL is never leaked raw
//   • Range Requests    — proxied with 206 support so audio seeking works
//   • CORS              — explicit headers for browser audio elements
//
// The browser's <audio> element will follow the 302 redirect automatically.
// fetch() in Web Audio API waveform generation also follows redirects.
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

// How long the signed URL is valid — the browser follows the redirect
// immediately so 3600s is more than enough.
const SIGNED_URL_TTL_SECS = 3600;

// Extract bucket name and storage path from a Supabase Storage public URL.
// Handles both public and already-signed URLs.
function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  // Already a signed URL — no need to re-sign, but we still need bucket/path
  const signedMatch = url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+?)(\?|$)/);
  if (signedMatch) {
    return { bucket: signedMatch[1], path: decodeURIComponent(signedMatch[2]) };
  }
  // Public URL: /storage/v1/object/public/{bucket}/{path}
  const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+?)(\?|$)/);
  if (publicMatch) {
    return { bucket: publicMatch[1], path: decodeURIComponent(publicMatch[2]) };
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Resolve dynamic params (Next.js 15 async params)
  const { id: messageId } = await params;

  if (!messageId) {
    return NextResponse.json({ error: 'Message ID required' }, { status: 400 });
  }

  // ── Auth: verify session and resolve tenant ──────────────────────────────
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Lookup message — enforce tenant isolation ────────────────────────────
  const { data: message, error: msgErr } = await supabaseAdmin
    .from('messages')
    .select('id, media_url, mime_type, file_name, tenant_id')
    .eq('id', messageId)
    .eq('tenant_id', tenantId) // critical: can't access another tenant's message
    .maybeSingle();

  if (msgErr) {
    console.error('[media/stream] DB error:', msgErr.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (!message) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const mediaUrl = message.media_url as string | null;
  if (!mediaUrl) {
    return NextResponse.json({ error: 'No media attached to this message' }, { status: 404 });
  }

  // ── Generate a fresh signed URL ──────────────────────────────────────────
  // Even though the whatsapp-media bucket is public, we create signed URLs for:
  //  1. Security (hides bucket path structure from the browser)
  //  2. Future compatibility if we switch to a private bucket
  //  3. Proper TTL management
  const parsed = parseSupabaseStorageUrl(mediaUrl);

  let resolvedUrl: string;

  if (parsed) {
    const { data: signedData, error: signErr } = await supabaseAdmin.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, SIGNED_URL_TTL_SECS);

    if (signErr || !signedData?.signedUrl) {
      console.error('[media/stream] Signed URL creation failed:', signErr?.message);
      // Fall back to original URL — better than 500 for a public bucket
      resolvedUrl = mediaUrl;
    } else {
      resolvedUrl = signedData.signedUrl;
    }
  } else {
    // URL is not a Supabase storage URL (e.g. temp Meta URL stored as fallback).
    // Redirect to it directly — callers should not rely on this path.
    resolvedUrl = mediaUrl;
  }

  // ── Range Request proxy ──────────────────────────────────────────────────
  // When the browser sends a Range header (for seeking), proxy the request
  // through so Supabase handles 206 Partial Content responses. This makes
  // audio seeking instant instead of re-downloading from the start.
  const rangeHeader = req.headers.get('range');

  const upstreamResp = await fetch(resolvedUrl, {
    headers: {
      ...(rangeHeader ? { 'Range': rangeHeader } : {}),
      'Accept': message.mime_type || 'audio/*',
    },
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
  const mimeType = message.mime_type as string | null;
  if (mimeType && !headers.has('content-type')) {
    headers.set('content-type', mimeType);
  }

  // Inline disposition — let the browser play rather than download
  const fileName = (message.file_name as string | null) || 'voice-note';
  headers.set('content-disposition', `inline; filename="${fileName}"`);

  // Cache at CDN layer — signed URLs already have auth embedded
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
