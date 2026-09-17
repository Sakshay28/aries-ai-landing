// ═══════════════════════════════════════════════════════════
// 🧪 Operator media — Meta send layer + browser client helpers (2026-09-17)
// ═══════════════════════════════════════════════════════════
// Meta layer: POST /{phone-number-id}/media must carry `type` (required by the
// Cloud API), captions must go out on video, and an ambiguous network failure
// must NOT be re-POSTed (Meta may already have delivered the photo).
// Client: non-JSON gateway errors never surface as parse errors, a lost upload
// storage rejection is surfaced cleanly, and unsupported picks are refused
// with an actionable message before anything is uploaded.
// Run: npx vitest run tests/chat-media-client-and-meta.test.ts
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadMediaToMeta, sendWhatsAppMedia, MetaApiError } from '@/lib/meta/service';
import { fitWithin, imageNeedsConversion, toJpegFileName } from '@/lib/media/client-image';
import { prepareAttachment, sendUploadedAttachment, uploadToSignedUrl, AttachmentError } from '@/lib/media/client-upload';

const TOKEN = 'EAAFakeAccessTokenForTests0123456789';
const PHONE_ID = '1098765432';
const MB = 1024 * 1024;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const metaError = (status: number, code: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message: 'err', code, fbtrace_id: 'TRACE' } }), { status, headers });

describe('uploadMediaToMeta', () => {
  it('sends the required `type` and messaging_product fields with the file', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'media-123' }));
    const id = await uploadMediaToMeta(TOKEN, PHONE_ID, Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png', 'qr.png');
    expect(id).toBe('media-123');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://graph.facebook.com/v21.0/${PHONE_ID}/media`);
    const form = init.body as FormData;
    expect(form.get('type')).toBe('image/png');
    expect(form.get('messaging_product')).toBe('whatsapp');
    const file = form.get('file') as File;
    expect(file.name).toBe('qr.png');
    expect(file.type).toBe('image/png');
  });
});

describe('sendWhatsAppMedia', () => {
  const body = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

  it('image by media ID with caption and quoted reply', async () => {
    fetchMock.mockResolvedValue(ok({ messages: [{ id: 'wamid.1' }] }));
    const r = await sendWhatsAppMedia(TOKEN, PHONE_ID, '+91 90000 00001', { sendAs: 'image', mediaId: 'm1', caption: 'Scan to pay', contextMessageId: 'wamid.parent' });
    expect(r.messageId).toBe('wamid.1');
    expect(body()).toEqual({
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '919000000001', type: 'image',
      image: { id: 'm1', caption: 'Scan to pay' }, context: { message_id: 'wamid.parent' },
    });
  });

  it('video keeps its caption (the old sender silently dropped it)', async () => {
    fetchMock.mockResolvedValue(ok({ messages: [{ id: 'wamid.2' }] }));
    await sendWhatsAppMedia(TOKEN, PHONE_ID, '919000000001', { sendAs: 'video', link: 'https://x/y.mp4', caption: 'Your jump', filename: 'jump.mp4' });
    expect(body().video).toEqual({ link: 'https://x/y.mp4', caption: 'Your jump' });
  });

  it('document carries the real filename; audio never carries a caption', async () => {
    fetchMock.mockResolvedValue(ok({ messages: [{ id: 'wamid.3' }] }));
    await sendWhatsAppMedia(TOKEN, PHONE_ID, '919000000001', { sendAs: 'document', mediaId: 'd1', caption: 'Rates', filename: 'Rates 2026.pdf' });
    expect(body().document).toEqual({ id: 'd1', caption: 'Rates', filename: 'Rates 2026.pdf' });

    fetchMock.mockClear();
    await sendWhatsAppMedia(TOKEN, PHONE_ID, '919000000001', { sendAs: 'audio', mediaId: 'a1', caption: 'ignored' });
    expect(body().audio).toEqual({ id: 'a1' });
  });

  it('does NOT re-POST after a network error (outcome unknown → no duplicate photo)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(sendWhatsAppMedia(TOKEN, PHONE_ID, '919000000001', { sendAs: 'image', mediaId: 'm1' })).rejects.toThrow(/network/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry a permanent rejection', async () => {
    fetchMock.mockResolvedValue(metaError(400, 131053));
    const err = await sendWhatsAppMedia(TOKEN, PHONE_ID, '919000000001', { sendAs: 'image', mediaId: 'm1' }).catch(e => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err.code).toBe(131053);
    expect(err.fbtraceId).toBe('TRACE');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries only an explicit throttle, honouring Retry-After', async () => {
    fetchMock
      .mockResolvedValueOnce(metaError(429, 130429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(ok({ messages: [{ id: 'wamid.4' }] }));
    const r = await sendWhatsAppMedia(TOKEN, PHONE_ID, '919000000001', { sendAs: 'image', mediaId: 'm1' });
    expect(r.messageId).toBe('wamid.4');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a 2xx without an id is still “sent” — never turned into a failure that invites a duplicate retry', async () => {
    fetchMock.mockResolvedValue(ok({}));
    await expect(sendWhatsAppMedia(TOKEN, PHONE_ID, '919000000001', { sendAs: 'image', mediaId: 'm1' })).resolves.toEqual({ messageId: '', status: 'sent' });
  });

  it('refuses to call Meta with neither media ID nor link', async () => {
    await expect(sendWhatsAppMedia(TOKEN, PHONE_ID, '919000000001', { sendAs: 'image' })).rejects.toThrow(/missing/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('client image helpers', () => {
  it('flags only images WhatsApp would reject', () => {
    expect(imageNeedsConversion('image/jpeg', 2 * MB)).toBe(false);
    expect(imageNeedsConversion('image/png', 300_000)).toBe(false);   // QR screenshot: sent untouched
    expect(imageNeedsConversion('image/jpeg', 8 * MB)).toBe(true);    // modern phone camera
    expect(imageNeedsConversion('image/webp', 50_000)).toBe(true);
    expect(imageNeedsConversion('image/svg+xml', 2_000)).toBe(true);  // vector QR
    expect(imageNeedsConversion('image/gif', 50_000)).toBe(true);
    expect(imageNeedsConversion('video/mp4', 8 * MB)).toBe(false);
  });

  it('fits within the max edge and upsizes tiny vector QR codes so they stay scannable', () => {
    expect(fitWithin(8000, 6000, 4096)).toEqual({ width: 4096, height: 3072 });
    expect(fitWithin(1200, 900, 4096)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(120, 120, 4096, 1024)).toEqual({ width: 1024, height: 1024 });
    expect(fitWithin(0, 0, 4096, 1024)).toEqual({ width: 1024, height: 1024 });
  });

  it('renames converted files to .jpg', () => {
    expect(toJpegFileName('upi-qr.webp')).toBe('upi-qr.jpg');
    expect(toJpegFileName('IMG_0001.HEIC')).toBe('IMG_0001.jpg');
    expect(toJpegFileName('noext')).toBe('noext.jpg');
  });
});

describe('prepareAttachment', () => {
  it('canonicalizes a missing browser MIME type from the extension (Android pickers)', async () => {
    const f = new File([new Uint8Array(1000)], 'clip.mp4', { type: '' });
    const prepared = await prepareAttachment(f);
    expect(prepared).toMatchObject({ mimeType: 'video/mp4', sendAs: 'video', note: null });
    expect(prepared.file.type).toBe('video/mp4');
  });

  it('keeps a within-limit PNG QR code as the exact same file', async () => {
    const f = new File([new Uint8Array(4000)], 'qr.png', { type: 'image/png' });
    const prepared = await prepareAttachment(f);
    expect(prepared.file).toBe(f);
    expect(prepared.sendAs).toBe('image');
  });

  it('refuses unsupported picks with an actionable message', async () => {
    await expect(prepareAttachment(new File([new Uint8Array(10)], 'clip.mov', { type: 'video/quicktime' }))).rejects.toThrow(/MP4/);
    await expect(prepareAttachment(new File([new Uint8Array(10)], 'a.zip', { type: 'application/zip' }))).rejects.toThrow(/can’t receive this file type/);
    await expect(prepareAttachment(new File([], 'empty.pdf', { type: 'application/pdf' }))).rejects.toThrow(/empty/);
  });

  it('reports an undecodable image format cleanly instead of crashing', async () => {
    // Node has no canvas/Image — equivalent to Chrome being handed a HEIC.
    const f = new File([new Uint8Array(10)], 'IMG.HEIC', { type: 'image/heic' });
    await expect(prepareAttachment(f)).rejects.toThrow(/can’t be opened in your browser/);
  });
});

describe('client API calls', () => {
  it('a Vercel 504 HTML page becomes a friendly, retryable error (not a JSON parse error)', async () => {
    fetchMock.mockResolvedValue(new Response('<html>An error occurred with your deployment</html>', { status: 504 }));
    const r = await sendUploadedAttachment({ conversationId: 'c', storagePath: 'p', fileName: 'f', caption: '', replyToMessageId: null });
    expect(r).toMatchObject({ ok: false, code: 'TIMEOUT' });
    expect(r.error).toMatch(/took too long/);
  });

  it('a server-side failure still hands back the persisted failed message', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, code: 'PROVIDER_REJECTED', error: 'WhatsApp rejected this file.', message: { id: 'm', status: 'failed' } }), { status: 502 }));
    const r = await sendUploadedAttachment({ conversationId: 'c', storagePath: 'p', fileName: 'f', caption: '', replyToMessageId: null });
    expect(r).toMatchObject({ ok: false, code: 'PROVIDER_REJECTED', message: { status: 'failed' } });
  });

  it('offline is reported as such', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await sendUploadedAttachment({ conversationId: 'c', storagePath: 'p', fileName: 'f', caption: '', replyToMessageId: null });
    expect(r).toMatchObject({ ok: false, code: 'NETWORK' });
  });
});

describe('uploadToSignedUrl (direct browser → storage PUT)', () => {
  class FakeXHR {
    static next: { status: number; fail?: boolean } = { status: 200 };
    static last: FakeXHR;
    headers: Record<string, string> = {};
    method = ''; url = ''; status = 0; body: unknown;
    upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    ontimeout: (() => void) | null = null;
    constructor() { FakeXHR.last = this; }
    open(method: string, url: string) { this.method = method; this.url = url; }
    setRequestHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }
    send(body: unknown) {
      this.body = body;
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
      queueMicrotask(() => {
        if (FakeXHR.next.fail) return this.onerror?.();
        this.status = FakeXHR.next.status;
        this.onload?.();
      });
    }
  }
  const target = { uploadUrl: 'https://proj.supabase.co/storage/v1/object/upload/sign/chat-attachments/t/c/o.png?token=t', storagePath: 't/c/o.png', contentType: 'image/png', sendAs: 'image' as const };
  const file = new File([new Uint8Array(100)], 'qr.png', { type: 'image/png' });

  beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXHR));

  it('PUTs the raw file with only its content type and reports progress to 100', async () => {
    FakeXHR.next = { status: 200 };
    const progress: number[] = [];
    await uploadToSignedUrl(target, file, p => progress.push(p));
    expect(FakeXHR.last.method).toBe('PUT');
    expect(FakeXHR.last.headers['content-type']).toBe('image/png');
    expect(Object.keys(FakeXHR.last.headers)).toEqual(['content-type']);
    expect(FakeXHR.last.body).toBe(file);
    expect(progress).toEqual([50, 100]);
  });

  it('storage rejections and dropped connections surface as AttachmentErrors', async () => {
    FakeXHR.next = { status: 413 };
    await expect(uploadToSignedUrl(target, file, () => {})).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
    FakeXHR.next = { status: 400 };
    await expect(uploadToSignedUrl(target, file, () => {})).rejects.toBeInstanceOf(AttachmentError);
    FakeXHR.next = { status: 0, fail: true };
    await expect(uploadToSignedUrl(target, file, () => {})).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
