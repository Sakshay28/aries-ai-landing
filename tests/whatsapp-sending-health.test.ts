import { describe, it, expect } from 'vitest';
import { parseSendingHealth } from '@/lib/whatsapp/sendingHealth';

describe('parseSendingHealth', () => {
  it('flags the payment-method block that went unnoticed for four weeks (Devprayagjal)', () => {
    const h = parseSendingHealth({
      can_send_message: 'BLOCKED',
      entities: [
        { entity_type: 'PHONE_NUMBER', can_send_message: 'LIMITED', errors: [{ error_code: 138024, error_description: 'WhatsApp Business calling cannot use SIP' }] },
        { entity_type: 'WABA', can_send_message: 'BLOCKED', errors: [{ error_code: 141006, error_description: 'There is an error with the payment method.', possible_solution: 'Add a new payment method.' }] },
        { entity_type: 'APP', can_send_message: 'AVAILABLE', errors: [{ error_code: 138025, error_description: 'SIP not configured' }] },
      ],
    });
    expect(h.canSend).toBe('BLOCKED');
    expect(h.issues).toEqual(['WABA: There is an error with the payment method. — Add a new payment method.']);
  });

  it('treats SIP-calling noise and a healthy account as no issues', () => {
    const h = parseSendingHealth({
      can_send_message: 'AVAILABLE',
      entities: [
        { entity_type: 'PHONE_NUMBER', can_send_message: 'LIMITED', errors: [{ error_code: 138024, error_description: 'SIP' }] },
        { entity_type: 'WABA', can_send_message: 'AVAILABLE' },
      ],
    });
    expect(h.issues).toEqual([]);
  });

  it('flags a BLOCKED entity even when Meta gives no error detail', () => {
    expect(parseSendingHealth({ entities: [{ entity_type: 'BUSINESS', can_send_message: 'BLOCKED' }] }).issues)
      .toEqual(['BUSINESS: sending is BLOCKED by Meta']);
  });
});
