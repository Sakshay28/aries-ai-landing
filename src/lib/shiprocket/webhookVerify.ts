// Shiprocket webhook authenticity check.
//
// Unlike Shopify (HMAC over the raw body), Shiprocket's webhook config is a
// static URL + a merchant-configured `x-api-key` header value [UNVERIFIED
// exact header name — confirm against a live webhook config screen]. We
// generate that secret ourselves per tenant and the merchant pastes it into
// Shiprocket's dashboard, so this is a timing-safe static-string compare,
// not an HMAC verification.

import crypto from 'crypto';

export function verifyShiprocketApiKey(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
