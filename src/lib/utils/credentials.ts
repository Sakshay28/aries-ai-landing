// ═══════════════════════════════════════════════════════════
// 🔑 WhatsApp credential normalisation
// ═══════════════════════════════════════════════════════════
// Stray whitespace in a credential identifier is silently destructive: a
// leading/trailing space in wa_business_account_id (or phone_number_id) gets
// interpolated into Meta Graph API URLs where it URL-encodes to %20, breaking
// template list/create calls with no obvious error. We trim these on every
// write path so a copy-paste mistake can't recur.
//
// Encrypted fields (wa_access_token, wa_app_secret) are NOT in this list — they
// must be trimmed on their PLAINTEXT value *before* encryption, at each
// encrypt call site, since this helper operates on the post-build updates map.

export const PLAINTEXT_WA_CREDENTIAL_FIELDS = [
  'wa_phone_number_id',
  'wa_business_account_id',
  'wa_verify_token',
] as const;

// Trims stray whitespace from any plaintext WhatsApp credential identifier
// present in an updates map. Mutates and returns the same object for convenience.
export function trimCredentialFields(
  updates: Record<string, unknown>
): Record<string, unknown> {
  for (const field of PLAINTEXT_WA_CREDENTIAL_FIELDS) {
    if (typeof updates[field] === 'string') {
      updates[field] = (updates[field] as string).trim();
    }
  }
  return updates;
}
