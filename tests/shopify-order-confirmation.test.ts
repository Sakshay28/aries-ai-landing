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

describe('Meta button-label constraints', () => {
  // Meta rejects QUICK_REPLY button text containing emojis, newlines, variables
  // or formatting characters (error_subcode 2388060). This shipped as a real
  // outage: the order-confirmation template silently never registered, so the
  // whole flow was dead. Emoji in the BODY is fine — only buttons are affected.
  it('button labels contain no emoji, newlines, or placeholders', () => {
    for (const label of Object.values(ORDER_CONFIRMATION_BUTTON_LABELS)) {
      expect(label).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(label).not.toMatch(/[\r\n]/);
      expect(label).not.toMatch(/\{\{\d+\}\}/);
      expect(label.length).toBeLessThanOrEqual(25); // Meta's quick-reply cap
    }
  });
});

describe("Devprayagjal's live override body", () => {
  // The exact wording the client supplied, stored in
  // tenants.shopify_order_confirmation_message. Guards the two collisions
  // found when mapping it onto the fixed 7-placeholder contract.
  const clientBody = `🔱 Har Har Mahadev! 🙏

{{1}} Ji,
Thank you for choosing Devprayagjal. May this sacred connection bring peace, positivity & divine blessings. 🕉️

📦 Order: #{{2}}
🔱 Product: {{3}}
💰 Amount: {{4}} | {{5}}

📍 Address: {{6}}, {{7}}

🙏 Please confirm your order below.`;

  it('passes override validation', () => {
    expect(isValidOrderConfirmationOverride(clientBody)).toBe(true);
  });

  it('does not prefix ₹ before the amount placeholder', () => {
    // notify.ts formatAmount() already returns "₹2499" for INR — a ₹ in the
    // template body too would render "₹₹2499".
    expect(clientBody).not.toMatch(/₹\s*\{\{4\}\}/);
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
