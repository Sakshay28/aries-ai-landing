// ═══════════════════════════════════════════════════════════
// 🧪 Operator media sending — end-to-end pipeline (2026-09-17 P0)
// ═══════════════════════════════════════════════════════════
// Prod evidence: since 2026-07-01 not one inbox attachment reached the DB or
// storage. The old /api/chat/upload pushed the file through a Vercel function
// (4.5 MB body cap → every phone photo/video 413'd before running), sent
// WebP/MOV/oversized media Meta rejects, and "Retry" on a failed photo sent the
// customer the FILE NAME as text. This suite drives the replacement pipeline
// against an in-memory Supabase (tables + storage + ranged GETs) with Meta mocked
// at the network edge.
// Run: npx vitest run tests/chat-media-pipeline.test.ts
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const db: Record<string, Row[]> = { messages: [], conversations: [], tenants: [] };
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  const state = { uniqueIndex: true, signedUrlSeq: 0, uploadUrlFails: false, insertError: null as null | { code: string; message: string } };

  const clone = <T,>(v: T): T => structuredClone(v);
  const readPath = (row: Row, col: string): unknown => {
    if (!col.includes('->')) return row[col];
    return col.split(/->>?/).reduce<unknown>((acc, key) => (acc as Row | undefined)?.[key], row);
  };

  // Thenable like a supabase-js builder: `await query` runs it.
  class Query {
    private filters: ((r: Row) => boolean)[] = [];
    private op: 'select' | 'insert' | 'update' = 'select';
    private payload: Row = {};
    private mode: null | 'single' | 'maybe' = null;
    private returning = false;
    private limitN: number | null = null;
    constructor(private table: string) {}
    select() { if (this.op !== 'select') this.returning = true; return this; }
    eq(col: string, val: unknown) { this.filters.push(r => readPath(r, col) === val); return this; }
    is(col: string, val: unknown) { this.filters.push(r => (readPath(r, col) ?? null) === val); return this; }
    limit(n: number) { this.limitN = n; return this; }
    insert(obj: Row) { this.op = 'insert'; this.payload = obj; return this; }
    update(obj: Row) { this.op = 'update'; this.payload = obj; return this; }
    maybeSingle() { this.mode = 'maybe'; return this.exec(); }
    single() { this.mode = 'single'; return this.exec(); }
    then<A, B>(ok?: ((v: { data: unknown; error: unknown }) => A) | null, bad?: ((e: unknown) => B) | null) {
      return this.exec().then(ok, bad);
    }
    async exec(): Promise<{ data: unknown; error: unknown }> {
      await Promise.resolve();
      const rows = (db[this.table] ||= []);
      if (this.op === 'insert') {
        if (state.insertError) return { data: null, error: state.insertError };
        const sp = (this.payload.metadata as Row | undefined)?.media as Row | undefined;
        if (this.table === 'messages' && state.uniqueIndex && sp?.storage_path
          && rows.some(r => r.tenant_id === this.payload.tenant_id && readPath(r, 'metadata->media->>storage_path') === sp.storage_path)) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
        }
        const row: Row = {
          id: globalThis.crypto.randomUUID(), created_at: new Date().toISOString(), wa_message_id: null,
          error_message: null, failure_reason: null, retry_count: 0, ...clone(this.payload),
        };
        rows.push(row);
        return { data: this.mode ? clone(row) : [clone(row)], error: null };
      }
      const matched = rows.filter(r => this.filters.every(f => f(r)));
      if (this.op === 'update') {
        for (const r of matched) Object.assign(r, clone(this.payload));
        const out = matched.map(clone);
        if (this.mode) return { data: out[0] ?? null, error: out[0] || this.mode === 'maybe' ? null : { code: 'PGRST116' } };
        return { data: this.returning ? out : null, error: null };
      }
      let out = matched.map(clone);
      if (this.limitN != null) out = out.slice(0, this.limitN);
      if (this.mode === 'maybe') return { data: out[0] ?? null, error: null };
      if (this.mode === 'single') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116' } };
      return { data: out, error: null };
    }
  }

  const BASE = 'https://proj.supabase.co';
  const storageApi = (bucket: string) => ({
    createSignedUploadUrl: vi.fn(async (path: string) => state.uploadUrlFails
      ? { data: null, error: { message: 'storage down' } }
      : { data: { signedUrl: `${BASE}/storage/v1/object/upload/sign/${bucket}/${path}?token=up-tok`, token: 'up-tok', path }, error: null }),
    createSignedUrl: vi.fn(async (path: string) => {
      if (!objects.has(`${bucket}/${path}`)) return { data: null, error: { message: 'Object not found' } };
      state.signedUrlSeq += 1;
      return { data: { signedUrl: `${BASE}/storage/v1/object/sign/${bucket}/${path}?token=sig-${state.signedUrlSeq}` }, error: null };
    }),
    download: vi.fn(async (path: string) => {
      const obj = objects.get(`${bucket}/${path}`);
      return obj ? { data: new Blob([obj.bytes as BlobPart]), error: null } : { data: null, error: { message: 'Object not found' } };
    }),
    remove: vi.fn(async (paths: string[]) => { paths.forEach(p => objects.delete(`${bucket}/${p}`)); return { data: [], error: null }; }),
    upload: vi.fn(async (path: string, bytes: Uint8Array, opts: { contentType: string }) => {
      objects.set(`${bucket}/${path}`, { bytes: new Uint8Array(bytes), contentType: opts.contentType });
      return { data: { path }, error: null };
    }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `${BASE}/storage/v1/object/public/${bucket}/${path}` } }),
  });
  const buckets = new Map<string, ReturnType<typeof storageApi>>();

  const supabaseAdmin = {
    from: (table: string) => new Query(table),
    storage: {
      from: (bucket: string) => {
        if (!buckets.has(bucket)) buckets.set(bucket, storageApi(bucket));
        return buckets.get(bucket)!;
      },
    },
  };

  return { db, objects, state, supabaseAdmin, buckets, BASE };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: h.supabaseAdmin }));
vi.mock('@/lib/utils/crypto', () => ({
  decryptToken: (v: string | null) => (v ? 'EAAFakeAccessTokenForTests0123456789' : null),
  encryptToken: (v: string | null) => v,
}));
vi.mock('@/lib/auth/getTenantId', () => ({ getTenantId: vi.fn() }));
vi.mock('@/lib/redis/client', () => ({ checkRedisRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10 })) }));
vi.mock('@/lib/meta/service', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/meta/service')>();
  return { ...actual, uploadMediaToMeta: vi.fn(), sendWhatsAppMedia: vi.fn() };
});

import { NextRequest } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { MetaApiError, uploadMediaToMeta, sendWhatsAppMedia } from '@/lib/meta/service';
import {
  issueChatMediaUpload, sendStoredChatMedia, retryChatMedia, storeAndSendChatMedia,
} from '@/lib/media/outbound-media.server';
import {
  planOutboundMedia, bytesMatchMimeType, normalizeMimeType, parseOwnedChatMediaPath,
  sanitizeDisplayFileName, describeMediaFailure, STALE_PENDING_MS,
} from '@/lib/media/outbound-media';
import { redactSensitive } from '@/lib/media/media-log';
import { isOwnStorageUrl } from '@/lib/media/storage-url';
import { POST as uploadUrlRoute } from '@/app/api/chat/media/upload-url/route';
import { POST as sendRoute } from '@/app/api/chat/media/send/route';
import { POST as retryRoute } from '@/app/api/chat/media/retry/route';
import { POST as legacyUploadRoute } from '@/app/api/chat/upload/route';
import { GET as copyProxyRoute } from '@/app/api/chat/copy-proxy/route';
import { GET as streamRoute } from '@/app/api/media/[id]/stream/route';

// ── fixtures ────────────────────────────────────────────────────────────────
const TENANT = '11111111-1111-4111-8111-111111111111';
const CONV = '22222222-2222-4222-8222-222222222222';
const OTHER_TENANT = '33333333-3333-4333-8333-333333333333';
const OTHER_CONV = '44444444-4444-4444-8444-444444444444';
const BUCKET = 'chat-attachments';
const MB = 1024 * 1024;

function bytes(prefix: number[] | string, total = 256): Uint8Array {
  const head = typeof prefix === 'string' ? Array.from(prefix, c => c.charCodeAt(0)) : prefix;
  const out = new Uint8Array(total);
  out.set(head.slice(0, total));
  for (let i = head.length; i < total; i++) out[i] = (i * 31 + 7) % 251 + 1; // no NULs
  return out;
}
const JPEG = () => bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG_QR = () => bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 900);
const MP4 = () => bytes([0x00, 0x00, 0x00, 0x18, ...Array.from('ftypmp42', c => c.charCodeAt(0))]);
const PDF = () => bytes('%PDF-1.7\n');
const EXE = () => bytes([0x4d, 0x5a, 0x90, 0x00]);

function storeObject(ext: string, data: Uint8Array, contentType: string, opts: { tenant?: string; conv?: string; declaredSize?: number } = {}) {
  const path = `${opts.tenant ?? TENANT}/${opts.conv ?? CONV}/${globalThis.crypto.randomUUID()}.${ext}`;
  h.objects.set(`${BUCKET}/${path}`, { bytes: data, contentType });
  if (opts.declaredSize) sizeOverrides.set(path, opts.declaredSize);
  return path;
}
// Lets a test pretend a small fixture is a 8 MB video without allocating 8 MB.
const sizeOverrides = new Map<string, number>();

let fetchMock: ReturnType<typeof vi.fn>;
let logLines: string[] = [];

function storageFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const m = url.pathname.match(/^\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/(.+)$/);
  const obj = m ? h.objects.get(`${m[1]}/${decodeURIComponent(m[2])}`) : undefined;
  if (!m || !obj) return Promise.resolve(new Response('{"error":"not_found"}', { status: 400 }));
  const total = sizeOverrides.get(decodeURIComponent(m[2])) ?? obj.bytes.length;
  const range = new Headers(init?.headers).get('range');
  const end = range ? Math.min(Number(range.match(/-(\d+)/)?.[1] ?? 0), obj.bytes.length - 1) : obj.bytes.length - 1;
  return Promise.resolve(new Response(obj.bytes.slice(0, end + 1), {
    status: range ? 206 : 200,
    headers: { 'content-type': obj.contentType, 'content-range': `bytes 0-${end}/${total}` },
  }));
}

function seed() {
  h.db.messages.length = 0;
  h.db.conversations.length = 0;
  h.db.tenants.length = 0;
  h.objects.clear();
  sizeOverrides.clear();
  h.state.uniqueIndex = true;
  h.state.signedUrlSeq = 0;
  h.state.uploadUrlFails = false;
  h.state.insertError = null;
  h.db.tenants.push(
    { id: TENANT, wa_access_token: 'ciphertext', wa_phone_number_id: '1098765432' },
    { id: OTHER_TENANT, wa_access_token: 'ciphertext', wa_phone_number_id: '5550000000' },
  );
  h.db.conversations.push(
    { id: CONV, tenant_id: TENANT, channel: 'whatsapp', sender_id: '919000000001', leads: { phone: '+91 90000 00001' } },
    { id: OTHER_CONV, tenant_id: OTHER_TENANT, channel: 'whatsapp', sender_id: '919000000000', leads: null },
  );
}

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = h.BASE;
});

beforeEach(() => {
  seed();
  vi.clearAllMocks();
  fetchMock = vi.fn(storageFetch);
  vi.stubGlobal('fetch', fetchMock);
  logLines = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => { logLines.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...a) => { logLines.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(uploadMediaToMeta).mockResolvedValue('meta-media-id-1');
  vi.mocked(sendWhatsAppMedia).mockResolvedValue({ messageId: 'wamid.TEST0000000001', status: 'sent' });
  vi.mocked(getTenantId).mockResolvedValue(TENANT);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type StoredRow = Record<string, unknown> & { metadata: { media: Record<string, unknown> } };
function onlyMessage(): StoredRow {
  expect(h.db.messages).toHaveLength(1);
  return h.db.messages[0] as StoredRow;
}

function expectNoSecretsLogged() {
  const all = logLines.join('\n');
  expect(all).not.toMatch(/EAA[A-Za-z0-9]{10,}/);
  expect(all).not.toContain('token=');
  expect(all).not.toContain('/object/sign/');
  expect(all).not.toContain('ciphertext');
}

// ═══════════════════════════════════════════════════════════
describe('WhatsApp media rules', () => {
  it.each([
    ['image/jpeg', 200_000, 'image'],
    ['image/png', 4 * MB, 'image'],
    ['video/mp4', 15 * MB, 'video'],
    ['video/3gpp', 2 * MB, 'video'],
    ['audio/mpeg', 1 * MB, 'audio'],
    ['audio/ogg', 1 * MB, 'audio'],
    ['application/pdf', 40 * MB, 'document'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1 * MB, 'document'],
    ['text/plain', 1_000, 'document'],
  ])('%s (%d bytes) is sent as %s', (mime, size, sendAs) => {
    const plan = planOutboundMedia(mime, size);
    expect(plan.ok && plan.sendAs).toBe(sendAs);
  });

  it.each([
    ['image/webp', 100_000, 'UNSUPPORTED_TYPE'],   // WhatsApp: stickers only
    ['image/gif', 100_000, 'UNSUPPORTED_TYPE'],
    ['image/heic', 2 * MB, 'UNSUPPORTED_TYPE'],
    ['video/quicktime', 3 * MB, 'UNSUPPORTED_TYPE'],
    ['video/webm', 3 * MB, 'UNSUPPORTED_TYPE'],
    ['application/zip', 1_000, 'UNSUPPORTED_TYPE'],
    ['application/x-msdownload', 1_000, 'UNSUPPORTED_TYPE'],
    ['image/jpeg', 6 * MB, 'IMAGE_TOO_LARGE'],
    ['video/mp4', 17 * MB, 'FILE_TOO_LARGE'],
    ['audio/mpeg', 17 * MB, 'FILE_TOO_LARGE'],
    ['application/pdf', 51 * MB, 'FILE_TOO_LARGE'],
    ['image/png', 0, 'EMPTY_FILE'],
  ])('%s (%d bytes) is rejected with %s', (mime, size, code) => {
    const plan = planOutboundMedia(mime, size);
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.code).toBe(code);
  });

  it('tells the operator to convert a MOV to MP4', () => {
    const plan = planOutboundMedia('video/quicktime', 1 * MB);
    expect(!plan.ok && plan.message).toMatch(/MP4/);
  });

  it('normalizes missing / aliased browser MIME types from the extension', () => {
    expect(normalizeMimeType('', 'IMG_2044.JPG')).toBe('image/jpeg');
    expect(normalizeMimeType('image/jpg', 'x')).toBe('image/jpeg');
    expect(normalizeMimeType('application/octet-stream', 'clip.mp4')).toBe('video/mp4');
    expect(normalizeMimeType('audio/ogg; codecs=opus')).toBe('audio/ogg');
    expect(normalizeMimeType('audio/x-m4a')).toBe('audio/mp4');
  });

  it('accepts real signatures and rejects disguised or corrupted files', () => {
    expect(bytesMatchMimeType(JPEG(), 'image/jpeg')).toBe(true);
    expect(bytesMatchMimeType(PNG_QR(), 'image/png')).toBe(true);
    expect(bytesMatchMimeType(MP4(), 'video/mp4')).toBe(true);
    expect(bytesMatchMimeType(bytes([0, 0, 0, 0x14, ...Array.from('ftyp3gp4', c => c.charCodeAt(0))]), 'video/3gpp')).toBe(true);
    expect(bytesMatchMimeType(PDF(), 'application/pdf')).toBe(true);
    expect(bytesMatchMimeType(bytes([0x50, 0x4b, 0x03, 0x04]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
    expect(bytesMatchMimeType(bytes('OggS'), 'audio/ogg')).toBe(true);
    expect(bytesMatchMimeType(bytes('ID3'), 'audio/mpeg')).toBe(true);

    expect(bytesMatchMimeType(EXE(), 'image/jpeg')).toBe(false);                 // renamed .exe
    expect(bytesMatchMimeType(bytes('<html><script>alert(1)'), 'image/jpeg')).toBe(false);
    expect(bytesMatchMimeType(PNG_QR(), 'image/jpeg')).toBe(false);              // wrong MIME
    expect(bytesMatchMimeType(bytes([0x12, 0x34, 0x56, 0x78]), 'image/png')).toBe(false); // corrupted
    expect(bytesMatchMimeType(bytes([0x00, 0x00, 0x00, 0x14, ...Array.from('ftypqt  ', c => c.charCodeAt(0))]), 'video/mp4')).toBe(false); // MOV labelled mp4
    expect(bytesMatchMimeType(bytes('#!/bin/sh\nrm -rf /'), 'text/plain')).toBe(false);
    expect(bytesMatchMimeType(new Uint8Array([0x41, 0x00, 0x42, 0x43, 0x44]), 'text/plain')).toBe(false);
    expect(bytesMatchMimeType(new Uint8Array([0xff, 0xd8]), 'image/jpeg')).toBe(false); // truncated
  });

  it('only accepts well-formed object paths inside the caller’s tenant + conversation', () => {
    const id = '55555555-5555-4555-8555-555555555555';
    expect(parseOwnedChatMediaPath(`${TENANT}/${CONV}/${id}.jpg`, TENANT, CONV)).toEqual({ ext: 'jpg' });
    expect(parseOwnedChatMediaPath(`${OTHER_TENANT}/${CONV}/${id}.jpg`, TENANT, CONV)).toBeNull();
    expect(parseOwnedChatMediaPath(`${TENANT}/${OTHER_CONV}/${id}.jpg`, TENANT, CONV)).toBeNull();
    expect(parseOwnedChatMediaPath(`${TENANT}/${CONV}/../../${OTHER_TENANT}/${id}.jpg`, TENANT, CONV)).toBeNull();
    expect(parseOwnedChatMediaPath(`${TENANT}/${CONV}/photo.jpg`, TENANT, CONV)).toBeNull();
    expect(parseOwnedChatMediaPath(`/${TENANT}/${CONV}/${id}.jpg`, TENANT, CONV)).toBeNull();
    expect(parseOwnedChatMediaPath(42, TENANT, CONV)).toBeNull();
  });

  it('sanitizes the filename shown to the customer', () => {
    expect(sanitizeDisplayFileName('C:\\Users\\me\\Price List.pdf', 'pdf')).toBe('Price List.pdf');
    expect(sanitizeDisplayFileName('../../etc/passwd\u0000.pdf', 'pdf')).toBe('passwd.pdf');
    expect(sanitizeDisplayFileName('', 'pdf')).toBe('file.pdf');
  });

  it('writes operator-readable failure text', () => {
    expect(describeMediaFailure('image', 'WhatsApp rejected this file.')).toBe('Photo couldn’t be sent. WhatsApp rejected this file.');
    expect(describeMediaFailure('video', 'SESSION_EXPIRED')).toMatch(/24-hour/);
    expect(describeMediaFailure('document', null)).toBe('File couldn’t be sent. Please try again.');
  });

  it('redacts URLs, Meta tokens and JWTs from log detail', () => {
    const out = redactSensitive('fetch https://proj.supabase.co/storage/v1/object/sign/x?token=abc failed EAAGm0PX4ZCpsBAKZCDEFGHIJ Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123');
    expect(out).not.toMatch(/supabase|EAAGm0|eyJhbGci/);
  });

  it('only treats this project’s own storage as fetchable (SSRF guard)', () => {
    expect(isOwnStorageUrl(`${h.BASE}/storage/v1/object/public/chat-attachments/a.jpg`)).toBe(true);
    expect(isOwnStorageUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
    expect(isOwnStorageUrl('https://proj.supabase.co.evil.com/storage/v1/object/public/x')).toBe(false);
    expect(isOwnStorageUrl('https://evil.com/storage/v1/object/public/x')).toBe(false);
    expect(isOwnStorageUrl(`${h.BASE}/rest/v1/tenants`)).toBe(false);
    expect(isOwnStorageUrl('https://user:pw@proj.supabase.co/storage/v1/object/public/x')).toBe(false);
    expect(isOwnStorageUrl('not a url')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
describe('issueChatMediaUpload — step 1', () => {
  it('issues a signed direct-upload URL for an unguessable path inside the tenant + conversation', async () => {
    const r = await issueChatMediaUpload({ tenantId: TENANT, conversationId: CONV, fileName: 'Bungy QR.PNG', mimeType: 'image/png', size: 40_000 });
    expect(r.ok).toBe(true);
    expect(r.upload!.storagePath).toMatch(new RegExp(`^${TENANT}/${CONV}/[0-9a-f-]{36}\\.png$`));
    expect(r.upload!.storagePath).not.toContain('Bungy');
    expect(r.upload!.contentType).toBe('image/png');
    expect(r.upload!.sendAs).toBe('image');
    expect(logLines.some(l => l.includes('"evt":"MEDIA_UPLOAD_STARTED"'))).toBe(true);
    expectNoSecretsLogged();
  });

  it.each([
    ['image/webp', 10_000, 400],
    ['video/quicktime', 2 * MB, 400],
    ['image/jpeg', 7 * MB, 413],
    ['video/mp4', 20 * MB, 413],
    ['application/pdf', 60 * MB, 413],
    ['image/png', 0, 400],
  ])('refuses %s of %d bytes with HTTP %d before any storage access', async (mimeType, size, status) => {
    const r = await issueChatMediaUpload({ tenantId: TENANT, conversationId: CONV, fileName: 'f', mimeType, size });
    expect(r.ok).toBe(false);
    expect(r.httpStatus).toBe(status);
    expect(h.supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses a conversation that belongs to another tenant (IDOR)', async () => {
    const r = await issueChatMediaUpload({ tenantId: TENANT, conversationId: OTHER_CONV, fileName: 'a.jpg', mimeType: 'image/jpeg', size: 1000 });
    expect(r.httpStatus).toBe(404);
    expect(h.supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('fails fast when WhatsApp is not connected, before the operator uploads anything', async () => {
    (h.db.tenants[0] as Record<string, unknown>).wa_access_token = null;
    const r = await issueChatMediaUpload({ tenantId: TENANT, conversationId: CONV, fileName: 'a.jpg', mimeType: 'image/jpeg', size: 1000 });
    expect(r.httpStatus).toBe(400);
    expect(r.code).toBe('WHATSAPP_NOT_CONNECTED');
  });

  it('says clearly that Instagram media is not supported instead of sending a raw link', async () => {
    (h.db.conversations[0] as Record<string, unknown>).channel = 'instagram_dm';
    const r = await issueChatMediaUpload({ tenantId: TENANT, conversationId: CONV, fileName: 'a.jpg', mimeType: 'image/jpeg', size: 1000 });
    expect(r.httpStatus).toBe(422);
    expect(r.error).toMatch(/Instagram/);
  });

  it('reports storage outages as retryable 503s', async () => {
    h.state.uploadUrlFails = true;
    const r = await issueChatMediaUpload({ tenantId: TENANT, conversationId: CONV, fileName: 'a.jpg', mimeType: 'image/jpeg', size: 1000 });
    expect(r.httpStatus).toBe(503);
  });
});

// ═══════════════════════════════════════════════════════════
describe('sendStoredChatMedia — verify, persist, deliver', () => {
  it('JPEG photo: uploaded to Meta by media ID, delivered, row marked sent with the wamid', async () => {
    const path = storeObject('jpg', JPEG(), 'image/jpeg');
    const r = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path, fileName: 'menu.jpg', caption: '  Today’s menu  ' });

    expect(r.ok).toBe(true);
    expect(uploadMediaToMeta).toHaveBeenCalledWith('EAAFakeAccessTokenForTests0123456789', '1098765432', expect.any(Buffer), 'image/jpeg', 'menu.jpg');
    expect(sendWhatsAppMedia).toHaveBeenCalledWith('EAAFakeAccessTokenForTests0123456789', '1098765432', '+91 90000 00001', {
      sendAs: 'image', mediaId: 'meta-media-id-1', caption: 'Today’s menu', filename: 'menu.jpg', contextMessageId: undefined,
    });

    const row = onlyMessage();
    expect(row).toMatchObject({
      tenant_id: TENANT, conversation_id: CONV, direction: 'outbound', message_type: 'image', status: 'sent',
      wa_message_id: 'wamid.TEST0000000001', mime_type: 'image/jpeg', file_size: 256,
      media_caption: 'Today’s menu', content: 'Today’s menu', error_message: null,
    });
    expect(row.media_url).toBe(`${h.BASE}/storage/v1/object/public/${BUCKET}/${path}`);
    expect(row.metadata.media).toMatchObject({ storage_path: path, send_as: 'image', stage: 'sent', delivery_mode: 'media_id', provider_media_id: 'meta-media-id-1', attempts: 1 });
    expect(r.message?.status).toBe('sent');

    const evts = logLines.map(l => l.match(/"evt":"(\w+)"/)?.[1]).filter(Boolean);
    expect(evts).toEqual(['MEDIA_UPLOAD_SUCCESS', 'MEDIA_PROVIDER_UPLOAD_STARTED', 'MEDIA_PROVIDER_UPLOAD_SUCCESS', 'MEDIA_SEND_STARTED', 'MEDIA_SEND_SUCCESS']);
    expectNoSecretsLogged();
  });

  it('QR code PNG reaches Meta byte-for-byte (never re-encoded, never sent as text)', async () => {
    const qr = PNG_QR();
    const path = storeObject('png', qr, 'image/png');
    await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path, fileName: 'upi-qr.png' });

    const [, , buffer, mime] = vi.mocked(uploadMediaToMeta).mock.calls[0];
    expect(mime).toBe('image/png');
    expect(Buffer.compare(buffer, Buffer.from(qr))).toBe(0);
    expect(vi.mocked(sendWhatsAppMedia).mock.calls[0][3]).toMatchObject({ sendAs: 'image', mediaId: 'meta-media-id-1' });
    expect(onlyMessage().message_type).toBe('image');
  });

  it('larger MP4 video: sent by a freshly signed link (no 16 MB relay through the function), caption kept', async () => {
    const path = storeObject('mp4', MP4(), 'video/mp4', { declaredSize: 12 * MB });
    const r = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path, fileName: 'jump.mp4', caption: 'Your jump!' });

    expect(r.ok).toBe(true);
    expect(uploadMediaToMeta).not.toHaveBeenCalled();
    const ref = vi.mocked(sendWhatsAppMedia).mock.calls[0][3];
    expect(ref).toMatchObject({ sendAs: 'video', caption: 'Your jump!' });
    expect(ref.link).toMatch(new RegExp(`^${h.BASE}/storage/v1/object/sign/${BUCKET}/${path}\\?token=`));
    const row = onlyMessage();
    expect(row).toMatchObject({ message_type: 'video', status: 'sent', file_size: 12 * MB });
    expect(row.metadata.media.delivery_mode).toBe('link');
    // The signed link is never persisted.
    expect(JSON.stringify(h.db.messages)).not.toContain('token=');
    expectNoSecretsLogged();
  });

  it('PDF document: customer sees the real filename', async () => {
    const path = storeObject('pdf', PDF(), 'application/pdf');
    await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path, fileName: 'Rishikesh Bungy Rates.pdf' });
    expect(vi.mocked(sendWhatsAppMedia).mock.calls[0][3]).toMatchObject({ sendAs: 'document', filename: 'Rishikesh Bungy Rates.pdf' });
  });

  it('quoted reply passes the parent wamid — but never a wamid from another tenant', async () => {
    h.db.messages.push({ id: '66666666-6666-4666-8666-666666666666', tenant_id: TENANT, conversation_id: CONV, wa_message_id: 'wamid.parent' });
    h.db.messages.push({ id: '77777777-7777-4777-8777-777777777777', tenant_id: OTHER_TENANT, conversation_id: OTHER_CONV, wa_message_id: 'wamid.foreign' });

    await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: storeObject('jpg', JPEG(), 'image/jpeg'), replyToMessageId: '66666666-6666-4666-8666-666666666666' });
    expect(vi.mocked(sendWhatsAppMedia).mock.calls[0][3].contextMessageId).toBe('wamid.parent');

    await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: storeObject('jpg', JPEG(), 'image/jpeg'), replyToMessageId: '77777777-7777-4777-8777-777777777777' });
    expect(vi.mocked(sendWhatsAppMedia).mock.calls[1][3].contextMessageId).toBeUndefined();
  });

  it('provider rejection is persisted as failed with a readable reason + safe diagnostics — never shown as sent', async () => {
    vi.mocked(sendWhatsAppMedia).mockRejectedValue(new MetaApiError('Meta Cloud API media error 400: {"error":{"code":131053}}', 400, { code: 131053, fbtraceId: 'AbC123' }));
    const path = storeObject('jpg', JPEG(), 'image/jpeg');
    const r = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path });

    expect(r).toMatchObject({ ok: false, httpStatus: 502, code: 'PROVIDER_REJECTED' });
    const row = onlyMessage();
    expect(row.status).toBe('failed');
    expect(row.error_message).toMatch(/WhatsApp couldn’t process this file/);
    expect(row.failure_reason).toBe('sending:131053 fbtrace=AbC123');
    expect(row.metadata.media.last_error).toMatchObject({ code: '131053', stage: 'sending' });
    expect(row.metadata.media.provider_media_id).toBe('meta-media-id-1'); // reusable on retry
    expect(r.message?.status).toBe('failed');
    expect(logLines.some(l => l.includes('"evt":"MEDIA_SEND_FAILED"') && l.includes('"errorCode":"131053"'))).toBe(true);
    expectNoSecretsLogged();
  });

  it('closed 24h window maps to SESSION_EXPIRED so the inbox shows the send-a-template banner', async () => {
    vi.mocked(sendWhatsAppMedia).mockRejectedValue(new MetaApiError('re-engagement', 400, { code: 131047 }));
    await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: storeObject('jpg', JPEG(), 'image/jpeg') });
    expect(onlyMessage().error_message).toBe('SESSION_EXPIRED');
  });

  it('Meta media-upload failure is recorded at the provider_upload stage', async () => {
    vi.mocked(uploadMediaToMeta).mockRejectedValue(new MetaApiError('bad param', 400, { code: 100 }));
    const r = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: storeObject('png', PNG_QR(), 'image/png') });
    expect(r.ok).toBe(false);
    expect(sendWhatsAppMedia).not.toHaveBeenCalled();
    expect(onlyMessage().failure_reason).toBe('provider_upload:100');
    expect(logLines.some(l => l.includes('"evt":"MEDIA_PROVIDER_UPLOAD_FAILED"'))).toBe(true);
  });

  it('network error on send is failed once, not blindly re-sent', async () => {
    vi.mocked(sendWhatsAppMedia).mockRejectedValue(new Error('Meta network error: socket hang up'));
    await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: storeObject('jpg', JPEG(), 'image/jpeg') });
    expect(sendWhatsAppMedia).toHaveBeenCalledTimes(1);
    expect(onlyMessage()).toMatchObject({ status: 'failed', error_message: 'Couldn’t reach WhatsApp. Please try again.' });
  });

  it('upload that never landed (or expired upload URL) → 400, no message row', async () => {
    const ghost = `${TENANT}/${CONV}/${globalThis.crypto.randomUUID()}.jpg`;
    const r = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: ghost });
    expect(r).toMatchObject({ ok: false, httpStatus: 400, code: 'UPLOAD_NOT_FOUND' });
    expect(h.db.messages).toHaveLength(0);
    expect(sendWhatsAppMedia).not.toHaveBeenCalled();
  });

  it.each([
    ['renamed executable', 'jpg', EXE(), 'image/jpeg'],
    ['HTML disguised as a photo', 'jpg', bytes('<html><script>steal()</script>'), 'image/jpeg'],
    ['PNG bytes stored as image/jpeg (wrong MIME)', 'jpg', PNG_QR(), 'image/jpeg'],
    ['corrupted JPEG', 'jpg', bytes([0x00, 0x11, 0x22, 0x33]), 'image/jpeg'],
    ['stored type does not match the issued path extension', 'jpg', PDF(), 'application/pdf'],
    ['unsupported type uploaded directly with the signed URL', 'jpg', bytes('RIFF\0\0\0\0WEBP'), 'image/webp'],
  ])('%s → rejected, object deleted, nothing sent', async (_label, ext, data, contentType) => {
    const path = storeObject(ext, data, contentType);
    const r = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path });
    expect(r.ok).toBe(false);
    expect([400, 415]).toContain(r.httpStatus);
    expect(h.objects.has(`${BUCKET}/${path}`)).toBe(false);
    expect(h.db.messages).toHaveLength(0);
    expect(uploadMediaToMeta).not.toHaveBeenCalled();
    expect(sendWhatsAppMedia).not.toHaveBeenCalled();
  });

  it('oversized photo that bypassed the client check is refused server-side', async () => {
    const path = storeObject('jpg', JPEG(), 'image/jpeg', { declaredSize: 9 * MB });
    const r = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path });
    expect(r).toMatchObject({ ok: false, httpStatus: 400, code: 'INVALID_FILE' });
    expect(h.db.messages).toHaveLength(0);
  });

  it('cannot send another tenant’s object (path ownership checked before any storage read)', async () => {
    const foreign = storeObject('jpg', JPEG(), 'image/jpeg', { tenant: OTHER_TENANT, conv: OTHER_CONV });
    const r = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: foreign });
    expect(r).toMatchObject({ ok: false, httpStatus: 403, code: 'FORBIDDEN_PATH' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.objects.has(`${BUCKET}/${foreign}`)).toBe(true);
  });

  it('cannot target another tenant’s conversation even with a matching path prefix', async () => {
    const path = storeObject('jpg', JPEG(), 'image/jpeg', { tenant: TENANT, conv: OTHER_CONV });
    const r = await sendStoredChatMedia({ tenantId: TENANT, conversationId: OTHER_CONV, storagePath: path });
    expect(r.httpStatus).toBe(404);
    expect(sendWhatsAppMedia).not.toHaveBeenCalled();
  });

  it('is idempotent: repeating the same send returns the same row and never re-delivers', async () => {
    const path = storeObject('jpg', JPEG(), 'image/jpeg');
    const first = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path });
    const second = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path });
    expect(second.deduped).toBe(true);
    expect(second.message?.id).toBe(first.message?.id);
    expect(h.db.messages).toHaveLength(1);
    expect(sendWhatsAppMedia).toHaveBeenCalledTimes(1);
  });

  it('double-submitted concurrently: the unique storage_path index lets exactly one through', async () => {
    const path = storeObject('jpg', JPEG(), 'image/jpeg');
    const results = await Promise.all([
      sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path }),
      sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path }),
    ]);
    expect(h.db.messages).toHaveLength(1);
    expect(sendWhatsAppMedia).toHaveBeenCalledTimes(1);
    expect(results.filter(r => r.deduped)).toHaveLength(1);
  });

  it('a DB outage while saving is a retryable 503 and sends nothing', async () => {
    h.state.insertError = { code: '08006', message: 'connection failure' };
    const r = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: storeObject('jpg', JPEG(), 'image/jpeg') });
    expect(r.httpStatus).toBe(503);
    expect(sendWhatsAppMedia).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
describe('retryChatMedia — same row, at most one delivery', () => {
  async function failedSend(opts: { ext?: string; data?: Uint8Array; type?: string; size?: number } = {}) {
    vi.mocked(sendWhatsAppMedia).mockRejectedValueOnce(new MetaApiError('throttled', 400, { code: 131053 }));
    const path = storeObject(opts.ext ?? 'jpg', opts.data ?? JPEG(), opts.type ?? 'image/jpeg', { declaredSize: opts.size });
    const r = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path });
    expect(r.message?.status).toBe('failed');
    const firstLink = vi.mocked(sendWhatsAppMedia).mock.calls[0]?.[3].link;
    vi.mocked(sendWhatsAppMedia).mockClear();
    vi.mocked(uploadMediaToMeta).mockClear();
    return { id: r.message!.id, path, firstLink };
  }

  it('re-delivers a failed photo on the SAME row using the cached Meta media ID (no re-upload)', async () => {
    const { id } = await failedSend();
    const r = await retryChatMedia({ tenantId: TENANT, messageId: id });

    expect(r.ok).toBe(true);
    expect(uploadMediaToMeta).not.toHaveBeenCalled();
    expect(vi.mocked(sendWhatsAppMedia).mock.calls[0][3]).toMatchObject({ sendAs: 'image', mediaId: 'meta-media-id-1' });
    const row = onlyMessage();
    expect(row).toMatchObject({ id, status: 'sent', error_message: null, failure_reason: null, retry_count: 1, wa_message_id: 'wamid.TEST0000000001' });
    expect(row.metadata.media.attempts).toBe(2);
  });

  it('a stale cached media ID is re-uploaded once and then succeeds', async () => {
    const { id } = await failedSend();
    vi.mocked(sendWhatsAppMedia).mockRejectedValueOnce(new MetaApiError('media id expired', 400, { code: 100 }));
    vi.mocked(uploadMediaToMeta).mockResolvedValueOnce('meta-media-id-2');
    const r = await retryChatMedia({ tenantId: TENANT, messageId: id });
    expect(r.ok).toBe(true);
    expect(uploadMediaToMeta).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendWhatsAppMedia).mock.calls[1][3].mediaId).toBe('meta-media-id-2');
    expect(onlyMessage().metadata.media.provider_media_id).toBe('meta-media-id-2');
  });

  it('a media ID older than Meta’s 30-day expiry is not reused', async () => {
    const { id } = await failedSend();
    (onlyMessage().metadata.media as Record<string, unknown>).provider_media_id_at = new Date(Date.now() - 29 * 86400_000).toISOString();
    await retryChatMedia({ tenantId: TENANT, messageId: id });
    expect(uploadMediaToMeta).toHaveBeenCalledTimes(1);
  });

  it('large file retry mints a NEW signed link — an expired URL is never reused', async () => {
    const { id, firstLink } = await failedSend({ ext: 'mp4', data: MP4(), type: 'video/mp4', size: 10 * MB });
    await retryChatMedia({ tenantId: TENANT, messageId: id });
    const retryLink = vi.mocked(sendWhatsAppMedia).mock.calls[0][3].link!;
    expect(firstLink).toMatch(/token=sig-\d+$/);
    expect(retryLink).toMatch(/token=sig-\d+$/);
    expect(retryLink).not.toBe(firstLink);
  });

  it('two simultaneous retries deliver exactly once; the loser gets 409', async () => {
    const { id } = await failedSend();
    const results = await Promise.all([
      retryChatMedia({ tenantId: TENANT, messageId: id }),
      retryChatMedia({ tenantId: TENANT, messageId: id }),
    ]);
    expect(sendWhatsAppMedia).toHaveBeenCalledTimes(1);
    expect(results.map(r => r.httpStatus).sort()).toEqual([200, 409]);
    expect(h.db.messages).toHaveLength(1);
  });

  it('a message that already went out cannot be retried into a duplicate', async () => {
    const path = storeObject('jpg', JPEG(), 'image/jpeg');
    const sent = await sendStoredChatMedia({ tenantId: TENANT, conversationId: CONV, storagePath: path });
    vi.mocked(sendWhatsAppMedia).mockClear();
    const r = await retryChatMedia({ tenantId: TENANT, messageId: sent.message!.id });
    expect(r).toMatchObject({ ok: false, httpStatus: 409, code: 'NOT_RETRYABLE' });
    expect(sendWhatsAppMedia).not.toHaveBeenCalled();
  });

  it('a pending send is only retryable once it is clearly stuck (function timed out)', async () => {
    const { id } = await failedSend();
    const row = onlyMessage();
    row.status = 'pending';
    row.metadata.media.attempt_started_at = new Date().toISOString();
    expect((await retryChatMedia({ tenantId: TENANT, messageId: id })).httpStatus).toBe(409);

    row.metadata.media.attempt_started_at = new Date(Date.now() - STALE_PENDING_MS - 5_000).toISOString();
    const r = await retryChatMedia({ tenantId: TENANT, messageId: id });
    expect(r.ok).toBe(true);
    expect(sendWhatsAppMedia).toHaveBeenCalledTimes(1);
  });

  it('source file deleted from storage → failed with “attach it again”, not a crash', async () => {
    const { id, path } = await failedSend({ ext: 'mp4', data: MP4(), type: 'video/mp4', size: 10 * MB });
    h.objects.delete(`${BUCKET}/${path}`);
    const r = await retryChatMedia({ tenantId: TENANT, messageId: id });
    expect(r.ok).toBe(false);
    expect(onlyMessage()).toMatchObject({ status: 'failed', error_message: 'The original file is no longer available. Please attach it again.' });
    expect(sendWhatsAppMedia).not.toHaveBeenCalled();
  });

  it('another tenant cannot retry (or even see) the message', async () => {
    const { id } = await failedSend();
    const r = await retryChatMedia({ tenantId: OTHER_TENANT, messageId: id });
    expect(r.httpStatus).toBe(404);
    expect(sendWhatsAppMedia).not.toHaveBeenCalled();
  });

  it('text messages are not retryable through the media path', async () => {
    h.db.messages.push({ id: '88888888-8888-4888-8888-888888888888', tenant_id: TENANT, conversation_id: CONV, direction: 'outbound', status: 'failed', message_type: 'text', metadata: null });
    const r = await retryChatMedia({ tenantId: TENANT, messageId: '88888888-8888-4888-8888-888888888888' });
    expect(r).toMatchObject({ httpStatus: 400, code: 'NOT_RETRYABLE' });
  });
});

// ═══════════════════════════════════════════════════════════
describe('legacy multipart /api/chat/upload (stale dashboard tabs)', () => {
  it('stores under a random path and runs the same verified pipeline', async () => {
    const file = new File([JPEG() as BlobPart], 'IMG_2044.jpg', { type: 'image/jpeg' });
    const r = await storeAndSendChatMedia({ tenantId: TENANT, conversationId: CONV, file, caption: 'hi' });
    expect(r.ok).toBe(true);
    const row = onlyMessage();
    expect(row.metadata.media.storage_path).toMatch(new RegExp(`^${TENANT}/${CONV}/[0-9a-f-]{36}\\.jpg$`));
    expect(row.file_name).toBe('IMG_2044.jpg');
  });

  it('never stores a file whose bytes contradict its type', async () => {
    const file = new File([EXE() as BlobPart], 'invoice.jpg', { type: 'image/jpeg' });
    const r = await storeAndSendChatMedia({ tenantId: TENANT, conversationId: CONV, file });
    expect(r.httpStatus).toBe(415);
    expect(h.objects.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
describe('HTTP routes — auth, rate limits, SSRF', () => {
  const json = (url: string, body: unknown) => new NextRequest(`https://ariesai.in${url}`, {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });

  it('every media route rejects unauthenticated callers', async () => {
    vi.mocked(getTenantId).mockResolvedValue(null);
    const form = new FormData();
    form.append('file', new File([JPEG() as BlobPart], 'a.jpg', { type: 'image/jpeg' }));
    form.append('conversationId', CONV);

    const statuses = await Promise.all([
      uploadUrlRoute(json('/api/chat/media/upload-url', { conversationId: CONV, fileName: 'a.jpg', mimeType: 'image/jpeg', size: 10 })),
      sendRoute(json('/api/chat/media/send', { conversationId: CONV, storagePath: 'x' })),
      retryRoute(json('/api/chat/media/retry', { messageId: CONV })),
      legacyUploadRoute(new NextRequest('https://ariesai.in/api/chat/upload', { method: 'POST', body: form })),
      copyProxyRoute(new NextRequest(`https://ariesai.in/api/chat/copy-proxy?url=${encodeURIComponent(`${h.BASE}/storage/v1/object/public/a/b.png`)}`)),
    ].map(p => p.then(r => r.status)));
    expect(statuses).toEqual([401, 401, 401, 401, 401]);
    expect(h.db.messages).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('upload-url is rate limited per tenant', async () => {
    vi.mocked(checkRedisRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await uploadUrlRoute(json('/api/chat/media/upload-url', { conversationId: CONV, fileName: 'a.jpg', mimeType: 'image/jpeg', size: 10 }));
    expect(res.status).toBe(429);
  });

  it('send route returns the persisted message (with its real status) as JSON', async () => {
    const path = storeObject('png', PNG_QR(), 'image/png');
    const res = await sendRoute(json('/api/chat/media/send', { conversationId: CONV, storagePath: path, fileName: 'qr.png' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, message: { status: 'sent', message_type: 'image' } });
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    'http://localhost:3000/api/admin',
    'https://evil.example/storage/v1/object/public/a.png',
    'https://proj.supabase.co.attacker.io/storage/v1/object/public/a.png',
    'file:///etc/passwd',
  ])('copy-proxy refuses to fetch %s', async (target) => {
    const res = await copyProxyRoute(new NextRequest(`https://ariesai.in/api/chat/copy-proxy?url=${encodeURIComponent(target)}`));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('copy-proxy still serves images from our own storage', async () => {
    const path = storeObject('png', PNG_QR(), 'image/png');
    const res = await copyProxyRoute(new NextRequest(`https://ariesai.in/api/chat/copy-proxy?url=${encodeURIComponent(`${h.BASE}/storage/v1/object/public/${BUCKET}/${path}`)}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });

  it('media stream route redirects foreign media URLs instead of fetching them server-side', async () => {
    h.db.messages.push({ id: '99999999-9999-4999-8999-999999999999', tenant_id: TENANT, conversation_id: CONV, media_url: 'http://169.254.169.254/latest/meta-data/', mime_type: 'image/png', file_name: 'x.png' });
    const res = await streamRoute(new NextRequest('https://ariesai.in/api/media/99999999-9999-4999-8999-999999999999/stream'), { params: Promise.resolve({ id: '99999999-9999-4999-8999-999999999999' }) });
    expect(res.status).toBe(302);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════
describe('migration stays in lockstep with the code', () => {
  it('bucket allowed_mime_types equals exactly what the pipeline accepts', async () => {
    const { readFileSync } = await import('fs');
    const { ALLOWED_OUTBOUND_MIME_TYPES } = await import('@/lib/media/outbound-media');
    const sql = readFileSync('supabase/migrations/20260917_chat_media_pipeline.sql', 'utf8');
    const listed = [...sql.slice(sql.indexOf('allowed_mime_types')).matchAll(/'([a-z]+\/[^']+)'/g)].map(m => m[1]);
    expect(new Set(listed)).toEqual(new Set(ALLOWED_OUTBOUND_MIME_TYPES));
  });
});
