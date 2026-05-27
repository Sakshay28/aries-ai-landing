import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
      return new Response('Missing url', { status: 400 });
    }

    console.log('[copy-proxy] Fetching image:', url);
    const res = await fetch(url);
    if (!res.ok) {
      return new Response('Failed to fetch from source', { status: res.status });
    }

    const blob = await res.blob();
    return new Response(blob, {
      headers: {
        'Content-Type': blob.type || 'image/png',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[copy-proxy] Error:', err);
    return new Response('Internal server error', { status: 500 });
  }
}
