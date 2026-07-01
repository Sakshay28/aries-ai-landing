import { describe, it, expect } from 'vitest';
import { normalizePhoneNumber, isSamePhoneNumber } from '../src/lib/whatsapp/phone';

describe('normalizePhoneNumber', () => {
  it('handles empty / null inputs gracefully', () => {
    expect(normalizePhoneNumber(null)).toBe('');
    expect(normalizePhoneNumber(undefined)).toBe('');
    expect(normalizePhoneNumber('')).toBe('');
  });

  it('strips dashes, spaces, plus sign, and brackets', () => {
    expect(normalizePhoneNumber('+91 80103-07249')).toBe('918010307249');
    expect(normalizePhoneNumber('+91 (987) 515-2290')).toBe('919875152290');
    expect(normalizePhoneNumber('  +1 (555) 019-2834  ')).toBe('15550192834');
  });

  it('normalizes leading zeros', () => {
    expect(normalizePhoneNumber('00918010307249')).toBe('918010307249');
    expect(normalizePhoneNumber('08010307249')).toBe('918010307249'); // 10 digits after stripping 0, then pre-fixed with 91
  });

  it('auto-prefixes 10 digit Indian numbers with 91', () => {
    expect(normalizePhoneNumber('8010307249')).toBe('918010307249');
    expect(normalizePhoneNumber('9875152290')).toBe('919875152290');
  });

  it('keeps longer international formats intact', () => {
    expect(normalizePhoneNumber('447911123456')).toBe('447911123456'); // UK
    expect(normalizePhoneNumber('15550192834')).toBe('15550192834');   // US
  });
});

describe('isSamePhoneNumber', () => {
  it('correctly compares equivalent formats', () => {
    expect(isSamePhoneNumber('+918010307249', '8010307249')).toBe(true);
    expect(isSamePhoneNumber('0091 987-515-2290', '+91 (987) 515-2290')).toBe(true);
    expect(isSamePhoneNumber('8010307249', '9875152290')).toBe(false);
  });
});
