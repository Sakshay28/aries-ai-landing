import { describe, it, expect } from 'vitest';
import { parseMetaWebhook, parseAllMetaMessages } from '../src/lib/meta/service';

// Meta can (and does) batch more than one message/status into a single
// webhook delivery — e.g. two messages sent moments apart on a flaky
// connection. Reading only `messages[0]` silently drops everything after
// it: no DB row, no reply, no error. This is what made a customer's
// "tomorrow" vanish mid-booking while every other message in the same
// conversation processed fine.
function envelope(messages: Record<string, unknown>[]) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: '1178978078636436' },
              contacts: [{ profile: { name: 'Test Customer' }, wa_id: '917861004444' }],
              messages,
            },
          },
        ],
      },
    ],
  };
}

function textMsg(id: string, body: string) {
  return {
    from: '917861004444',
    id,
    timestamp: String(Math.floor(Date.now() / 1000)),
    type: 'text',
    text: { body },
  };
}

describe('webhook: batched messages in one payload', () => {
  it('parseAllMetaMessages returns every message, not just the first', () => {
    const parsed = parseAllMetaMessages(
      envelope([textMsg('wamid.A', 'tomorrow'), textMsg('wamid.B', '13sept')])
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0].text).toBe('tomorrow');
    expect(parsed[1].text).toBe('13sept');
  });

  it('preserves message order within the batch', () => {
    const parsed = parseAllMetaMessages(
      envelope([textMsg('wamid.1', 'first'), textMsg('wamid.2', 'second'), textMsg('wamid.3', 'third')])
    );
    expect(parsed.map(p => p.text)).toEqual(['first', 'second', 'third']);
  });

  it('parseMetaWebhook (back-compat single-item accessor) still returns just the first', () => {
    const parsed = parseMetaWebhook(
      envelope([textMsg('wamid.A', 'tomorrow'), textMsg('wamid.B', '13sept')])
    );
    expect(parsed!.text).toBe('tomorrow');
  });

  it('handles a single-message payload identically to before (no regression)', () => {
    const all = parseAllMetaMessages(envelope([textMsg('wamid.solo', 'Hello')]));
    const single = parseMetaWebhook(envelope([textMsg('wamid.solo', 'Hello')]));
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(single);
  });

  it('an empty payload yields an empty array, not a crash', () => {
    expect(parseAllMetaMessages({})).toEqual([]);
    expect(parseMetaWebhook({})).toBeNull();
  });

  it('batches multiple status updates the same way', () => {
    const body = {
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            metadata: { phone_number_id: '1178978078636436' },
            statuses: [
              { id: 'wamid.S1', recipient_id: '917861004444', status: 'sent', timestamp: String(Math.floor(Date.now() / 1000)) },
              { id: 'wamid.S2', recipient_id: '917861004444', status: 'delivered', timestamp: String(Math.floor(Date.now() / 1000)) },
            ],
          },
        }],
      }],
    };
    const parsed = parseAllMetaMessages(body);
    expect(parsed).toHaveLength(2);
    expect(parsed.map(p => p.status)).toEqual(['sent', 'delivered']);
  });
});
