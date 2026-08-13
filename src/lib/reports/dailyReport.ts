// ═══════════════════════════════════════════════════════════
// Daily business report — on-demand WhatsApp digest
// ═══════════════════════════════════════════════════════════
// Triggered when a tenant's own staff/manager number (see
// `isOwnStaffNumber` in the webhook route) asks the bot for a report.
// Deliberately bypasses the AI entirely: this returns exact financial
// figures, and the AI reply pipeline (engine.ts) is a text generator,
// not a calculator — asking it to reason over injected numbers risks
// a hallucinated total. Instead this module aggregates directly from
// the DB and fills a fixed template; the webhook route sends the
// result as a plain text message with no model in the loop.
//
// Data coverage today: Revenue/Orders/AOV, top seller (units sold),
// delivery status counts + RTO%, and Prepaid/COD split are computed
// from real synced data. Profit, Ads (until Meta Ads is connected),
// the NDR attempt breakdown, and RTO-by-product have no data source
// anywhere in the schema yet — those fields are always null here and
// render as "N/A" rather than a guessed number. See the plan doc for
// what each gap would take to close.

import { supabaseAdmin } from '@/lib/supabase/admin';

// ─── Trigger detection ─────────────────────────────────────
// Blast radius is capped upstream — only the tenant's own staff/manager
// number can ever reach this check — so the keyword list can stay broad
// without risking a customer accidentally tripping it.
const DAILY_REPORT_KEYWORDS = /\b(report|daily update|today'?s update|latest update|business update)\b/i;

export function isDailyReportRequest(text: string | null | undefined): boolean {
  if (!text) return false;
  return DAILY_REPORT_KEYWORDS.test(text);
}

// ─── Date range ─────────────────────────────────────────────
// Same +5.5h IST offset convention the webhook route already uses for
// business-hours checks (route.ts ~line 1253) — no new timezone
// dependency, and consistent with every tenant currently being IST.
export function getTodayRangeIST(): { startUTC: Date; label: string } {
  const nowUTC = new Date();
  const nowIST = new Date(nowUTC.getTime() + 5.5 * 60 * 60 * 1000);
  const y = nowIST.getUTCFullYear();
  const m = nowIST.getUTCMonth();
  const d = nowIST.getUTCDate();
  // Midnight IST expressed back in UTC (IST is UTC+5:30).
  const startUTC = new Date(Date.UTC(y, m, d) - 5.5 * 60 * 60 * 1000);
  const label = new Date(Date.UTC(y, m, d)).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  return { startUTC, label };
}

// ─── Types ──────────────────────────────────────────────────
export interface DailyReportData {
  dateLabel: string;
  revenue: number | null;
  orders: number;
  aov: number | null;
  profit: number | null;
  adSpend: number | null;
  roas: number | null;
  cpa: number | null;
  delivered: number | null;
  transit: number | null;
  ndrTotal: number | null;
  rtoInitiated: number | null;
  rtoCount: number | null;
  rtoPercent: number | null;
  ndr1: number | null;
  ndr2: number | null;
  ndr3: number | null;
  topSellerTitle: string | null;
  topProfitTitle: string | null;
  highestRtoTitle: string | null;
  prepaidPercent: number | null;
  codPercent: number | null;
}

interface ShopifyOrderLineItem {
  title?: string;
  quantity?: number;
  product_id?: number;
}

// ─── Aggregation ────────────────────────────────────────────
export async function generateDailyReport(tenantId: string): Promise<DailyReportData> {
  const { startUTC, label } = getTodayRangeIST();
  const startIso = startUTC.toISOString();
  const todayDateStr = startIso.slice(0, 10);

  const { data: orders } = await supabaseAdmin
    .from('shopify_orders')
    .select('id, total_price, line_items')
    .eq('tenant_id', tenantId)
    .gte('shopify_created_at', startIso)
    .is('cancelled_at', null);

  const orderRows = orders || [];
  const orderCount = orderRows.length;
  const revenue = orderRows.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
  const aov = orderCount > 0 ? revenue / orderCount : null;

  // Top seller by units sold across today's orders.
  const unitsByProduct = new Map<string, { title: string; units: number }>();
  for (const order of orderRows) {
    const items = (order.line_items || []) as ShopifyOrderLineItem[];
    for (const item of items) {
      const key = String(item.product_id ?? item.title ?? 'unknown');
      const title = item.title || 'Unknown item';
      const qty = Number(item.quantity) || 0;
      const existing = unitsByProduct.get(key);
      unitsByProduct.set(key, { title, units: (existing?.units || 0) + qty });
    }
  }
  let topSellerTitle: string | null = null;
  let topUnits = 0;
  for (const entry of unitsByProduct.values()) {
    if (entry.units > topUnits) {
      topUnits = entry.units;
      topSellerTitle = entry.title;
    }
  }

  // Delivery/RTO/payment split — shipments tied to today's orders.
  const orderIds = orderRows.map((o) => o.id);
  let delivered: number | null = null;
  let transit: number | null = null;
  let rtoCount: number | null = null;
  let rtoPercent: number | null = null;
  let prepaidPercent: number | null = null;
  let codPercent: number | null = null;

  if (orderIds.length > 0) {
    const { data: shipments } = await supabaseAdmin
      .from('shiprocket_shipments')
      .select('status, payment_method')
      .eq('tenant_id', tenantId)
      .in('shopify_order_id', orderIds);

    const shipmentRows = shipments || [];
    const totalShipments = shipmentRows.length;
    if (totalShipments > 0) {
      delivered = shipmentRows.filter((s) => s.status === 'delivered').length;
      transit = shipmentRows.filter((s) => s.status === 'in_transit' || s.status === 'out_for_delivery').length;
      rtoCount = shipmentRows.filter((s) => s.status === 'rto').length;
      rtoPercent = Math.round((rtoCount / totalShipments) * 1000) / 10;

      const withPaymentMethod = shipmentRows.filter((s) => s.payment_method === 'Prepaid' || s.payment_method === 'COD');
      if (withPaymentMethod.length > 0) {
        const prepaidCount = withPaymentMethod.filter((s) => s.payment_method === 'Prepaid').length;
        prepaidPercent = Math.round((prepaidCount / withPaymentMethod.length) * 1000) / 10;
        codPercent = Math.round(((withPaymentMethod.length - prepaidCount) / withPaymentMethod.length) * 1000) / 10;
      }
    }
  }

  // Ads — only populated once a tenant has connected Meta Ads.
  let adSpend: number | null = null;
  let roas: number | null = null;
  let cpa: number | null = null;
  const { data: metaConnection } = await supabaseAdmin
    .from('meta_connections')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('status', 'connected')
    .maybeSingle();

  if (metaConnection) {
    const { data: analyticsRows } = await supabaseAdmin
      .from('campaign_analytics')
      .select('spend, revenue, leads')
      .eq('tenant_id', tenantId)
      .eq('date', todayDateStr);
    const rows = analyticsRows || [];
    if (rows.length > 0) {
      const totalSpend = rows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
      const totalRevenue = rows.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
      const totalLeads = rows.reduce((s, r) => s + (Number(r.leads) || 0), 0);
      adSpend = Math.round(totalSpend * 100) / 100;
      roas = totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : null;
      cpa = totalLeads > 0 ? Math.round((totalSpend / totalLeads) * 100) / 100 : null;
    }
  }

  return {
    dateLabel: label,
    revenue: orderCount > 0 ? revenue : null,
    orders: orderCount,
    aov,
    profit: null,
    adSpend,
    roas,
    cpa,
    delivered,
    transit,
    ndrTotal: null,
    rtoInitiated: null,
    rtoCount,
    rtoPercent,
    ndr1: null,
    ndr2: null,
    ndr3: null,
    topSellerTitle,
    topProfitTitle: null,
    highestRtoTitle: null,
    prepaidPercent,
    codPercent,
  };
}

// ─── Formatting ─────────────────────────────────────────────
function fmtCurrency(n: number | null): string {
  if (n == null) return 'N/A';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtNumber(n: number | null): string {
  if (n == null) return 'N/A';
  return n.toLocaleString('en-IN');
}

function fmtPercent(n: number | null): string {
  if (n == null) return 'N/A';
  return `${n}%`;
}

function fmtRatio(n: number | null): string {
  if (n == null) return 'N/A';
  return `${n}x`;
}

function fmtText(s: string | null): string {
  return s || 'N/A';
}

/** ₹-prefixed currency, or a bare "N/A" (no stray ₹) when the value is unavailable. */
function fmtMoney(n: number | null): string {
  return n == null ? 'N/A' : `₹${fmtCurrency(n)}`;
}

export function formatDailyReportMessage(data: DailyReportData, businessName: string): string {
  const lines = [
    `📊 ${businessName.toUpperCase()} | DAILY REPORT`,
    `📅 ${data.dateLabel}`,
    '',
    '💰 SALES',
    `Revenue: ${fmtMoney(data.revenue)} | Orders: ${fmtNumber(data.orders)}`,
    `AOV: ${fmtMoney(data.aov)} | Profit: ${fmtMoney(data.profit)}`,
    '',
    '📢 ADS',
    `Spend: ${fmtMoney(data.adSpend)} | ROAS: ${fmtRatio(data.roas)} | CPA: ${fmtMoney(data.cpa)}`,
    '',
    '📦 DELIVERY',
    `Delivered: ${fmtNumber(data.delivered)} | Transit: ${fmtNumber(data.transit)}`,
    `NDR: ${fmtNumber(data.ndrTotal)} | RTO Initiated: ${fmtNumber(data.rtoInitiated)}`,
    `RTO: ${fmtNumber(data.rtoCount)} (${fmtPercent(data.rtoPercent)})`,
    '',
    '⚠️ NDR BREAKDOWN',
    `1st Attempt: ${fmtNumber(data.ndr1)}`,
    `2nd Attempt: ${fmtNumber(data.ndr2)}`,
    `3rd Attempt: ${fmtNumber(data.ndr3)}`,
    '',
    '🛍️ PRODUCTS',
    `🔥 Top Seller: ${fmtText(data.topSellerTitle)}`,
    `💰 Top Profit: ${fmtText(data.topProfitTitle)}`,
    `⚠️ Highest RTO: ${fmtText(data.highestRtoTitle)}`,
    '',
    '💳 PAYMENT',
    `Prepaid: ${fmtPercent(data.prepaidPercent)} | COD: ${fmtPercent(data.codPercent)}`,
  ];
  return lines.join('\n');
}
