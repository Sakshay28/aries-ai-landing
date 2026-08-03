// Shopify webhook HMAC verification.
//
// Shopify signs the request body with the shared secret (HMAC-SHA256,
// base64) and puts the digest in the `X-Shopify-Hmac-Sha256` header.
// The digest is computed over the RAW request body — DO NOT parse the
// body before verifying, since re-serialising can change bytes.
//
// https://shopify.dev/docs/apps/build/webhooks/customize/verify-webhook

import crypto from 'crypto';

export function verifyShopifyHmac(rawBody: string | Buffer, signature: string | null | undefined, sharedSecret: string): boolean {
  if (!signature || !sharedSecret) return false;
  const buf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const expected = crypto.createHmac('sha256', sharedSecret).update(buf).digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Resolve the tenant from the `X-Shopify-Shop-Domain` header (e.g. `acme.myshopify.com`). */
export function domainFromHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim().toLowerCase();
  if (!trimmed.endsWith('.myshopify.com')) return null;
  return trimmed;
}
