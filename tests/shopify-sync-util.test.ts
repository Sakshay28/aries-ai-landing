import { describe, it, expect } from 'vitest';
import { htmlToText, toNum, orderNumberOf, buildProductSearchText, chunk } from '@/lib/shopify/util';

describe('htmlToText', () => {
  it('strips tags, entities, script/style', () => {
    const html = '<style>.x{}</style><h1>Hi &amp; bye</h1><script>bad()</script><p>Line 1<br>Line 2</p>';
    expect(htmlToText(html)).toBe('Hi & bye Line 1 Line 2');
  });
  it('handles null/empty', () => {
    expect(htmlToText(null)).toBe('');
    expect(htmlToText(undefined)).toBe('');
    expect(htmlToText('')).toBe('');
  });
});

describe('toNum', () => {
  it('parses numeric strings', () => {
    expect(toNum('12.50')).toBe(12.5);
    expect(toNum(42)).toBe(42);
  });
  it('returns null for junk / empty / non-finite', () => {
    expect(toNum(null)).toBeNull();
    expect(toNum(undefined)).toBeNull();
    expect(toNum('')).toBeNull();
    expect(toNum('abc')).toBeNull();
    expect(toNum(NaN)).toBeNull();
  });
});

describe('orderNumberOf', () => {
  it('prefers explicit name', () => {
    expect(orderNumberOf({ name: '#1001', order_number: 1001 })).toBe('#1001');
  });
  it('falls back to order_number with # prefix', () => {
    expect(orderNumberOf({ order_number: 1002 })).toBe('#1002');
  });
  it('returns null when nothing given', () => {
    expect(orderNumberOf({})).toBeNull();
  });
});

describe('buildProductSearchText', () => {
  it('joins fields lowercase and trims length', () => {
    const s = buildProductSearchText({
      title: 'Silver Ring',
      vendor: 'Aries',
      product_type: 'Jewelry',
      tags: ['gift', 'silver'],
      body_text: 'A beautiful silver ring',
      handle: 'silver-ring',
    });
    expect(s).toContain('silver ring');
    expect(s).toContain('aries');
    expect(s).toContain('gift silver');
    expect(s).toBe(s.toLowerCase());
  });
  it('handles empty tags/body', () => {
    const s = buildProductSearchText({ title: 'X', tags: null, body_text: null });
    expect(s).toBe('x');
  });
});

describe('chunk', () => {
  it('splits into fixed sized batches', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(chunk([1], 100)).toEqual([[1]]);
  });
});
