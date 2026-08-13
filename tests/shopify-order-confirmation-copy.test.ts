import { describe, it, expect } from 'vitest';
import { renderOrderConfirmationCopy } from '@/lib/shopify/orderConfirmationCopy';

const vars = { customer_name: 'Aarav', order_id: '#1042' };

describe('renderOrderConfirmationCopy', () => {
  it('falls back to the platform default when the tenant has no override', () => {
    const text = renderOrderConfirmationCopy({ shopify_order_confirmation_copy: null }, 'confirm', vars);
    expect(text).toContain('#1042');
    expect(text).toContain('confirmed');

    // change_reminder's default does address the customer by name — verify
    // substitution actually runs on the default text, not just overrides.
    const reminder = renderOrderConfirmationCopy({ shopify_order_confirmation_copy: null }, 'change_reminder', vars);
    expect(reminder).toContain('Aarav');
    expect(reminder).toContain('#1042');
  });

  it('falls back to the default when the override key is missing or blank', () => {
    expect(renderOrderConfirmationCopy({ shopify_order_confirmation_copy: {} }, 'cancel', vars)).toContain('cancellation');
    expect(renderOrderConfirmationCopy({ shopify_order_confirmation_copy: { cancel: '   ' } }, 'cancel', vars)).toContain('cancellation');
  });

  it('uses the tenant override and substitutes both placeholders', () => {
    const text = renderOrderConfirmationCopy(
      { shopify_order_confirmation_copy: { change_reminder: 'Hi {{customer_name}}, order {{order_id}} needs your details.' } },
      'change_reminder',
      vars,
    );
    expect(text).toBe('Hi Aarav, order #1042 needs your details.');
  });

  it('substitutes every occurrence of a repeated placeholder', () => {
    const text = renderOrderConfirmationCopy(
      { shopify_order_confirmation_copy: { confirm: '{{customer_name}}! {{customer_name}}, order {{order_id}} for {{order_id}}.' } },
      'confirm',
      vars,
    );
    expect(text).toBe('Aarav! Aarav, order #1042 for #1042.');
  });

  it('covers all 5 copy keys with a non-empty default', () => {
    const keys = ['confirm', 'cancel', 'change_request', 'change_received', 'change_reminder'] as const;
    for (const key of keys) {
      const text = renderOrderConfirmationCopy({ shopify_order_confirmation_copy: null }, key, vars);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/\{\{/); // no unresolved placeholders
    }
  });
});
