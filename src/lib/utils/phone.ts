/**
 * 📞 Phone Normalization & Validation Utility (E.164 standard)
 * Handles cleanups, leading zeroes, country code defaults, and comparisons.
 */

/**
 * Normalizes a phone number to standard E.164 format (+[country][number]).
 * Strips spaces, punctuation, dashes, brackets, and leading zeroes.
 * If 9-10 digits are detected without country code, prepends workspace default.
 *
 * @param raw The raw phone number input
 * @param defaultCountryCode Default country code (e.g., '91', '971', '+44')
 */
export function normalizePhone(raw: string, defaultCountryCode: string = '91'): string {
  const clean = raw.trim();
  if (!clean) return '';

  // Clean country code digits
  const ccDigits = defaultCountryCode.replace(/[^0-9]/g, '');

  // If starts with +, it already has a country code, just strip non-digits and preserve +
  if (clean.startsWith('+')) {
    const digits = clean.replace(/[^0-9]/g, '');
    return '+' + digits;
  }

  // Handle common international prefix '00' (e.g. 00919876543210 -> +919876543210)
  if (clean.startsWith('00')) {
    const digits = clean.slice(2).replace(/[^0-9]/g, '');
    return '+' + digits;
  }

  // Extract all digits
  const allDigits = clean.replace(/[^0-9]/g, '');

  // Strip leading zeroes (e.g. 0501234567 -> 501234567, 09876543210 -> 9876543210)
  const zeroTrimmed = allDigits.replace(/^0+/, '');

  // If the number already starts with the default country code and looks like a full number
  if (allDigits.startsWith(ccDigits) && allDigits.length >= ccDigits.length + 9) {
    return '+' + allDigits;
  }

  // If subscriber number length matches common local standards (9 digits for UAE, 10 digits for India/US)
  if (zeroTrimmed.length === 10 || zeroTrimmed.length === 9) {
    return '+' + ccDigits + zeroTrimmed;
  }

  // Fallback for short numbers without country codes
  if (allDigits.length <= 10) {
    return '+' + ccDigits + zeroTrimmed;
  }

  return '+' + allDigits;
}

/**
 * Checks if a normalized or raw phone number meets standard length constraints.
 */
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[^0-9]/g, '');
  return cleaned.length >= 7 && cleaned.length <= 15;
}

/**
 * Safely compares two phone numbers by normalising both.
 */
export function comparePhones(a: string, b: string, defaultCountryCode: string = '91'): boolean {
  return normalizePhone(a, defaultCountryCode) === normalizePhone(b, defaultCountryCode);
}

/**
 * Extracts the 10-digit subscriber number from any phone string.
 * Used by PhoneInput to show only the local part inside the field.
 */
export function extract10Digit(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
  if (digits.length === 10) return digits;
  if (digits.length > 10) return digits.slice(digits.length - 10);
  return digits;
}

/**
 * Returns the canonical href value for a tel: link.
 * Always produces +91XXXXXXXXXX regardless of storage format.
 */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/**
 * Formats a phone number for premium, scannable UI display.
 * Separates country codes visually with spacing.
 * E.g., +918233451667 -> +91 82334 51667
 * E.g., +971551234567 -> +971 55 123 4567
 * E.g., +14155550199  -> +1 415 555 0199
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  
  const trimmed = phone.trim();
  const isPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^0-9]/g, '');

  if (digits.length === 0) return trimmed;

  if (isPlus) {
    // India (+91)
    if (digits.startsWith('91') && digits.length === 12) {
      return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }
    // UAE (+971)
    if (digits.startsWith('971') && digits.length === 12) {
      return `+971 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
    }
    // US/Canada (+1)
    if (digits.startsWith('1') && digits.length === 11) {
      return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    }
    // Generic fallback for other country codes:
    if (digits.length > 10) {
      const ccLen = digits.length - 10;
      const cc = digits.slice(0, ccLen);
      const rest = digits.slice(ccLen);
      return `+${cc} ${rest.slice(0, 5)} ${rest.slice(5)}`;
    }
    return `+${digits}`;
  } else {
    // If no plus, but starts with 91 and has 12 digits:
    if (digits.startsWith('91') && digits.length === 12) {
      return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
    }
    // If it's just a 10 digit number:
    if (digits.length === 10) {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    // If it's a 9 digit number (e.g. UAE local number without leading zero):
    if (digits.length === 9) {
      return `+971 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
    }
    return digits;
  }
}
