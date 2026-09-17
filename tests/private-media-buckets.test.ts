// ═══════════════════════════════════════════════════════════
// 🧪 Private media buckets — tenant isolation + no public-URL rendering (2026-09-17)
// ═══════════════════════════════════════════════════════════
// whatsapp-media / chat-attachments / knowledge-docs / voice-notes go private.
// messages.media_url then becomes a reference, and every read goes through
// server-side signing with the service role — which bypasses bucket privacy.
// So the property that matters most is: a tenant can only ever get a signed URL
// for objects under its OWN prefix, even when it controls the stored URL
// (scripted replies, flows, automations accept arbitrary media URLs).
// Also verified: prod anon key could LIST whatsapp-media via an all-roles RLS
// policy — the migration must drop it, not just flip public=false.
// Run: npx vitest run tests/private-media-buckets.test.ts
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  const BASE = 'https://proj.supabase.co';
  const messages: Record<string, unknown>[] = [];
  const objects = new Set<string>();
  const signCalls: { bucket: string; path: string; ttl: number }[] = [];
  const state = { signError: null as null | string };

  const query = () => {
    const filters: [string, unknown][] = [];
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => { filters.push([col, val]); return q; },
      maybeSingle: async () => ({
        data: messages.find(m => filters.every(([c, v]) => m[c] === v)) ?? null,
        error: null,
      }),
    };
    return q;
  };

  const supabaseAdmin = {
    from: () => query(),
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: vi.fn(async (path: string, ttl: number) => {
          signCalls.push({ bucket, path, ttl });
          if (state.signError) return { data: null, error: { message: state.signError } };
          if (!objects.has(`${bucket}/${path}`)) return { data: null, error: { message: 'Object not found' } };
          return { data: { signedUrl: `${BASE}/storage/v1/object/sign/${bucket}/${path}?token=fresh-${signCalls.length}` }, error: null };
        }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `${BASE}/storage/v1/object/public/${bucket}/${path}` } }),
      }),
    },
  };
  return { BASE, messages, objects, signCalls, state, supabaseAdmin };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: h.supabaseAdmin }));
vi.mock('@/lib/auth/getTenantId', () => ({ getTenantId: vi.fn() }));

import { readFileSync } from 'fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { GET as streamRoute } from '@/app/api/media/[id]/stream/route';
import { toSignedMediaUrl, storageRefUrl } from '@/lib/utils/storage';
import {
  parseStorageUrl, canTenantReadObject, knowledgeDocRef, PRIVATE_MEDIA_BUCKETS, PUBLIC_MEDIA_BUCKETS,
} from '@/lib/media/storage-ref';
import { renderableMediaSrc, mediaStreamPath } from '@/lib/media/media-src';
import AttachmentBubble from '@/app/dashboard/chat/AttachmentBubble';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
const MSG = '55555555-5555-4555-8555-555555555555';
const pub = (bucket: string, path: string) => `${h.BASE}/storage/v1/object/public/${bucket}/${path}`;

function addMessage(row: Record<string, unknown>) {
  h.messages.push({ id: MSG, tenant_id: TENANT, mime_type: 'image/jpeg', message_type: 'image', file_name: 'x.jpg', ...row });
}

async function stream(id = MSG, headers: Record<string, string> = {}) {
  return streamRoute(new NextRequest(`https://ariesai.in${mediaStreamPath(id)}`, { headers }), { params: Promise.resolve({ id }) });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = h.BASE;
});

beforeEach(() => {
  h.messages.length = 0;
  h.objects.clear();
  h.signCalls.length = 0;
  h.state.signError = null;
  vi.mocked(getTenantId).mockResolvedValue(TENANT);
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 206,
    headers: { 'content-type': 'audio/ogg', 'content-range': 'bytes 0-3/4000', 'accept-ranges': 'bytes', 'x-range-seen': new Headers(init?.headers).get('range') || '' },
  }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════
describe('storage references', () => {
  it('parses public, signed and authenticated URLs from this project only', () => {
    expect(parseStorageUrl(pub('whatsapp-media', `${TENANT}/9988.jpg`))).toEqual({ bucket: 'whatsapp-media', path: `${TENANT}/9988.jpg` });
    expect(parseStorageUrl(`${h.BASE}/storage/v1/object/sign/knowledge-docs/${TENANT}/1_Rate%20Card.pdf?token=abc`))
      .toEqual({ bucket: 'knowledge-docs', path: `${TENANT}/1_Rate Card.pdf` });
    expect(parseStorageUrl(`${h.BASE}/storage/v1/object/authenticated/chat-attachments/${TENANT}/a/b.png`)?.bucket).toBe('chat-attachments');

    expect(parseStorageUrl(`https://other.supabase.co/storage/v1/object/public/whatsapp-media/${TENANT}/1.jpg`)).toBeNull();
    expect(parseStorageUrl(`https://proj.supabase.co.evil.io/storage/v1/object/public/whatsapp-media/${TENANT}/1.jpg`)).toBeNull();
    expect(parseStorageUrl(pub('whatsapp-media', `${TENANT}/../${OTHER}/1.jpg`))).toBeNull();
    expect(parseStorageUrl(pub('whatsapp-media', `${TENANT}/%2e%2e/${OTHER}/1.jpg`))).toBeNull();
    expect(parseStorageUrl(`${h.BASE}/rest/v1/messages`)).toBeNull();
    expect(parseStorageUrl('https://cdn.shopify.com/s/files/1/p.jpg')).toBeNull();
    expect(parseStorageUrl('not a url')).toBeNull();
  });

  it('private objects are readable only under the tenant’s own prefix; template-media is public by design', () => {
    expect(canTenantReadObject(TENANT, { bucket: 'whatsapp-media', path: `${TENANT}/1.jpg` })).toBe(true);
    expect(canTenantReadObject(TENANT, { bucket: 'whatsapp-media', path: `${OTHER}/1.jpg` })).toBe(false);
    expect(canTenantReadObject(TENANT, { bucket: 'chat-attachments', path: `${TENANT}x/1.jpg` })).toBe(false); // prefix look-alike
    expect(canTenantReadObject(TENANT, { bucket: 'knowledge-docs', path: `${OTHER}/doc.pdf` })).toBe(false);
    expect(canTenantReadObject(TENANT, { bucket: 'some-future-bucket', path: `${OTHER}/1.jpg` })).toBe(false); // unknown = private
    expect(canTenantReadObject(TENANT, { bucket: 'template-media', path: `${OTHER}/templates/h.jpg` })).toBe(true);
    expect(canTenantReadObject('', { bucket: 'whatsapp-media', path: '/1.jpg' })).toBe(false);
  });

  it('knowledge-doc bare paths become references; URLs and traversal do not', () => {
    expect(knowledgeDocRef(`${TENANT}/1_menu.pdf`)).toEqual({ bucket: 'knowledge-docs', path: `${TENANT}/1_menu.pdf` });
    expect(knowledgeDocRef('https://x/y.pdf')).toBeNull();
    expect(knowledgeDocRef(`${TENANT}/../${OTHER}/a.pdf`)).toBeNull();
  });

  it('storageRefUrl is the canonical (non-expiring) object URL', () => {
    expect(storageRefUrl('knowledge-docs', `${TENANT}/v.mp4`)).toBe(pub('knowledge-docs', `${TENANT}/v.mp4`));
  });
});

// ═══════════════════════════════════════════════════════════
describe('toSignedMediaUrl — the send-time signer', () => {
  it('signs the tenant’s own private object', async () => {
    h.objects.add(`whatsapp-media/${TENANT}/1.jpg`);
    const url = await toSignedMediaUrl(pub('whatsapp-media', `${TENANT}/1.jpg`), TENANT);
    expect(url).toMatch(/\/object\/sign\/whatsapp-media\/.+token=/);
    expect(h.signCalls[0]).toMatchObject({ bucket: 'whatsapp-media', ttl: 600 });
  });

  it('refuses — without ever signing — another tenant’s private object planted in a scripted reply/automation', async () => {
    h.objects.add(`whatsapp-media/${OTHER}/customer-photo.jpg`);
    h.objects.add(`knowledge-docs/${OTHER}/internal.pdf`);
    expect(await toSignedMediaUrl(pub('whatsapp-media', `${OTHER}/customer-photo.jpg`), TENANT)).toBeNull();
    expect(await toSignedMediaUrl(`${OTHER}/internal.pdf`, TENANT)).toBeNull();
    expect(h.signCalls).toHaveLength(0);
  });

  it('signs own knowledge-doc bare paths', async () => {
    h.objects.add(`knowledge-docs/${TENANT}/1_rates.pdf`);
    expect(await toSignedMediaUrl(`${TENANT}/1_rates.pdf`, TENANT)).toMatch(/\/object\/sign\/knowledge-docs\//);
  });

  it('template-media (public) is signable for its owner and falls back to its public URL if signing fails', async () => {
    const url = pub('template-media', `${TENANT}/templates/h.jpg`);
    h.state.signError = 'storage hiccup';
    expect(await toSignedMediaUrl(url, TENANT)).toBe(url);
  });

  it('a private object that cannot be signed yields null (the unusable public URL is never handed to Meta)', async () => {
    expect(await toSignedMediaUrl(pub('chat-attachments', `${TENANT}/c/gone.jpg`), TENANT)).toBeNull();
  });

  it('external URLs pass through untouched', async () => {
    expect(await toSignedMediaUrl('https://cdn.shopify.com/p.jpg', TENANT)).toBe('https://cdn.shopify.com/p.jpg');
    expect(h.signCalls).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
describe('GET /api/media/[id]/stream — tenant isolation', () => {
  it('401 when not signed in, before touching the database or storage', async () => {
    vi.mocked(getTenantId).mockResolvedValue(null);
    addMessage({ media_url: pub('whatsapp-media', `${TENANT}/1.jpg`) });
    expect((await stream()).status).toBe(401);
    expect(h.signCalls).toHaveLength(0);
  });

  it('404 for a malformed id', async () => {
    expect((await stream('not-a-uuid')).status).toBe(404);
  });

  it('404 for another tenant’s message (same response as a missing one), nothing signed', async () => {
    addMessage({ tenant_id: OTHER, media_url: pub('whatsapp-media', `${OTHER}/1.jpg`) });
    h.objects.add(`whatsapp-media/${OTHER}/1.jpg`);
    const res = await stream();
    expect(res.status).toBe(404);
    expect(h.signCalls).toHaveLength(0);
  });

  it('404 when the tenant’s OWN message references another tenant’s private object (planted URL)', async () => {
    addMessage({ media_url: pub('whatsapp-media', `${OTHER}/customer-photo.jpg`) });
    h.objects.add(`whatsapp-media/${OTHER}/customer-photo.jpg`);
    const res = await stream();
    expect(res.status).toBe(404);
    expect(h.signCalls).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['inbound customer photo', 'whatsapp-media', 'image/jpeg', 'image'],
    ['operator video', 'chat-attachments', 'video/mp4', 'video'],
    ['knowledge-base PDF', 'knowledge-docs', 'application/pdf', 'document'],
  ])('%s → 302 to a short-lived signed URL; bytes never proxied', async (_label, bucket, mime, type) => {
    const path = `${TENANT}/obj-1.bin`;
    h.objects.add(`${bucket}/${path}`);
    addMessage({ media_url: pub(bucket, path), mime_type: mime, message_type: type });
    const res = await stream();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(new RegExp(`/object/sign/${bucket}/.+token=fresh-`));
    expect(res.headers.get('cache-control')).toMatch(/^private, max-age=(\d+)$/);
    expect(Number(res.headers.get('cache-control')!.split('=')[1])).toBeLessThan(h.signCalls[0].ttl);
    expect(h.signCalls[0]).toEqual({ bucket, path, ttl: 3600 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an old KB message holding an EXPIRED 10-minute signed URL renders again (fresh signature)', async () => {
    const path = `${TENANT}/1_tour.mp4`;
    h.objects.add(`knowledge-docs/${path}`);
    addMessage({ media_url: `${h.BASE}/storage/v1/object/sign/knowledge-docs/${path}?token=expired`, mime_type: 'video/mp4', message_type: 'video' });
    const res = await stream();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).not.toContain('token=expired');
  });

  it('template-media stays reachable for its messages', async () => {
    const path = `${TENANT}/templates/header.jpg`;
    h.objects.add(`template-media/${path}`);
    addMessage({ media_url: pub('template-media', path) });
    expect((await stream()).status).toBe(302);
  });

  it('voice notes are still proxied with Range + CORS for the waveform player', async () => {
    const path = `${TENANT}/wamid.ogg`;
    h.objects.add(`whatsapp-media/${path}`);
    addMessage({ media_url: pub('whatsapp-media', path), mime_type: 'audio/ogg; codecs=opus', message_type: 'voice' });
    const res = await stream(MSG, { range: 'bytes=0-3' });
    expect(res.status).toBe(206);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('content-range')).toBe('bytes 0-3/4000');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/object\/sign\/whatsapp-media\//);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('range')).toBe('bytes=0-3');
  });

  it('external https media is handed to the browser; nothing is fetched server-side (no SSRF)', async () => {
    addMessage({ media_url: 'https://cdn.shopify.com/s/files/p.jpg' });
    const res = await stream();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://cdn.shopify.com/s/files/p.jpg');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('non-http media_url values are refused', async () => {
    addMessage({ media_url: 'javascript:alert(1)' });
    expect((await stream()).status).toBe(404);
  });

  it('a deleted object is a 404, not a broken redirect', async () => {
    addMessage({ media_url: pub('whatsapp-media', `${TENANT}/deleted.jpg`) });
    expect((await stream()).status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════
describe('dashboard rendering no longer depends on public URLs', () => {
  it('persisted media loads through the authenticated stream route; optimistic uploads keep their blob preview', () => {
    expect(renderableMediaSrc({ id: MSG, media_url: pub('whatsapp-media', `${TENANT}/1.jpg`), message_type: 'image' })).toBe(`/api/media/${MSG}/stream`);
    expect(renderableMediaSrc({ id: MSG, media_url: `${h.BASE}/storage/v1/object/sign/knowledge-docs/x?token=old`, message_type: 'video' })).toBe(`/api/media/${MSG}/stream`);
    expect(renderableMediaSrc({ id: '__optimistic__3', media_url: 'blob:https://ariesai.in/abc', message_type: 'image' })).toBe('blob:https://ariesai.in/abc');
    expect(renderableMediaSrc({ id: MSG, media_url: 'https://maps.google.com/?q=1,2', message_type: 'location' })).toBe('https://maps.google.com/?q=1,2');
    expect(renderableMediaSrc({ id: MSG, media_url: null, message_type: 'text' })).toBeNull();
  });

  it('an image bubble given the stream path emits no storage URL anywhere in its markup', () => {
    const html = renderToStaticMarkup(createElement(AttachmentBubble, {
      messageId: MSG, mediaUrl: mediaStreamPath(MSG), fileName: 'photo.jpg', mimeType: 'image/jpeg', isOutbound: false,
    }));
    expect(html).toContain(`src="/api/media/${MSG}/stream"`);
    expect(html).not.toMatch(/supabase|\/storage\/v1\//);
  });

  it('ratchet: chat UI never feeds raw media_url into a media element or copy action', () => {
    const chat = readFileSync('src/app/dashboard/chat/ChatArea.tsx', 'utf8');
    expect(chat).not.toMatch(/mediaUrl=\{msg\.media_url\}/);
    expect(chat).not.toMatch(/copyMessage\([^)]*msg\.media_url/);
    expect(chat).toMatch(/mediaUrl=\{renderableMediaSrc\(msg\)/);
  });

  it('ratchet: senders persist durable references, never expiring signed links', () => {
    const webhook = readFileSync('src/app/api/webhooks/whatsapp/route.ts', 'utf8');
    const automations = readFileSync('src/lib/automations/engine.ts', 'utf8');
    expect(webhook).not.toMatch(/media_url:\s*(signedUrl|deliveredUrl|srMediaUrl|welcomeSignedUrl)\b/);
    expect(webhook).not.toMatch(/getPublicUrl\(/); // go through storageRefUrl
    expect(automations).not.toMatch(/sentMediaUrl\s*=\s*signedUrl/);
  });
});

// ═══════════════════════════════════════════════════════════
describe('migration', () => {
  const sql = readFileSync('supabase/migrations/20260917b_private_media_buckets.sql', 'utf8');

  it('makes exactly the private buckets private and leaves template-media public', () => {
    const update = sql.match(/UPDATE storage\.buckets\s+SET public = false\s+WHERE id IN \(([^)]+)\)/);
    expect(update).not.toBeNull();
    const ids = [...update![1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    expect(new Set(ids)).toEqual(new Set(PRIVATE_MEDIA_BUCKETS));
    for (const b of PUBLIC_MEDIA_BUCKETS) expect(ids).not.toContain(b);
  });

  it('drops the all-roles "WhatsApp media public read" policy class (bucket privacy alone does not stop anon reads)', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS %I ON storage\.objects/);
    for (const b of PRIVATE_MEDIA_BUCKETS) expect(sql).toContain(b);
    expect(sql).toMatch(/qual IS NULL OR btrim\(qual\) IN \('true', '\(true\)'\)/);
  });
});
