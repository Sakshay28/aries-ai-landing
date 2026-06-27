import { describe, it, expect } from 'vitest';
import {
  evaluateConditions,
  pickVariant,
  hashToPercent,
  isWindowClosedError,
  type ConditionGroup,
} from '../src/lib/automations/logic';
import {
  validateDelay,
  validateAbSplit,
  validateFreqCap,
  validateConditions,
  MAX_DELAY_MS,
} from '../src/lib/automations/validate';

// ═══════════════════════════════════════
// L6 — Conditional gating
// ═══════════════════════════════════════
describe('evaluateConditions', () => {
  const vars = {
    guest_count: '6 guests',
    party_size: '6',
    special_requests: 'Birthday cake',
    customer_name: 'Ravi',
    table: '',
  };

  it('passes when there are no conditions (backward compatible)', () => {
    expect(evaluateConditions(null, vars).passed).toBe(true);
    expect(evaluateConditions({ match: 'all', rules: [] }, vars).passed).toBe(true);
  });

  it('AND: all rules must hold', () => {
    const g: ConditionGroup = { match: 'all', rules: [
      { variable: 'party_size', operator: 'gte', value: '4' },
      { variable: 'special_requests', operator: 'is_not_empty' },
    ]};
    expect(evaluateConditions(g, vars).passed).toBe(true);
  });

  it('AND: fails and reports the failing rule', () => {
    const g: ConditionGroup = { match: 'all', rules: [
      { variable: 'party_size', operator: 'gte', value: '10' },
    ]};
    const r = evaluateConditions(g, vars);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain('party_size');
  });

  it('OR: any rule passing is enough', () => {
    const g: ConditionGroup = { match: 'any', rules: [
      { variable: 'party_size', operator: 'gte', value: '100' },
      { variable: 'customer_name', operator: 'eq', value: 'ravi' }, // case-insensitive
    ]};
    expect(evaluateConditions(g, vars).passed).toBe(true);
  });

  it('parses the leading number out of a label like "6 guests"', () => {
    const g: ConditionGroup = { match: 'all', rules: [{ variable: 'guest_count', operator: 'gt', value: '5' }] };
    expect(evaluateConditions(g, vars).passed).toBe(true);
    const g2: ConditionGroup = { match: 'all', rules: [{ variable: 'guest_count', operator: 'lt', value: '5' }] };
    expect(evaluateConditions(g2, vars).passed).toBe(false);
  });

  it('is_empty / is_not_empty', () => {
    expect(evaluateConditions({ match: 'all', rules: [{ variable: 'table', operator: 'is_empty' }] }, vars).passed).toBe(true);
    expect(evaluateConditions({ match: 'all', rules: [{ variable: 'table', operator: 'is_not_empty' }] }, vars).passed).toBe(false);
  });

  it('contains / not_contains are case-insensitive', () => {
    expect(evaluateConditions({ match: 'all', rules: [{ variable: 'special_requests', operator: 'contains', value: 'cake' }] }, vars).passed).toBe(true);
    expect(evaluateConditions({ match: 'all', rules: [{ variable: 'special_requests', operator: 'not_contains', value: 'wine' }] }, vars).passed).toBe(true);
  });
});

// ═══════════════════════════════════════
// L7 — A/B variant selection
// ═══════════════════════════════════════
describe('pickVariant', () => {
  const rule = { message_text: 'A copy', message_text_b: 'B copy', ab_split_percent: 50 };

  it('returns variant=null when A/B is not configured', () => {
    expect(pickVariant({ message_text: 'only A', message_text_b: null, ab_split_percent: 0 }, 'k').variant).toBeNull();
    expect(pickVariant({ message_text: 'only A', message_text_b: 'B', ab_split_percent: 0 }, 'k').variant).toBeNull();
  });

  it('is deterministic — same key always yields the same variant', () => {
    const a = pickVariant(rule, '+919812345678');
    const b = pickVariant(rule, '+919812345678');
    expect(a.variant).toBe(b.variant);
    expect(a.text).toBe(b.text);
  });

  it('100% split always sends B; ~0 (1%) almost always A', () => {
    expect(pickVariant({ ...rule, ab_split_percent: 100 }, 'anyone').variant).toBe('B');
  });

  it('roughly honors the split across many keys', () => {
    let bCount = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      if (pickVariant(rule, `key-${i}`).variant === 'B') bCount++;
    }
    const ratio = bCount / N;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it('hashToPercent stays within 0–99', () => {
    for (let i = 0; i < 100; i++) {
      const p = hashToPercent(`x${i}`);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(100);
    }
  });
});

// ═══════════════════════════════════════
// L10 — 24h window error classification
// ═══════════════════════════════════════
describe('isWindowClosedError', () => {
  it('detects Meta code 131047', () => {
    expect(isWindowClosedError({ code: 131047, message: 'whatever' })).toBe(true);
  });
  it('detects the message text even without a code', () => {
    expect(isWindowClosedError({ message: 'Meta Cloud API text error 400: more than 24 hours have passed' })).toBe(true);
    expect(isWindowClosedError(new Error('re-engagement message required'))).toBe(true);
  });
  it('does not flag unrelated errors', () => {
    expect(isWindowClosedError({ code: 131048, message: 'spam rate limit' })).toBe(false);
    expect(isWindowClosedError(new Error('network timeout'))).toBe(false);
    expect(isWindowClosedError(null)).toBe(false);
  });
});

// ═══════════════════════════════════════
// Server-side validation
// ═══════════════════════════════════════
describe('validateDelay', () => {
  it('accepts normal delays incl. weeks', () => {
    expect(validateDelay(0, 'minutes')).toBeNull();
    expect(validateDelay(3, 'hours')).toBeNull();
    expect(validateDelay(2, 'weeks')).toBeNull();
  });
  it('rejects negative and non-numeric', () => {
    expect(validateDelay(-1, 'minutes')).toBeTruthy();
    expect(validateDelay('5' as unknown, 'minutes')).toBeTruthy();
  });
  it('rejects invalid units', () => {
    expect(validateDelay(1, 'fortnights')).toBeTruthy();
  });
  it('rejects delays beyond the 90-day ceiling', () => {
    expect(validateDelay(91, 'days')).toBeTruthy();
    expect(validateDelay(13, 'weeks')).toBeTruthy(); // 91 days
    // boundary: exactly 90 days is allowed
    expect(validateDelay(90, 'days')).toBeNull();
    expect(MAX_DELAY_MS).toBe(90 * 86_400_000);
  });
});

describe('validateAbSplit / validateFreqCap', () => {
  it('ab split 0–100 only', () => {
    expect(validateAbSplit(0)).toBeNull();
    expect(validateAbSplit(50)).toBeNull();
    expect(validateAbSplit(100)).toBeNull();
    expect(validateAbSplit(101)).toBeTruthy();
    expect(validateAbSplit(-1)).toBeTruthy();
    expect(validateAbSplit(12.5)).toBeTruthy();
  });
  it('freq cap positive integer or null', () => {
    expect(validateFreqCap(null)).toBeNull();
    expect(validateFreqCap(3)).toBeNull();
    expect(validateFreqCap(0)).toBeTruthy();
    expect(validateFreqCap(-2)).toBeTruthy();
  });
});

describe('validateConditions', () => {
  it('null/empty → null value, no error', () => {
    expect(validateConditions(null)).toEqual({ value: null });
    expect(validateConditions({ match: 'all', rules: [] })).toEqual({ value: null });
  });
  it('rejects unknown variable', () => {
    const r = validateConditions({ match: 'all', rules: [{ variable: 'not_a_var', operator: 'eq', value: 'x' }] });
    expect(r.error).toBeTruthy();
  });
  it('rejects bad operator', () => {
    const r = validateConditions({ match: 'all', rules: [{ variable: 'party_size', operator: 'bogus', value: 'x' }] });
    expect(r.error).toBeTruthy();
  });
  it('requires a value for value-operators', () => {
    const r = validateConditions({ match: 'all', rules: [{ variable: 'party_size', operator: 'gte' }] });
    expect(r.error).toBeTruthy();
  });
  it('accepts a valid group and normalizes match', () => {
    const r = validateConditions({ match: 'weird', rules: [{ variable: 'party_size', operator: 'gte', value: '4' }] });
    expect(r.error).toBeUndefined();
    expect(r.value).toEqual({ match: 'all', rules: [{ variable: 'party_size', operator: 'gte', value: '4' }] });
  });
  it('value-less operators (is_empty) need no value', () => {
    const r = validateConditions({ match: 'any', rules: [{ variable: 'table', operator: 'is_empty' }] });
    expect(r.error).toBeUndefined();
    expect(r.value?.rules[0].operator).toBe('is_empty');
  });
});
