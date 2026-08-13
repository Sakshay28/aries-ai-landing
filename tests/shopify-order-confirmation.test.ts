import { describe, it, expect } from 'vitest';
import {
  isValidOrderConfirmationOverride,
  ORDER_CONFIRMATION_PLACEHOLDER_COUNT,
  ORDER_CONFIRMATION_PAYLOAD_PREFIX,
  ORDER_CONFIRMATION_BUTTON_LABELS,
} from '@/lib/shopify/templates';

describe('isValidOrderConfirmationOverride', () => {
  const valid = 'Hi {{1}}! Order {{2}}: {{3}} — {{4}} ({{5}}). Delivering to {{6}}, {{7}}.';

  it('accepts a body containing all 7 required placeholders', () => {
    expect(isValidOrderConfirmationOverride(valid)).toBe(true);
  });

  it('accepts placeholders repeated or out of textual order', () => {
    const reordered = '{{7}} {{6}} {{5}} {{4}} {{3}} {{2}} {{1}} and again {{1}}';
    expect(isValidOrderConfirmationOverride(reordered)).toBe(true);
  });

  it(`rejects a body missing any of {{1}}..{{${ORDER_CONFIRMATION_PLACEHOLDER_COUNT}}}`, () => {
    expect(isValidOrderConfirmationOverride('Hi {{1}}! Order {{2}} only.')).toBe(false);
    expect(isValidOrderConfirmationOverride('No placeholders at all.')).toBe(false);
  });

  it('rejects a body referencing a placeholder beyond the fixed count', () => {
    const withExtra = valid.replace('{{7}}.', '{{7}} and {{8}}.');
    expect(isValidOrderConfirmationOverride(withExtra)).toBe(false);
  });
});

describe('order-confirmation button payload prefixes', () => {
  it('are distinct and non-empty', () => {
    const values = Object.values(ORDER_CONFIRMATION_PAYLOAD_PREFIX);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(v.length).toBeGreaterThan(0);
  });

  it('button labels map 1:1 to the payload-prefix keys', () => {
    expect(Object.keys(ORDER_CONFIRMATION_BUTTON_LABELS).sort()).toEqual(Object.keys(ORDER_CONFIRMATION_PAYLOAD_PREFIX).sort());
  });
});
