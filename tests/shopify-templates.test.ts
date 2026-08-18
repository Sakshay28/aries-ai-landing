import { describe, it, expect } from 'vitest';
import { shopifyTemplateSpecs } from '@/lib/shopify/templates';

describe('shopifyTemplateSpecs', () => {
  const specs = shopifyTemplateSpecs();

  it('ships the nine canned templates', () => {
    const names = specs.map(s => s.name).sort();
    expect(names).toEqual([
      'shopify_cart_recovery',
      'shopify_delivered',
      'shopify_order_cancelled',
      'shopify_order_confirmation',
      'shopify_order_confirmation_action',
      'shopify_out_for_delivery',
      'shopify_review_request',
      'shopify_rto',
      'shopify_shipping_update',
    ]);
  });

  it('classifies utility vs marketing correctly', () => {
    const byName = new Map(specs.map(s => [s.name, s]));
    expect(byName.get('shopify_order_confirmation')!.category).toBe('UTILITY');
    expect(byName.get('shopify_shipping_update')!.category).toBe('UTILITY');
    expect(byName.get('shopify_order_cancelled')!.category).toBe('UTILITY');
    expect(byName.get('shopify_order_confirmation_action')!.category).toBe('UTILITY');
    expect(byName.get('shopify_out_for_delivery')!.category).toBe('UTILITY');
    expect(byName.get('shopify_delivered')!.category).toBe('UTILITY');
    expect(byName.get('shopify_rto')!.category).toBe('UTILITY');
    // Marketing category is required for pre-purchase / promotional touches
    expect(byName.get('shopify_cart_recovery')!.category).toBe('MARKETING');
    expect(byName.get('shopify_review_request')!.category).toBe('MARKETING');
  });

  it('shopify_order_confirmation_action has 3 quick-reply buttons with the fixed labels', () => {
    const spec = specs.find(s => s.name === 'shopify_order_confirmation_action')!;
    expect(spec.buttons?.map(b => b.text)).toEqual(['Confirm Order', 'Cancel Order', 'Change Details']);
    expect(spec.buttons?.every(b => b.type === 'QUICK_REPLY')).toBe(true);
  });

  it('has bodyExample entries matching the number of {{n}} placeholders', () => {
    for (const s of specs) {
      const placeholders = (s.body.match(/\{\{(\d+)\}\}/g) || []).length;
      expect(s.bodyExample.length).toBe(placeholders);
    }
  });

  it('URL buttons carry an example for Meta approval', () => {
    for (const s of specs) {
      for (const b of s.buttons || []) {
        if (b.type === 'URL') {
          expect(Array.isArray(b.example) && b.example.length > 0).toBe(true);
        }
      }
    }
  });
});
