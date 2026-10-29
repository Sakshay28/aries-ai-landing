import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { commandCandidates, claimForAriesCommand, signForward } from '@/lib/webhook/ariesCommand';
import type { ParsedMetaMessage } from '@/lib/meta/service';

const PLATFORM = '1207672335754940';
const msg = (over: Partial<ParsedMetaMessage>): ParsedMetaMessage => ({
  messageId: `wamid.${Math.random().toString(36).slice(2)}`,
  fromPhone: '919876543210',
  appPhoneId: PLATFORM,
  type: 'text',
  text: 'looks good',
  timestamp: Date.now(),
  isStatusUpdate: false,
  rawWebhook: { id: 'x', type: 'text', text: { body: 'looks good' } },
  ...over,
});

describe('Aries Command hand-off: what is forwarded', () => {
  it('forwards Command buttons and plain texts on the platform number only', () => {
    const approve = msg({ type: 'interactive', buttonId: 'ap:123', text: 'Approve' });
    const text = msg({});
    const otherButton = msg({ type: 'interactive', buttonId: 'keepalive_ok', text: '✅ Got it' });
    const report = msg({ text: "today's report" });
    const clientNumber = msg({ appPhoneId: '999' });
    const status = msg({ isStatusUpdate: true });
    const image = msg({ type: 'image', text: '' });
    const out = commandCandidates([approve, text, otherButton, report, clientNumber, status, image]);
    expect(out.map((m) => m.messageId)).toEqual([approve.messageId, text.messageId]);
  });

  it('signs exactly the way Command verifies (HMAC of "<ts>.<body>")', () => {
    const { ts, signature } = signForward('{"a":1}', 'shh', 1_800_000_000_000);
    expect(ts).toBe('1800000000');
    expect(signature).toBe('sha256=' + createHmac('sha256', 'shh').update('1800000000.{"a":1}').digest('hex'));
  });
});

describe('Aries Command hand-off: claims', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    process.env.ARIES_COMMAND_FORWARD_URL = 'https://command.test/api/webhooks/whatsapp/forwarded';
    process.env.ARIES_COMMAND_FORWARD_SECRET = 'shh';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    delete process.env.ARIES_COMMAND_FORWARD_URL;
    delete process.env.ARIES_COMMAND_FORWARD_SECRET;
  });

  it('skips what Command claims, leaves the rest to the bot, ignores foreign ids', async () => {
    const approve = msg({ type: 'interactive', buttonId: 'ch:9' });
    const yes = msg({ text: 'yes' });
    const question = msg({ text: 'what time do you open?' });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ claimed: [yes.messageId, 'wamid.someone-else'] })));
    const skip = await claimForAriesCommand([approve, yes, question]);
    expect([...skip].sort()).toEqual([approve.messageId, yes.messageId].sort());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://command.test/api/webhooks/whatsapp/forwarded');
    const sent = JSON.parse(init.body);
    expect(sent.entry[0].changes[0].value.messages).toHaveLength(3);
    const ts = init.headers['X-Aries-Timestamp'];
    expect(init.headers['X-Aries-Signature']).toBe('sha256=' + createHmac('sha256', 'shh').update(`${ts}.${init.body}`).digest('hex'));
  });

  it('when Command is down, its buttons still never reach the bot and texts do', async () => {
    const approve = msg({ type: 'interactive', buttonId: 'aa:brand' });
    const text = msg({});
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const skip = await claimForAriesCommand([approve, text]);
    expect([...skip]).toEqual([approve.messageId]);
  });

  it('feature off (no env): nothing is sent, only Command buttons are kept from the bot', async () => {
    delete process.env.ARIES_COMMAND_FORWARD_URL;
    const approve = msg({ type: 'interactive', buttonId: 'ap:1' });
    const skip = await claimForAriesCommand([approve, msg({})]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect([...skip]).toEqual([approve.messageId]);
  });

  it('nothing forwardable: no network call at all', async () => {
    const skip = await claimForAriesCommand([msg({ appPhoneId: '999' })]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(skip.size).toBe(0);
  });
});
