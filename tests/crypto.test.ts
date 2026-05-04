import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from '../src/lib/utils/crypto';

describe('crypto: encryptToken / decryptToken', () => {
  it('encrypts and decrypts a token round-trip', () => {
    const plain = 'EAAG_real_meta_token_with:colons:and-dashes_12345';
    const encrypted = encryptToken(plain);
    expect(encrypted).not.toBeNull();
    expect(encrypted).not.toBe(plain);
    expect(encrypted!.startsWith('enc:v1:')).toBe(true);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(plain);
  });

  it('returns null for null input', () => {
    expect(encryptToken(null)).toBeNull();
    expect(decryptToken(null)).toBeNull();
  });

  it('does not double-encrypt an already-encrypted token', () => {
    const plain = 'some-token';
    const once = encryptToken(plain)!;
    const twice = encryptToken(once);
    expect(twice).toBe(once);
  });

  it('returns legacy plaintext as-is when no enc:v1: prefix', () => {
    // Backwards compatibility for tokens that existed before encryption was added.
    const legacy = 'plain-legacy-token';
    expect(decryptToken(legacy)).toBe(legacy);
  });

  it('produces different ciphertexts for same plaintext (random IV)', () => {
    const plain = 'same-token';
    const a = encryptToken(plain);
    const b = encryptToken(plain);
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe(decryptToken(b));
  });

  it('returns input unchanged when encrypted blob is malformed', () => {
    const malformed = 'enc:v1:notenoughparts';
    expect(decryptToken(malformed)).toBe(malformed);
  });
});
