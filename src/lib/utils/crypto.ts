// Legacy entrypoint kept so callers don't churn. Real implementation lives
// in @/lib/security/keyManager and understands versioned keys (v1, v2, v3…).
// The old single-key path here would silently treat v2+ ciphertext as
// "legacy plaintext" and pass it straight to downstream APIs — fix was to
// route every caller through the multi-version decryptor.

import {
  encryptTokenV2,
  decryptTokenV2,
} from '@/lib/security/keyManager';

export function encryptToken(text: string | null): string | null {
  return encryptTokenV2(text);
}

export function decryptToken(encryptedText: string | null): string | null {
  return decryptTokenV2(encryptedText);
}
