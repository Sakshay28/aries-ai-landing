/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '@/lib/supabase/admin';
import { isDailyReportRequest, generateDailyReport, formatDailyReportMessage, computeDeliveryMetrics, getTodayRangeIST, requestedReportDayOffset, type DailyReportData } from '@/lib/reports/dailyReport';
import type { ShiprocketOrderSnapshot } from '@/lib/shiprocket/orderSnapshot';

/** A minimal chainable + thenable mock matching supabase-js's query builder shape. */
function thenable(result: { data: unknown; error: unknown }) {
  const builder: any = {};
  const chainMethods = ['select', 'eq', 'in', 'gte', 'lt', 'lte', 'is', 'order', 'limit', 'range'];
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

function snap(over: Partial<ShiprocketOrderSnapshot>): ShiprocketOrderSnapshot {
  return {
    shiprocketOrderId: 1, shiprocketShipmentId: null, channelOrderId: 'DPJ-1', status: 'in_transit', statusRaw: 'IN TRANSIT',
    awb: null, courierName: null, courierId: null, paymentMethod: 'COD', customerName: null, customerPhone: null,
    createdAt: null, pickedUpAt: null, outForDeliveryAt: null, deliveredAt: null, rtoInitiatedAt: null, rtoDeliveredAt: null,
    updatedAt: null, ndrAttempts: 0, inNdr: false, products: [], ...over,
  };
}

// 1 Oct 2026, 21:00 IST
const NOW = new Date('2026-10-01T15:30:00Z');
const TODAY = new Date('2026-10-01T06:00:00Z');
const YESTERDAY = new Date('2026-09-30T06:00:00Z');

describe('generateDailyReport', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockTables(orders: unknown[]) {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shopify_orders') return thenable({ data: orders, error: null });
      if (table === 'shopify_variants') return thenable({ data: null, error: { message: 'column shopify_variants.cost does not exist' } });
      if (table === 'meta_connections') return thenable({ data: null, error: null });
      throw new Error(`unexpected table access: ${table}`);
    });
  }

  it('computes revenue/orders/AOV/top-seller and payment split from the day\'s orders', async () => {
    mockTables([
      { id: 'o1', order_number: 'DPJ-1', total_price: 1000, financial_status: 'pending', line_items: [{ product_id: 1, title: 'Rudraksha Mala', quantity: 2 }] },
      { id: 'o2', order_number: 'DPJ-2', total_price: 500, financial_status: 'paid', line_items: [{ product_id: 2, title: 'Bracelet', quantity: 1 }] },
      { id: 'o3', order_number: 'DPJ-3', total_price: 1500, financial_status: 'pending', line_items: [{ product_id: 1, title: 'Rudraksha Mala', quantity: 1 }] },
      { id: 'o4', order_number: 'DPJ-4', total_price: 0, financial_status: 'pending', line_items: [] },
    ]);
    // Shiprocket says DPJ-3 is actually prepaid — it wins over Shopify's financial_status.
    const result = await generateDailyReport('tenant-1', { now: NOW, snapshots: [snap({ channelOrderId: 'DPJ-3', paymentMethod: 'Prepaid' })] });

    expect(result.orders).toBe(4);
    expect(result.revenue).toBe(3000);
    expect(result.aov).toBe(750);
    expect(result.topSellerTitle).toBe('Rudraksha Mala'); // 3 units vs 1 unit
    expect(result.prepaidPercent).toBe(50); // DPJ-2 (paid) + DPJ-3 (Shiprocket prepaid)
    expect(result.codPercent).toBe(50);
    // No cost column yet → Profit stays N/A rather than a fake number.
    expect(result.profit).toBeNull();
    expect(result.topProfitTitle).toBeNull();
  });

  it('reports ₹0 / 0 orders (not N/A) on a day with no orders', async () => {
    mockTables([]);
    const result = await generateDailyReport('tenant-1', { now: NOW, snapshots: [] });
    expect(result.orders).toBe(0);
    expect(result.revenue).toBe(0);
    expect(result.aov).toBeNull();
    expect(result.topSellerTitle).toBeNull();
    expect(result.prepaidPercent).toBeNull();
  });

  it('leaves every delivery field N/A when Shiprocket is unreachable', async () => {
    mockTables([{ id: 'o1', order_number: 'DPJ-1', total_price: 1000, financial_status: 'pending', line_items: [] }]);
    const result = await generateDailyReport('tenant-1', { now: NOW, snapshots: null });
    expect(result.delivered).toBeNull();
    expect(result.transit).toBeNull();
    expect(result.ndrTotal).toBeNull();
    expect(result.rtoPercent).toBeNull();
    expect(result.codPercent).toBe(100); // falls back to Shopify's financial_status
  });

  it('leaves ad fields null when Meta Ads is not connected', async () => {
    mockTables([]);
    const result = await generateDailyReport('tenant-1', { now: NOW, snapshots: [] });
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
    const result = await generateDailyReport('tenant-1', { now: NOW, snapshots: [] });
    expect(result.adSpend).toBe(1000);
    expect(result.roas).toBe(4);
    expect(result.cpa).toBe(100);
  });
});

describe('computeDeliveryMetrics', () => {
  const { startUTC, endUTC } = getTodayRangeIST(NOW);

  it('counts the day\'s events, the live transit/NDR snapshot, and a 30-day RTO rate', () => {
    const m = computeDeliveryMetrics([
      snap({ status: 'delivered', deliveredAt: TODAY, createdAt: YESTERDAY }),
      snap({ status: 'delivered', deliveredAt: YESTERDAY, createdAt: YESTERDAY }), // not today
      snap({ status: 'in_transit' }),
      snap({ status: 'out_for_delivery' }),
      snap({ status: 'in_transit', inNdr: true, ndrAttempts: 1 }),
      snap({ status: 'in_transit', inNdr: true, ndrAttempts: 2 }),
      snap({ status: 'out_for_delivery', inNdr: true, ndrAttempts: 4 }),
      snap({ status: 'rto', rtoInitiatedAt: TODAY, createdAt: YESTERDAY, products: [{ title: '7 Mukhi', quantity: 1 }] }),
      snap({ status: 'rto', rtoDeliveredAt: TODAY, createdAt: YESTERDAY, products: [{ title: '7 Mukhi', quantity: 1 }] }),
      snap({ status: 'rto', createdAt: YESTERDAY, products: [{ title: 'Bracelet', quantity: 1 }] }),
      snap({ status: 'rto', createdAt: new Date('2026-08-01T00:00:00Z') }), // outside 30 days
    ], startUTC, endUTC);

    expect(m.delivered).toBe(1);
    expect(m.transit).toBe(2);
    expect(m.ndrTotal).toBe(3);
    expect([m.ndr1, m.ndr2, m.ndr3]).toEqual([1, 1, 1]);
    expect(m.rtoInitiated).toBe(1);
    expect(m.rtoCount).toBe(1);
    expect(m.rtoPercent).toBe(60); // 3 RTO of 5 closed (2 delivered + 3 RTO) in 30 days
    expect(m.highestRtoTitle).toBe('7 Mukhi');
  });

  it('has no RTO rate when nothing has closed out yet', () => {
    const m = computeDeliveryMetrics([snap({ status: 'in_transit' })], startUTC, endUTC);
    expect(m.rtoPercent).toBeNull();
    expect(m.highestRtoTitle).toBeNull();
  });
});

describe('requestedReportDayOffset', () => {
  it('reads yesterday in English and Hinglish', () => {
    expect(requestedReportDayOffset("yesterday's report")).toBe(1);
    expect(requestedReportDayOffset('kal ki report bhejo')).toBe(1);
    expect(requestedReportDayOffset('report')).toBe(0);
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
