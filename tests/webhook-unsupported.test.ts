import { describe, it, expect } from 'vitest';
import { parseMetaWebhook } from '../src/lib/meta/service';

// Builds a minimal Meta webhook envelope around a single inbound message object.
function envelope(message: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: '1178978078636436' },
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

describe('webhook: parsing type:"unsupported"', () => {
  it('captures Meta error code + reason when contents can\'t be delivered', () => {
    const parsed = parseMetaWebhook(
      envelope({
        from: '917861004444',
        id: 'wamid.UNSUP1',
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'unsupported',
        errors: [
          {
            code: 131051,
            title: 'Unsupported message type',
            error_data: { details: 'Message type is not currently supported.' },
          },
        ],
      })
    );

    expect(parsed).not.toBeNull();
    expect(parsed!.type).toBe('unsupported');
    expect(parsed!.text).toBe('[unsupported]');
    expect(parsed!.errorCode).toBe(131051);
    expect(parsed!.errorReason).toBe('Unsupported message type');
  });

  it('falls back to error_data.details when no title is present', () => {
    const parsed = parseMetaWebhook(
      envelope({
        from: '917861004444',
        id: 'wamid.UNSUP2',
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'unsupported',
        errors: [{ code: 131000, error_data: { details: 'Something went wrong' } }],
      })
    );
    expect(parsed!.errorReason).toBe('Something went wrong');
    expect(parsed!.errorCode).toBe(131000);
  });

  it('leaves error fields undefined for a normal text message', () => {
    const parsed = parseMetaWebhook(
      envelope({
        from: '917861004444',
        id: 'wamid.TEXT1',
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: 'Hello' },
      })
    );
    expect(parsed!.text).toBe('Hello');
    expect(parsed!.errorCode).toBeUndefined();
    expect(parsed!.errorReason).toBeUndefined();
  });
});
