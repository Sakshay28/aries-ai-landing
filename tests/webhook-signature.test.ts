import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifySignature } from '../src/lib/whatsapp/service';

const APP_SECRET = 'test-app-secret-for-hmac';

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('webhook: verifySignature', () => {
  it('accepts a valid Meta x-hub-signature-256', () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    expect(verifySignature(body, sign(body), APP_SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const sig = sign(body);
    const tampered = body + ' '; // any byte change
    expect(verifySignature(tampered, sig, APP_SECRET)).toBe(false);
  });

  it('rejects a signature computed with a different secret', () => {
    const body = '{"hello":"world"}';
    const wrongSig = sign(body, 'wrong-secret');
    expect(verifySignature(body, wrongSig, APP_SECRET)).toBe(false);
  });

  it('fails CLOSED when appSecret is empty (regression: prev returned true)', () => {
    const body = '{"x":1}';
    expect(verifySignature(body, sign(body), '')).toBe(false);
  });

  it('fails CLOSED when signature is missing', () => {
    const body = '{"x":1}';
    expect(verifySignature(body, '', APP_SECRET)).toBe(false);
  });

  it('rejects when signature lengths differ (no timingSafeEqual crash)', () => {
    const body = '{"x":1}';
    expect(verifySignature(body, 'sha256=tooshort', APP_SECRET)).toBe(false);
  });

  it('rejects signature without sha256= prefix', () => {
    const body = '{"x":1}';
    const sig = sign(body).replace('sha256=', '');
    expect(verifySignature(body, sig, APP_SECRET)).toBe(false);
  });
});
