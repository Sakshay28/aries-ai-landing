// ═══════════════════════════════════════════════════════════
// 📞 Centralized Phone Number Normalization Utility
// ═══════════════════════════════════════════════════════════
// Enforces standard E164-like formatting across the codebase:
// - Strips all spaces, symbols, plus signs, dashes, parentheses.
// - Normalizes leading zeros (e.g. 0091 -> 91).
// - Converts 10-digit Indian numbers to E164 with '91' prefix.
// - Ensures comparison checks never suffer from raw-string mismatches.
// ═══════════════════════════════════════════════════════════

/**
 * Normalizes any raw phone number string to a canonical digit-only format.
 */
export function normalizePhoneNumber(raw: string | null | undefined): string {
  if (!raw) return '';
  
  // Strip all non-digit characters
  let digits = raw.replace(/\D/g, '');
  
  // Strip leading zeros (e.g., 0091 -> 91, or 08010 -> 8010)
  digits = digits.replace(/^0+/, '');
  
  // Handle Indian 10-digit numbers: default to 91 prefix
  if (digits.length === 10) {
    digits = '91' + digits;
  }
  
  return digits;
}

/**
 * Returns true if two raw phone number strings represent the same canonical number.
 */
export function isSamePhoneNumber(rawA: string | null | undefined, rawB: string | null | undefined): boolean {
  const normA = normalizePhoneNumber(rawA);
  const normB = normalizePhoneNumber(rawB);
  return normA !== '' && normA === normB;
}
