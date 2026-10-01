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
// Data sources:
//   SALES / PRODUCTS / PAYMENT — today's shopify_orders (IST day).
//   DELIVERY / NDR / RTO — pulled LIVE from the Shiprocket API at report time
//     (orderSync.ts's fetchShiprocketSnapshots), not from shiprocket_shipments:
//     the report must be right even if the background sync is behind.
//   Profit / Top Profit — cost per item read live from Shopify (liveSources.ts),
//     falling back to shopify_variants.cost. Profit = revenue − product cost
//     (gross; shipping, COD fees, ads and RTO losses are not deducted). When
//     only some items have a cost set, Profit covers those and says how many
//     were left out.
//   Ads — spend read live from the Meta Marketing API (liveSources.ts), or
//     campaign_analytics for an OAuth-connected tenant. ROAS and CPA are
//     blended against Shopify: revenue ÷ spend and spend ÷ orders — Meta's own
//     pixel ROAS counts COD orders that never pay.
// Anything without a source renders "N/A", never a guessed number.
//
// Definitions (the client's template has no glossary, so these are ours):
//   Delivered / RTO Initiated / RTO — events that happened on the report day;
//     RTO = shipments that physically got back to the seller that day.
//   Transit / NDR / NDR 1st-3rd — a snapshot of right now: shipments moving
//     forward, and those stuck after a failed delivery attempt (by attempt #).
//   RTO % and Highest RTO — rolling 30 days of orders that reached a final
//     outcome (delivered vs returned). One day is too few shipments for a
//     rate to mean anything; the 30-day rate is the number the owner acts on.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { fetchShiprocketSnapshots } from '@/lib/shiprocket/orderSync';
import type { ShiprocketOrderSnapshot } from '@/lib/shiprocket/orderSnapshot';
import { fetchVariantCostsLive, fetchAdSpendLive } from './liveSources';

// ─── Trigger detection ─────────────────────────────────────
// Blast radius is capped upstream — only the tenant's own staff/manager
// number can ever reach this check — so the keyword list can stay broad
// without risking a customer accidentally tripping it.
const DAILY_REPORT_KEYWORDS = /\b(report|daily update|today'?s update|latest update|business update)\b/i;

export function isDailyReportRequest(text: string | null | undefined): boolean {
  if (!text) return false;
  return DAILY_REPORT_KEYWORDS.test(text);
}

/** "yesterday's report" / "kal ki report" → report for the previous IST day. */
export function requestedReportDayOffset(text: string | null | undefined): 0 | 1 {
  return text && /\b(yesterday|kal)\b/i.test(text) ? 1 : 0;
}

// ─── Date range ─────────────────────────────────────────────
// Same +5.5h IST offset convention the webhook route already uses for
// business-hours checks (route.ts ~line 1253) — no new timezone
// dependency, and consistent with every tenant currently being IST.
export function getTodayRangeIST(now: Date = new Date(), dayOffset = 0): { startUTC: Date; endUTC: Date; label: string } {
  const nowIST = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const y = nowIST.getUTCFullYear();
  const m = nowIST.getUTCMonth();
  const d = nowIST.getUTCDate() - dayOffset;
  // Midnight IST expressed back in UTC (IST is UTC+5:30).
  const startUTC = new Date(Date.UTC(y, m, d) - 5.5 * 60 * 60 * 1000);
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);
  const label = new Date(Date.UTC(y, m, d)).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  return { startUTC, endUTC, label };
}

// ─── Types ──────────────────────────────────────────────────
export interface DailyReportData {
  dateLabel: string;
  revenue: number | null;
  orders: number;
  aov: number | null;
  profit: number | null;
  /** Units sold with no cost price set — excluded from `profit`. */
  profitMissingUnits?: number;
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
  price?: number | string;
  variant_id?: number;
  product_id?: number;
}

// ─── Delivery metrics (pure) ─────────────────────────────────
export interface DeliveryMetrics {
  delivered: number;
  transit: number;
  ndrTotal: number;
  ndr1: number;
  ndr2: number;
  ndr3: number;
  rtoInitiated: number;
  rtoCount: number;
  rtoPercent: number | null;
  highestRtoTitle: string | null;
}

const ROLLING_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function within(d: Date | null, start: Date, end: Date): boolean {
  return !!d && d.getTime() >= start.getTime() && d.getTime() < end.getTime();
}

/** See the header comment for what each number means. */
export function computeDeliveryMetrics(snapshots: ShiprocketOrderSnapshot[], start: Date, end: Date): DeliveryMetrics {
  const m: DeliveryMetrics = {
    delivered: 0, transit: 0, ndrTotal: 0, ndr1: 0, ndr2: 0, ndr3: 0,
    rtoInitiated: 0, rtoCount: 0, rtoPercent: null, highestRtoTitle: null,
  };
  const rollingStart = new Date(end.getTime() - ROLLING_WINDOW_MS);
  let finalDelivered = 0;
  let finalRto = 0;
  const rtoUnits = new Map<string, number>();

  for (const s of snapshots) {
    if (within(s.deliveredAt, start, end)) m.delivered++;
    if (within(s.rtoInitiatedAt, start, end)) m.rtoInitiated++;
    if (within(s.rtoDeliveredAt, start, end)) m.rtoCount++;

    if (s.inNdr) {
      m.ndrTotal++;
      if (s.ndrAttempts <= 1) m.ndr1++;
      else if (s.ndrAttempts === 2) m.ndr2++;
      else m.ndr3++;
    } else if (s.status === 'in_transit' || s.status === 'out_for_delivery') {
      m.transit++;
    }

    if (s.createdAt && s.createdAt >= rollingStart && s.createdAt < end) {
      if (s.status === 'delivered') finalDelivered++;
      if (s.status === 'rto') {
        finalRto++;
        for (const p of s.products) rtoUnits.set(p.title, (rtoUnits.get(p.title) || 0) + p.quantity);
      }
    }
  }

  const closed = finalDelivered + finalRto;
  m.rtoPercent = closed > 0 ? Math.round((finalRto / closed) * 1000) / 10 : null;
  let top = 0;
  for (const [title, units] of rtoUnits) {
    if (units > top) { top = units; m.highestRtoTitle = title; }
  }
  return m;
}

// ─── Aggregation ────────────────────────────────────────────
export interface GenerateDailyReportOptions {
  /** 0 = today (default), 1 = yesterday, in IST. */
  dayOffset?: number;
  now?: Date;
  /** Injected Shiprocket data (tests). undefined = fetch live; null = unavailable. */
  snapshots?: ShiprocketOrderSnapshot[] | null;
  /** Injected ad spend (tests). undefined = fetch live; null = unavailable. */
  adSpend?: number | null;
}

export async function generateDailyReport(tenantId: string, opts: GenerateDailyReportOptions = {}): Promise<DailyReportData> {
  const { startUTC, endUTC, label } = getTodayRangeIST(opts.now, opts.dayOffset ?? 0);
  const startIso = startUTC.toISOString();
  const todayDateStr = new Date(startUTC.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: orders } = await supabaseAdmin
    .from('shopify_orders')
    .select('id, order_number, total_price, financial_status, line_items')
    .eq('tenant_id', tenantId)
    .gte('shopify_created_at', startIso)
    .lt('shopify_created_at', endUTC.toISOString())
    .is('cancelled_at', null);

  const orderRows = orders || [];
  const orderCount = orderRows.length;
  const revenue = orderRows.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
  const aov = orderCount > 0 ? revenue / orderCount : null;

  // Product aggregates from the day's line items — Top Seller (units) and
  // Top Profit (when cost data is present).
  interface ProductAgg { title: string; units: number; revenue: number; cost: number; costKnown: boolean; }
  const byProduct = new Map<string, ProductAgg>();
  const variantIdsSeen = new Set<number>();
  for (const order of orderRows) {
    const items = (order.line_items || []) as ShopifyOrderLineItem[];
    for (const item of items) {
      const key = String(item.product_id ?? item.title ?? 'unknown');
      const title = item.title || 'Unknown item';
      const qty = Number(item.quantity) || 0;
      const lineRevenue = qty * (Number(item.price) || 0);
      const existing = byProduct.get(key);
      byProduct.set(key, {
        title,
        units: (existing?.units || 0) + qty,
        revenue: (existing?.revenue || 0) + lineRevenue,
        cost: existing?.cost || 0,
        costKnown: existing?.costKnown ?? false,
      });
      if (typeof item.variant_id === 'number') variantIdsSeen.add(item.variant_id);
    }
  }

  // Enrich with variant cost. Best-effort: 42703 "column cost does not exist"
  // (pre-migration environments) or any other query error → costs stay
  // unknown, Profit + Top Profit render as N/A. Never crashes the report.
  let costByVariant = new Map<number, number>();
  let costDataAvailable = false;
  const productIdsSeen = new Set<number>();
  for (const order of orderRows) {
    for (const item of (order.line_items || []) as ShopifyOrderLineItem[]) {
      if (typeof item.product_id === 'number') productIdsSeen.add(item.product_id);
    }
  }
  const liveCosts = productIdsSeen.size > 0 ? await fetchVariantCostsLive(tenantId, Array.from(productIdsSeen)) : null;
  if (liveCosts) {
    costByVariant = liveCosts;
    costDataAvailable = true;
  } else if (variantIdsSeen.size > 0) {
    const { data: variants, error: varErr } = await supabaseAdmin
      .from('shopify_variants')
      .select('shopify_id, cost, shopify_product_id')
      .eq('tenant_id', tenantId)
      .in('shopify_id', Array.from(variantIdsSeen));
    if (!varErr && variants) {
      costDataAvailable = true;
      for (const v of variants) {
        const raw = (v as { cost?: number | string | null }).cost;
        const c = raw == null ? NaN : Number(raw);
        if (Number.isFinite(c)) costByVariant.set(Number((v as { shopify_id: number }).shopify_id), c);
      }
    }
  }
  if (costDataAvailable) {
    for (const order of orderRows) {
      const items = (order.line_items || []) as ShopifyOrderLineItem[];
      for (const item of items) {
        if (typeof item.variant_id !== 'number') continue;
        const c = costByVariant.get(item.variant_id);
        if (c == null) continue;
        const key = String(item.product_id ?? item.title ?? 'unknown');
        const agg = byProduct.get(key);
        if (!agg) continue;
        agg.cost += (Number(item.quantity) || 0) * c;
        agg.costKnown = true;
      }
    }
  }

  let topSellerTitle: string | null = null;
  let topUnits = 0;
  let topProfitTitle: string | null = null;
  let topProfit = -Infinity;
  // Profit is summed per line item over items that HAVE a cost, and the units
  // without one are counted so the report can say what was left out — the
  // merchant fills costs in gradually, and "N/A" until every last SKU has one
  // would hide a number that's already 95% there.
  let knownProfit = 0;
  let knownLines = 0;
  let missingUnits = 0;
  for (const order of orderRows) {
    for (const item of (order.line_items || []) as ShopifyOrderLineItem[]) {
      const qty = Number(item.quantity) || 0;
      const c = typeof item.variant_id === 'number' ? costByVariant.get(item.variant_id) : undefined;
      if (c == null) { missingUnits += qty; continue; }
      knownProfit += qty * ((Number(item.price) || 0) - c);
      knownLines++;
    }
  }
  for (const entry of byProduct.values()) {
    if (entry.units > topUnits) { topUnits = entry.units; topSellerTitle = entry.title; }
    if (entry.costKnown) {
      const p = entry.revenue - entry.cost;
      if (p > topProfit) { topProfit = p; topProfitTitle = entry.title; }
    }
  }
  const profit = costDataAvailable && knownLines > 0 ? Math.round(knownProfit) : null;
  if (topProfit === -Infinity) topProfitTitle = null;

  // Delivery / NDR / RTO — live from Shiprocket.
  let snapshots: ShiprocketOrderSnapshot[] | null;
  if (opts.snapshots !== undefined) {
    snapshots = opts.snapshots;
  } else {
    const live = await fetchShiprocketSnapshots(tenantId, { lookbackDays: 45 }).catch(() => null);
    snapshots = live && live.ok ? live.snapshots : null;
  }
  const delivery = snapshots ? computeDeliveryMetrics(snapshots, startUTC, endUTC) : null;

  // Payment split over the day's orders. Shiprocket's payment_method is the
  // ground truth when it has the order; otherwise Shopify's financial_status
  // ('paid' = prepaid gateway, 'pending' = COD awaiting collection).
  let prepaidPercent: number | null = null;
  let codPercent: number | null = null;
  if (orderCount > 0) {
    const srPayment = new Map((snapshots || []).map((s) => [s.channelOrderId, s.paymentMethod]));
    let prepaid = 0;
    let known = 0;
    for (const o of orderRows) {
      const sr = srPayment.get(o.order_number || '');
      const mode = sr || (o.financial_status === 'paid' ? 'Prepaid' : o.financial_status === 'pending' ? 'COD' : null);
      if (!mode) continue;
      known++;
      if (mode === 'Prepaid') prepaid++;
    }
    if (known > 0) {
      prepaidPercent = Math.round((prepaid / known) * 1000) / 10;
      codPercent = Math.round(((known - prepaid) / known) * 1000) / 10;
    }
  }

  // Ads — live spend first (system-user token with ads_read); then the
  // OAuth-connected campaign_analytics path.
  let adSpend: number | null = null;
  let roas: number | null = null;
  let cpa: number | null = null;
  const liveSpend = opts.adSpend !== undefined ? opts.adSpend : await fetchAdSpendLive(tenantId, todayDateStr).catch(() => null);
  if (liveSpend != null) {
    adSpend = liveSpend;
    roas = liveSpend > 0 ? Math.round((revenue / liveSpend) * 100) / 100 : null;
    cpa = liveSpend > 0 && orderCount > 0 ? Math.round(liveSpend / orderCount) : null;
  }
  const { data: metaConnection } = liveSpend != null ? { data: null } : await supabaseAdmin
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
    revenue,
    orders: orderCount,
    aov,
    profit,
    profitMissingUnits: profit != null ? missingUnits : 0,
    adSpend,
    roas,
    cpa,
    delivered: delivery?.delivered ?? null,
    transit: delivery?.transit ?? null,
    ndrTotal: delivery?.ndrTotal ?? null,
    rtoInitiated: delivery?.rtoInitiated ?? null,
    rtoCount: delivery?.rtoCount ?? null,
    rtoPercent: delivery?.rtoPercent ?? null,
    ndr1: delivery?.ndr1 ?? null,
    ndr2: delivery?.ndr2 ?? null,
    ndr3: delivery?.ndr3 ?? null,
    topSellerTitle,
    topProfitTitle,
    highestRtoTitle: delivery?.highestRtoTitle ?? null,
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

// Section headers are wrapped in *asterisks* — WhatsApp's own bold syntax, and
// exactly what the client's supplied template asks for. Safe here even though
// engine.ts strips asterisks from AI replies: sanitizeReplyText is private to
// the AI pipeline, and this report is sent via sendTextMessage directly from
// the webhook route, so it never passes through that stripper.
export function formatDailyReportMessage(data: DailyReportData, businessName: string): string {
  const lines = [
    `📊 *${businessName.toUpperCase()} | DAILY REPORT*`,
    `📅 ${data.dateLabel}`,
    '',
    '💰 *SALES*',
    `Revenue: ${fmtMoney(data.revenue)} | Orders: ${fmtNumber(data.orders)}`,
    `AOV: ${fmtMoney(data.aov)} | Profit: ${fmtMoney(data.profit)}${data.profit != null && data.profitMissingUnits ? ` (excl. ${data.profitMissingUnits} item${data.profitMissingUnits === 1 ? '' : 's'} with no cost price)` : ''}`,
    '',
    '📢 *ADS*',
    `Spend: ${fmtMoney(data.adSpend)} | ROAS: ${fmtRatio(data.roas)} | CPA: ${fmtMoney(data.cpa)}`,
    '',
    '📦 *DELIVERY*',
    `Delivered: ${fmtNumber(data.delivered)} | Transit: ${fmtNumber(data.transit)}`,
    `NDR: ${fmtNumber(data.ndrTotal)} | RTO Initiated: ${fmtNumber(data.rtoInitiated)}`,
    `RTO: ${fmtNumber(data.rtoCount)} (${fmtPercent(data.rtoPercent)})`,
    '',
    '⚠️ *NDR BREAKDOWN*',
    `1st Attempt: ${fmtNumber(data.ndr1)}`,
    `2nd Attempt: ${fmtNumber(data.ndr2)}`,
    `3rd Attempt: ${fmtNumber(data.ndr3)}`,
    '',
    '🛍️ *PRODUCTS*',
    `🔥 Top Seller: ${fmtText(data.topSellerTitle)}`,
    `💰 Top Profit: ${fmtText(data.topProfitTitle)}`,
    `⚠️ Highest RTO: ${fmtText(data.highestRtoTitle)}`,
    '',
    '💳 *PAYMENT*',
    `Prepaid: ${fmtPercent(data.prepaidPercent)} | COD: ${fmtPercent(data.codPercent)}`,
  ];
  return lines.join('\n');
}
