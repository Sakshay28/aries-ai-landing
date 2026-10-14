import { describe, it, expect, vi } from 'vitest';

const mockProducts = [
  {
    id: 'prod-7',
    shopify_id: 7777777,
    handle: '7-mukhi-rudraksha',
    title: '7 Mukhi Nepali Rudraksha | Free Ganga Siddh at Haridwar',
    vendor: 'Devprayagjal',
    product_type: 'Nepali Rudraksha',
    price_min: 999,
    price_max: 6500,
    currency: 'INR',
    image_url: 'https://cdn.shopify.com/s/files/1/0903/5451/6277/files/7mukhi.jpg',
    total_inventory: 10,
    tags: ['7 mukhi', 'nepali rudraksha', 'bestsellers'],
    search_text: '7 mukhi nepali rudraksha | free ganga siddh at haridwar devprayagjal nepali rudraksha 7-mukhi-rudraksha goddess lakshmi financial growth',
    status: 'active',
    body_text: 'The 7 Mukhi Rudraksha Mala is associated with Goddess Lakshmi...',
  },
  {
    id: 'prod-1-14',
    shopify_id: 14141414,
    handle: '1-14-mukhi-gaurishankar-rudraksha-nepali-kanthi-mala-original-certified',
    title: '1–14 Mukhi Siddh Mala (Gaurishankar Rudraksha & Ganesh Mukhi) with Pure Silver',
    vendor: 'Devprayagjal',
    product_type: 'Rudraksha Mala',
    price_min: 11999,
    price_max: 11999,
    currency: 'INR',
    image_url: 'https://cdn.shopify.com/s/files/1/0903/5451/6277/files/1-14mukhi.jpg',
    total_inventory: 5,
    tags: ['1-14 mukhi', 'siddh mala', 'gaurishankar'],
    search_text: '1–14 mukhi siddh mala (gaurishankar rudraksha & ganesh mukhi) with pure silver 1-14-mukhi-gaurishankar-rudraksha-nepali-kanthi-mala-original-certified',
    status: 'active',
    body_text: 'Sacred 1-14 Mukhi Siddh Mala with pure silver, certified original Nepali beads.',
  },
  {
    id: 'prod-17',
    shopify_id: 17171717,
    handle: '17-mukhi-nepali-rudraksha',
    title: 'Natural 17 Mukhi Rudraksha (Nepali)',
    vendor: 'Devprayagjal',
    product_type: 'Nepali Rudraksha',
    price_min: 210000,
    price_max: 210000,
    currency: 'INR',
    image_url: 'https://cdn.shopify.com/s/files/1/0903/5451/6277/files/17mukhi.jpg',
    total_inventory: 2,
    tags: ['17 mukhi', 'nepali rudraksha'],
    search_text: 'natural 17 mukhi rudraksha (nepali) 17-mukhi-nepali-rudraksha',
    status: 'active',
    body_text: 'Rare 17 Mukhi Nepali Rudraksha bead.',
  },
];

const mockTenant = {
  shopify_store_url: 'devprayagjal.com',
  shopify_shop_meta: { currency: 'INR' },
};

vi.mock('@/lib/supabase/admin', () => {
  const builder = (table: string) => {
    let filterHandle: string | null = null;
    let filterQuery: string | null = null;

    const b: Record<string, any> = {
      select: () => b,
      eq: (col: string, val: any) => {
        if (col === 'handle') filterHandle = val;
        return b;
      },
      neq: () => b,
      in: () => b,
      not: () => b,
      ilike: (_col: string, val: string) => {
        filterQuery = val.replace(/%/g, '');
        return b;
      },
      contains: () => b,
      gt: () => b,
      limit: () => b,
      single: async () => {
        if (table === 'tenants') return { data: mockTenant, error: null };
        if (table === 'shopify_products' && filterHandle) {
          const found = mockProducts.find(p => p.handle === filterHandle);
          return { data: found || null, error: found ? null : { message: 'Not found' } };
        }
        return { data: null, error: null };
      },
      maybeSingle: async () => {
        if (table === 'tenants') return { data: mockTenant, error: null };
        if (table === 'shopify_products' && filterHandle) {
          const found = mockProducts.find(p => p.handle === filterHandle);
          return { data: found || null, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: (val: any) => void) => {
        if (table === 'shopify_products') {
          if (filterHandle) {
            const found = mockProducts.filter(p => p.handle === filterHandle);
            return resolve({ data: found, error: null });
          }
          if (filterQuery) {
            const lower = filterQuery.toLowerCase();
            const found = mockProducts.filter(p => p.search_text.includes(lower) || p.title.toLowerCase().includes(lower));
            return resolve({ data: found.length ? found : mockProducts, error: null });
          }
          return resolve({ data: mockProducts, error: null });
        }
        if (table === 'shopify_variants') {
          return resolve({ data: [], error: null });
        }
        return resolve({ data: [], error: null });
      },
    };
    return b;
  };

  return { supabaseAdmin: { from: builder } };
});

import { getShopifyContext, reconcileProductLinks, type ShopifyAIContext } from '@/lib/shopify/aiContext';
import { getCampaignContextForAI } from '@/lib/meta-ads/attribution';

describe('Devprayagjal WhatsApp Ads & Product Queries', () => {
  const devprayagjalTenantId = '259c97b4-7920-4228-bcfe-217ff3a073a4';

  it('builds campaign context for AI including product URL and headline from Meta Ad', () => {
    const referral = {
      source_type: 'ad',
      source_id: '120226305854810726',
      headline: '7 Mukhi Nepali Rudraksha | Free Ganga Siddh at Haridwar',
      body: 'The 7 Mukhi Rudraksha Mala is associated with Goddess Lakshmi...',
      source_url: 'https://devprayagjal.com/products/7-mukhi-rudraksha',
    };

    const ctx = getCampaignContextForAI(referral);
    expect(ctx).toContain('7 Mukhi Nepali Rudraksha');
    expect(ctx).toContain('https://devprayagjal.com/products/7-mukhi-rudraksha');
    expect(ctx).toContain('Goddess Lakshmi');
    expect(ctx).toContain('Do NOT give a generic bare greeting');
  });

  it('extracts product from Meta Ad referral and exact link into Shopify context', async () => {
    const ctx = await getShopifyContext({
      tenantId: devprayagjalTenantId,
      message: '7 Mukhi Nepali',
      lead: null,
      referral: {
        source_type: 'ad',
        headline: '7 Mukhi Nepali Rudraksha | Free Ganga Siddh at Haridwar',
        source_url: 'https://devprayagjal.com/products/7-mukhi-rudraksha',
      },
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.matched_products).toBeDefined();
    expect(ctx?.matched_products?.length).toBeGreaterThan(0);
    const top = ctx?.matched_products?.[0];
    expect(top?.handle).toBe('7-mukhi-rudraksha');
    expect(top?.title).toContain('7 Mukhi');
    expect(top?.url).toBe('https://devprayagjal.com/products/7-mukhi-rudraksha');
  });

  it('extracts product from collection URL in message (e.g. 1-14 Mukhi Siddh Mala)', async () => {
    const ctx = await getShopifyContext({
      tenantId: devprayagjalTenantId,
      message: 'https://devprayagjal.com/collections/nepali-rudraksha-1/products/1-14-mukhi-gaurishankar-rudraksha-nepali-kanthi-mala-original-certified\n1-14 Mukhi',
      lead: null,
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.matched_products).toBeDefined();
    const top = ctx?.matched_products?.[0];
    expect(top?.handle).toBe('1-14-mukhi-gaurishankar-rudraksha-nepali-kanthi-mala-original-certified');
    expect(top?.title).toContain('1–14 Mukhi');
    expect(top?.url).toBe('https://devprayagjal.com/products/1-14-mukhi-gaurishankar-rudraksha-nepali-kanthi-mala-original-certified');
  });

  it('accurately searches product for short queries like "7 Mukhi Nepali" without dropping numbers', async () => {
    const ctx = await getShopifyContext({
      tenantId: devprayagjalTenantId,
      message: '7 Mukhi Nepali',
      lead: null,
    });

    expect(ctx).not.toBeNull();
    const top = ctx?.matched_products?.[0];
    expect(top?.handle).toBe('7-mukhi-rudraksha');
    expect(top?.title).toContain('7 Mukhi Nepali Rudraksha');
  });

  it('accurately searches product for "1-14 Mukhi"', async () => {
    const ctx = await getShopifyContext({
      tenantId: devprayagjalTenantId,
      message: '1-14 Mukhi',
      lead: null,
    });

    expect(ctx).not.toBeNull();
    const top = ctx?.matched_products?.[0];
    expect(top?.handle).toBe('1-14-mukhi-gaurishankar-rudraksha-nepali-kanthi-mala-original-certified');
  });

  it('reconciles collection-nested URLs back to canonical product URL', () => {
    const mockCtx: ShopifyAIContext = {
      store_url: 'devprayagjal.com',
      currency: 'INR',
      matched_products: [
        {
          handle: '1-14-mukhi-gaurishankar-rudraksha-nepali-kanthi-mala-original-certified',
          title: '1–14 Mukhi Siddh Mala',
          vendor: null,
          price_min: 11999,
          price_max: 11999,
          currency: 'INR',
          in_stock: true,
          url: 'https://devprayagjal.com/products/1-14-mukhi-gaurishankar-rudraksha-nepali-kanthi-mala-original-certified',
          snippet: null,
          image_url: null,
        },
      ],
    };

    const replyWithNestedUrl = 'You can purchase the Siddh Mala here: https://devprayagjal.com/collections/nepali-rudraksha-1/products/1-14-mukhi-gaurishankar-rudraksha-nepali-kanthi-mala-original-certified';
    const reconciled = reconcileProductLinks(replyWithNestedUrl, mockCtx);
    expect(reconciled).toBe('You can purchase the Siddh Mala here: https://devprayagjal.com/products/1-14-mukhi-gaurishankar-rudraksha-nepali-kanthi-mala-original-certified');
  });
});
