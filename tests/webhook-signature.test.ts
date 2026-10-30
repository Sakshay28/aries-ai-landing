import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifySignature } from '../src/lib/meta/service';

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

describe('webhook: matchWebhookSecret', () => {
  const body = '{"entry":[]}';

  it('matches the tenant secret first', async () => {
    const { matchWebhookSecret } = await import('../src/lib/meta/webhookSecret');
    expect(matchWebhookSecret(body, sign(body, 'tenant'), 'tenant', 'platform')).toBe('tenant');
  });

  it('falls back to the platform secret when the tenant secret is stale', async () => {
    const { matchWebhookSecret } = await import('../src/lib/meta/webhookSecret');
    expect(matchWebhookSecret(body, sign(body, 'platform'), 'stale-tenant', 'platform')).toBe('platform');
  });

  it('rejects a signature made with neither secret', async () => {
    const { matchWebhookSecret } = await import('../src/lib/meta/webhookSecret');
    expect(matchWebhookSecret(body, sign(body, 'attacker'), 'tenant', 'platform')).toBeNull();
  });

  it('rejects a missing signature even when secrets are set', async () => {
    const { matchWebhookSecret } = await import('../src/lib/meta/webhookSecret');
    expect(matchWebhookSecret(body, null, 'tenant', 'platform')).toBeNull();
  });

  it('rejects when no secrets are configured', async () => {
    const { matchWebhookSecret } = await import('../src/lib/meta/webhookSecret');
    expect(matchWebhookSecret(body, sign(body, ''), null, '')).toBeNull();
  });
});
