import { describe, it, expect } from 'vitest';
import { reconcileProductLinks, type ShopifyAIContext } from '@/lib/shopify/aiContext';

function ctxWith(products: ShopifyAIContext['matched_products']): ShopifyAIContext {
  return { store_url: 'devprayagjal.com', currency: 'INR', matched_products: products };
}

describe('reconcileProductLinks', () => {
  it('leaves an exact matched-product URL untouched', () => {
    const ctx = ctxWith([{
      handle: '7-mukhi-rudraksha', title: '7 Mukhi Nepali Rudraksha', vendor: null,
      price_min: 999, price_max: 6500, currency: 'INR', in_stock: true,
      url: 'https://devprayagjal.com/products/7-mukhi-rudraksha', snippet: null, image_url: null,
    }]);
    const reply = 'Here you go: https://devprayagjal.com/products/7-mukhi-rudraksha';
    expect(reconcileProductLinks(reply, ctx)).toBe(reply);
  });

  it('rewrites a hallucinated slug back to the real handle (the reported bug)', () => {
    const ctx = ctxWith([{
      handle: '7-mukhi-rudraksha', title: '7 Mukhi Nepali Rudraksha', vendor: null,
      price_min: 999, price_max: 6500, currency: 'INR', in_stock: true,
      url: 'https://devprayagjal.com/products/7-mukhi-rudraksha', snippet: null, image_url: null,
    }]);
    const reply = 'You can buy it here: https://devprayagjal.com/products/7-mukhi-nepali-rudraksha-silver-coated-16-19mm';
    expect(reconcileProductLinks(reply, ctx)).toBe(
      'You can buy it here: https://devprayagjal.com/products/7-mukhi-rudraksha'
    );
  });

  it('disambiguates via token-subset match when multiple products are in context', () => {
    const ctx = ctxWith([
      {
        handle: '7-mukhi-rudraksha', title: '7 Mukhi Nepali Rudraksha', vendor: null,
        price_min: 999, price_max: 6500, currency: 'INR', in_stock: true,
        url: 'https://devprayagjal.com/products/7-mukhi-rudraksha', snippet: null, image_url: null,
      },
      {
        handle: '8-mukhi-rudraksha', title: '8 Mukhi Nepali Rudraksha', vendor: null,
        price_min: 899, price_max: 5500, currency: 'INR', in_stock: true,
        url: 'https://devprayagjal.com/products/8-mukhi-rudraksha', snippet: null, image_url: null,
      },
    ]);
    const reply = 'Link: https://devprayagjal.com/products/8-mukhi-nepali-rudraksha-original-certified';
    expect(reconcileProductLinks(reply, ctx)).toBe(
      'Link: https://devprayagjal.com/products/8-mukhi-rudraksha'
    );
  });

  it('drops an unresolvable link rather than ship a dead one', () => {
    const ctx = ctxWith([
      {
        handle: '7-mukhi-rudraksha', title: '7 Mukhi Nepali Rudraksha', vendor: null,
        price_min: 999, price_max: 6500, currency: 'INR', in_stock: true,
        url: 'https://devprayagjal.com/products/7-mukhi-rudraksha', snippet: null, image_url: null,
      },
      {
        handle: '8-mukhi-rudraksha', title: '8 Mukhi Nepali Rudraksha', vendor: null,
        price_min: 899, price_max: 5500, currency: 'INR', in_stock: true,
        url: 'https://devprayagjal.com/products/8-mukhi-rudraksha', snippet: null, image_url: null,
      },
    ]);
    const reply = 'Check it out: https://devprayagjal.com/products/completely-made-up-item-xyz';
    expect(reconcileProductLinks(reply, ctx)).toBe('Check it out:');
  });

  it('is a no-op with no matched products or no reply', () => {
    expect(reconcileProductLinks('hello', null)).toBe('hello');
    expect(reconcileProductLinks('hello', ctxWith([]))).toBe('hello');
    expect(reconcileProductLinks('', ctxWith([{
      handle: 'x', title: 'x', vendor: null, price_min: null, price_max: null,
      currency: null, in_stock: true, url: 'https://devprayagjal.com/products/x', snippet: null, image_url: null,
    }]))).toBe('');
  });
});
