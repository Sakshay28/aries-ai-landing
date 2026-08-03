import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyShopifyHmac, domainFromHeader } from '@/lib/shopify/webhookVerify';

const SECRET = 'shhh_shared_secret_from_custom_app';

function signShopify(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}

describe('verifyShopifyHmac', () => {
  it('accepts a correctly signed body', () => {
    const body = JSON.stringify({ id: 123, name: '#1001' });
    const sig = signShopify(body, SECRET);
    expect(verifyShopifyHmac(body, sig, SECRET)).toBe(true);
  });

  it('accepts a Buffer body of the same bytes', () => {
    const body = JSON.stringify({ id: 123 });
    const sig = signShopify(body, SECRET);
    expect(verifyShopifyHmac(Buffer.from(body, 'utf8'), sig, SECRET)).toBe(true);
  });

  it('rejects when the body is tampered with', () => {
    const body = JSON.stringify({ id: 123 });
    const sig = signShopify(body, SECRET);
    expect(verifyShopifyHmac(body + ' ', sig, SECRET)).toBe(false);
  });

  it('rejects when the signature is wrong', () => {
    const body = JSON.stringify({ id: 123 });
    expect(verifyShopifyHmac(body, 'wrong-signature', SECRET)).toBe(false);
  });

  it('rejects when the secret is wrong (would-be MITM)', () => {
    const body = JSON.stringify({ id: 123 });
    const sig = signShopify(body, 'attacker_guess');
    expect(verifyShopifyHmac(body, sig, SECRET)).toBe(false);
  });

  it('rejects empty signature or empty secret', () => {
    expect(verifyShopifyHmac('body', '', SECRET)).toBe(false);
    expect(verifyShopifyHmac('body', 'sig', '')).toBe(false);
    expect(verifyShopifyHmac('body', null, SECRET)).toBe(false);
    expect(verifyShopifyHmac('body', undefined, SECRET)).toBe(false);
  });

  it('does not throw on differently sized signature strings', () => {
    expect(() => verifyShopifyHmac('body', 'a', SECRET)).not.toThrow();
    expect(verifyShopifyHmac('body', 'a', SECRET)).toBe(false);
  });
});

describe('domainFromHeader', () => {
  it('returns lowercased trimmed domain when valid', () => {
    expect(domainFromHeader('  ACME.myshopify.com  ')).toBe('acme.myshopify.com');
  });
  it('rejects arbitrary hosts', () => {
    expect(domainFromHeader('evil.com')).toBeNull();
    expect(domainFromHeader('example.myshopify.com.evil.com')).toBeNull();
  });
  it('handles null/empty', () => {
    expect(domainFromHeader(null)).toBeNull();
    expect(domainFromHeader('')).toBeNull();
  });
});
