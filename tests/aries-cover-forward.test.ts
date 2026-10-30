import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { coverCandidates, forwardToAriesCover } from '@/lib/webhook/ariesCover';
import type { ParsedMetaMessage } from '@/lib/meta/service';

const PLATFORM = '1207672335754940';
const msg = (over: Partial<ParsedMetaMessage>): ParsedMetaMessage => ({
  messageId: `wamid.${Math.random().toString(36).slice(2)}`,
  fromPhone: '919876543210',
  appPhoneId: PLATFORM,
  type: 'text',
  text: 'whats my balance',
  timestamp: Date.now(),
  isStatusUpdate: false,
  rawWebhook: { id: 'x', from: '919876543210', type: 'text', text: { body: 'whats my balance' } },
  ...over,
});
const status = (over: Partial<ParsedMetaMessage> = {}) =>
  msg({ isStatusUpdate: true, type: 'status_update', status: 'delivered', rawWebhook: undefined, text: '', ...over });

describe('Aries Cover hand-off: what is forwarded', () => {
  it('platform statuses, and guest texts and taps Command did not claim', () => {
    const delivered = status();
    const text = msg({});
    const tap = msg({ type: 'interactive', buttonId: 'x' });
    const taken = msg({});
    const other = msg({ appPhoneId: '999' });
    const otherStatus = status({ appPhoneId: '999' });
    const image = msg({ type: 'image' });
    const reaction = msg({ isReaction: true });
    const out = coverCandidates([delivered, text, tap, taken, other, otherStatus, image, reaction], new Set([taken.messageId]));
    expect(out.statuses.map((m) => m.messageId)).toEqual([delivered.messageId]);
    expect(out.messages.map((m) => m.messageId)).toEqual([text.messageId, tap.messageId]);
  });
});

describe('Aries Cover hand-off: forwarding', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    process.env.ARIES_COVER_FORWARD_URL = 'https://cover.test/api/whatsapp/webhook';
    process.env.ARIES_COVER_FORWARD_SECRET = 'shh';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    delete process.env.ARIES_COVER_FORWARD_URL;
    delete process.env.ARIES_COVER_FORWARD_SECRET;
  });

  it('sends a signed Meta-shaped body and returns only claimed guest messages', async () => {
    const guest = msg({});
    const stranger = msg({});
    const failed = status({ status: 'failed', errorCode: 131026 });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ claimed: [guest.messageId, 'wamid.foreign'] })));
    const claimed = await forwardToAriesCover([guest, stranger, failed]);
    expect([...claimed]).toEqual([guest.messageId]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://cover.test/api/whatsapp/webhook');
    const body = init.body as string;
    const ts = init.headers['X-Aries-Timestamp'];
    expect(init.headers['X-Aries-Signature']).toBe('sha256=' + createHmac('sha256', 'shh').update(`${ts}.${body}`).digest('hex'));
    const value = JSON.parse(body).entry[0].changes[0].value;
    expect(value.metadata.phone_number_id).toBe(PLATFORM);
    expect(value.statuses).toEqual([expect.objectContaining({ id: failed.messageId, status: 'failed', errors: [{ code: 131026 }] })]);
    expect(value.messages).toHaveLength(2);
  });

  it('never throws, and claims nothing, when Cover is down or switched off', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    expect([...(await forwardToAriesCover([msg({})]))]).toEqual([]);
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    expect([...(await forwardToAriesCover([msg({})]))]).toEqual([]);
    delete process.env.ARIES_COVER_FORWARD_URL;
    fetchMock.mockReset();
    expect([...(await forwardToAriesCover([msg({})]))]).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
