/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '@/lib/supabase/admin';
import { isDailyReportRequest, generateDailyReport, formatDailyReportMessage, type DailyReportData } from '@/lib/reports/dailyReport';

/** A minimal chainable + thenable mock matching supabase-js's query builder shape. */
function thenable(result: { data: unknown; error: unknown }) {
  const builder: any = {};
  const chainMethods = ['select', 'eq', 'in', 'gte', 'lte', 'is', 'order', 'limit', 'range'];
  for (const m of chainMethods) builder[m] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe('isDailyReportRequest', () => {
  it('matches common report/update phrasings', () => {
    expect(isDailyReportRequest('report')).toBe(true);
    expect(isDailyReportRequest('send me the daily report')).toBe(true);
    expect(isDailyReportRequest("today's update please")).toBe(true);
    expect(isDailyReportRequest('give me the latest update')).toBe(true);
    expect(isDailyReportRequest('business update?')).toBe(true);
  });

  it('does not match unrelated customer-shaped messages', () => {
    expect(isDailyReportRequest('where is my order')).toBe(false);
    expect(isDailyReportRequest('do you have this in red')).toBe(false);
    expect(isDailyReportRequest(null)).toBe(false);
    expect(isDailyReportRequest('')).toBe(false);
  });
});

describe('generateDailyReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes revenue/orders/AOV/top-seller and delivery/payment splits for a normal day', async () => {
    const orders = [
      { id: 'o1', total_price: 1000, line_items: [{ product_id: 1, title: 'Rudraksha Mala', quantity: 2 }] },
      { id: 'o2', total_price: 500, line_items: [{ product_id: 2, title: 'Bracelet', quantity: 1 }] },
      { id: 'o3', total_price: 1500, line_items: [{ product_id: 1, title: 'Rudraksha Mala', quantity: 1 }] },
    ];
    const shipments = [
      { status: 'delivered', payment_method: 'COD' },
      { status: 'in_transit', payment_method: 'Prepaid' },
      { status: 'rto', payment_method: 'COD' },
      { status: 'out_for_delivery', payment_method: 'COD' },
    ];

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shopify_orders') return thenable({ data: orders, error: null });
      if (table === 'shiprocket_shipments') return thenable({ data: shipments, error: null });
      if (table === 'meta_connections') return thenable({ data: null, error: null });
      if (table === 'campaign_analytics') return thenable({ data: [], error: null });
      throw new Error(`unexpected table access: ${table}`);
    });

    const result = await generateDailyReport('tenant-1');

    expect(result.orders).toBe(3);
    expect(result.revenue).toBe(3000);
    expect(result.aov).toBe(1000);
    expect(result.topSellerTitle).toBe('Rudraksha Mala'); // 3 units vs 1 unit
    expect(result.delivered).toBe(1);
    expect(result.transit).toBe(2); // in_transit + out_for_delivery
    expect(result.rtoCount).toBe(1);
    expect(result.rtoPercent).toBe(25); // 1 of 4 shipments
    expect(result.prepaidPercent).toBe(25); // 1 of 4
    expect(result.codPercent).toBe(75);
    // Always-unavailable fields stay null regardless of how much order/shipment data exists.
    expect(result.profit).toBeNull();
    expect(result.ndr1).toBeNull();
    expect(result.rtoInitiated).toBeNull();
    expect(result.topProfitTitle).toBeNull();
    expect(result.highestRtoTitle).toBeNull();
  });

  it('returns nulls (not zeros or NaN) for a day with zero orders', async () => {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shopify_orders') return thenable({ data: [], error: null });
      if (table === 'meta_connections') return thenable({ data: null, error: null });
      throw new Error(`unexpected table access: ${table}`);
    });

    const result = await generateDailyReport('tenant-1');

    expect(result.orders).toBe(0);
    expect(result.revenue).toBeNull();
    expect(result.aov).toBeNull();
    expect(result.topSellerTitle).toBeNull();
    expect(result.delivered).toBeNull();
    expect(result.rtoPercent).toBeNull();
    expect(result.prepaidPercent).toBeNull();
  });

  it('leaves delivery/payment fields null when orders exist but no Shiprocket shipments are synced yet (Devprayagjal today)', async () => {
    const orders = [{ id: 'o1', total_price: 1000, line_items: [] }];
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shopify_orders') return thenable({ data: orders, error: null });
      if (table === 'shiprocket_shipments') return thenable({ data: [], error: null });
      if (table === 'meta_connections') return thenable({ data: null, error: null });
      throw new Error(`unexpected table access: ${table}`);
    });

    const result = await generateDailyReport('tenant-1');

    expect(result.orders).toBe(1);
    expect(result.revenue).toBe(1000);
    expect(result.delivered).toBeNull();
    expect(result.rtoCount).toBeNull();
    expect(result.rtoPercent).toBeNull();
    expect(result.prepaidPercent).toBeNull();
    expect(result.codPercent).toBeNull();
  });

  it('leaves ad fields null when Meta Ads is not connected', async () => {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shopify_orders') return thenable({ data: [], error: null });
      if (table === 'meta_connections') return thenable({ data: null, error: null });
      throw new Error(`unexpected table access: ${table}`);
    });

    const result = await generateDailyReport('tenant-1');

    expect(result.adSpend).toBeNull();
    expect(result.roas).toBeNull();
    expect(result.cpa).toBeNull();
  });

  it('populates ad fields when Meta Ads is connected and has rows for today', async () => {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shopify_orders') return thenable({ data: [], error: null });
      if (table === 'meta_connections') return thenable({ data: { id: 'conn-1', status: 'connected' }, error: null });
      if (table === 'campaign_analytics') return thenable({ data: [{ spend: 1000, revenue: 4000, leads: 10 }], error: null });
      throw new Error(`unexpected table access: ${table}`);
    });

    const result = await generateDailyReport('tenant-1');

    expect(result.adSpend).toBe(1000);
    expect(result.roas).toBe(4);
    expect(result.cpa).toBe(100);
  });
});

describe('formatDailyReportMessage', () => {
  const base: DailyReportData = {
    dateLabel: '12 Aug 2026',
    revenue: 25000, orders: 12, aov: 2083, profit: null,
    adSpend: null, roas: null, cpa: null,
    delivered: 5, transit: 3, ndrTotal: null, rtoInitiated: null,
    rtoCount: 1, rtoPercent: 11.1,
    ndr1: null, ndr2: null, ndr3: null,
    topSellerTitle: 'Rudraksha Mala', topProfitTitle: null, highestRtoTitle: null,
    prepaidPercent: 20, codPercent: 80,
  };

  it('renders every template section with real values where available', () => {
    const text = formatDailyReportMessage(base, 'Devprayagjal');
    expect(text).toContain('📊 *DEVPRAYAGJAL | DAILY REPORT*');
    expect(text).toContain('📅 12 Aug 2026');
    expect(text).toContain('Revenue: ₹25,000 | Orders: 12');
    expect(text).toContain('Delivered: 5 | Transit: 3');
    expect(text).toContain('RTO: 1 (11.1%)');
    expect(text).toContain('🔥 Top Seller: Rudraksha Mala');
    expect(text).toContain('Prepaid: 20% | COD: 80%');
  });

  it('bolds every section header with WhatsApp asterisk syntax, per the client template', () => {
    const text = formatDailyReportMessage(base, 'Devprayagjal');
    for (const header of ['*SALES*', '*ADS*', '*DELIVERY*', '*NDR BREAKDOWN*', '*PRODUCTS*', '*PAYMENT*']) {
      expect(text).toContain(header);
    }
    // Asterisks must be balanced, or WhatsApp renders stray literal stars.
    expect((text.match(/\*/g) || []).length % 2).toBe(0);
  });

  it('substitutes N/A for every unavailable field instead of 0, blank, or a dropped line', () => {
    const empty: DailyReportData = {
      dateLabel: '12 Aug 2026',
      revenue: null, orders: 0, aov: null, profit: null,
      adSpend: null, roas: null, cpa: null,
      delivered: null, transit: null, ndrTotal: null, rtoInitiated: null,
      rtoCount: null, rtoPercent: null,
      ndr1: null, ndr2: null, ndr3: null,
      topSellerTitle: null, topProfitTitle: null, highestRtoTitle: null,
      prepaidPercent: null, codPercent: null,
    };
    const text = formatDailyReportMessage(empty, 'Devprayagjal');
    expect(text).toContain('Revenue: N/A | Orders: 0');
    expect(text).toContain('Profit: N/A');
    expect(text).toContain('Spend: N/A | ROAS: N/A | CPA: N/A');
    expect(text).toContain('Delivered: N/A | Transit: N/A');
    expect(text).toContain('RTO: N/A (N/A)');
    expect(text).toContain('1st Attempt: N/A');
    expect(text).toContain('🔥 Top Seller: N/A');
    expect(text).toContain('Prepaid: N/A | COD: N/A');
  });
});
