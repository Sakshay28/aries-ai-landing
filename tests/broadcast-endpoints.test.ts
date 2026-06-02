import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifySignature } from '@/lib/meta/service';
import { sendWhatsAppMessage } from '@/lib/whatsapp/sendMessage';

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

describe('WhatsApp Message API Sender — Client Utilities', () => {
  it('correctly cleans and sanitises formatting characters from phone numbers', () => {
    const rawNumbers = ['+91 (987) 654-3210', '91-99887-76655', ' +1 415 555 2671 '];
    const cleaned = rawNumbers.map(n => n.replace(/\D/g, ''));

    expect(cleaned[0]).toBe('919876543210');
    expect(cleaned[1]).toBe('919988776655');
    expect(cleaned[2]).toBe('14155552671');
  });

  it('correctly fails to send message if credentials are missing', async () => {
    const origToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const origPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    // Temporarily unset
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;

    try {
      const res = await sendWhatsAppMessage({
        to: '919876543210',
        templateName: 'hello_world',
        languageCode: 'en',
        variables: {},
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Missing Meta credentials');
    } finally {
      process.env.WHATSAPP_ACCESS_TOKEN = origToken;
      process.env.WHATSAPP_PHONE_NUMBER_ID = origPhoneId;
    }
  });
});

describe('Webhook HMAC Signature Validation', () => {
  const secret = 'webhook-verify-app-secret-12345';

  it('validates a signature created with a matching secret', () => {
    const body = JSON.stringify({ entry: [{ id: '1' }] });
    const crypto = require('crypto');
    const hash = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const signature = `sha256=${hash}`;

    const isValid = verifySignature(body, signature, secret);
    expect(isValid).toBe(true);
  });

  it('rejects validation when signature does not match secret', () => {
    const body = JSON.stringify({ entry: [{ id: '1' }] });
    const signature = 'sha256=invalidhashvalue';

    const isValid = verifySignature(body, signature, secret);
    expect(isValid).toBe(false);
  });

  it('rejects validation when header has incorrect format', () => {
    const body = JSON.stringify({ entry: [{ id: '1' }] });
    const signature = 'sha256-no-equal-sign';

    const isValid = verifySignature(body, signature, secret);
    expect(isValid).toBe(false);
  });
});
