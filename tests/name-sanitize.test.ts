import { describe, it, expect } from 'vitest';
import { sanitizeName, firstName } from '../src/lib/utils/name';

describe('sanitizeName', () => {
  it('strips decorative emojis and symbols from a name', () => {
    expect(sanitizeName('🌸Rahul🌸')).toBe('Rahul');
    expect(sanitizeName('❤️ Priya ❤️')).toBe('Priya');
    expect(sanitizeName('•Sky•')).toBe('Sky');
    expect(sanitizeName('✨Aarav Sharma✨')).toBe('Aarav Sharma');
  });

  it('title-cases plain names', () => {
    expect(sanitizeName('rahul sharma')).toBe('Rahul Sharma');
    expect(sanitizeName('NAVNIT VERMA')).toBe('Navnit Verma');
    expect(sanitizeName('  prakash   kumar  ')).toBe('Prakash Kumar');
  });

  it('preserves hyphenated and apostrophe names', () => {
    expect(sanitizeName('jean-luc')).toBe('Jean-Luc');
    expect(sanitizeName("o'brien")).toBe("O'Brien");
    expect(sanitizeName('mary-jane watson')).toBe('Mary-Jane Watson');
  });

  it('keeps accented letters intact', () => {
    expect(sanitizeName('José')).toBe('José');
    expect(sanitizeName('renée dubois')).toBe('Renée Dubois');
  });

  it('returns null for emoji-only / symbol-only input', () => {
    expect(sanitizeName('🌸🌸🌸')).toBeNull();
    expect(sanitizeName('❤️')).toBeNull();
    expect(sanitizeName('•••')).toBeNull();
    expect(sanitizeName('...')).toBeNull();
  });

  it('returns null for phone-like / numeric input', () => {
    expect(sanitizeName('+91 83289 95057')).toBeNull();
    expect(sanitizeName('9876543210')).toBeNull();
    expect(sanitizeName('123')).toBeNull();
  });

  it('returns null for empty / whitespace / nullish input', () => {
    expect(sanitizeName('')).toBeNull();
    expect(sanitizeName('   ')).toBeNull();
    expect(sanitizeName(null)).toBeNull();
    expect(sanitizeName(undefined)).toBeNull();
  });

  it('returns null when fewer than two letters survive', () => {
    expect(sanitizeName('A')).toBeNull();
    expect(sanitizeName('X 🌸')).toBeNull();
  });

  it('strips digits mixed into a name', () => {
    expect(sanitizeName('Rahul123')).toBe('Rahul');
    expect(sanitizeName('Priya 2')).toBe('Priya');
  });
});

describe('firstName', () => {
  it('returns the sanitized first token only', () => {
    expect(firstName('Rahul Sharma')).toBe('Rahul');
    expect(firstName('🌸Priya Singh🌸')).toBe('Priya');
    expect(firstName('navnit verma')).toBe('Navnit');
  });

  it('returns null for unusable input', () => {
    expect(firstName('🌸')).toBeNull();
    expect(firstName('9876543210')).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});
