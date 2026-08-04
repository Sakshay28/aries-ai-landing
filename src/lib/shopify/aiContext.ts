// ═══════════════════════════════════════════════════════════
// Shopify AI context builder
// ═══════════════════════════════════════════════════════════
// Runs BEFORE Gemini in the WhatsApp AI pipeline. Detects if the
// customer's message is about products / orders / policies /
// discounts, calls the right functions in ./ai.ts, and returns a
// compact context blob the engine can inject into the system prompt.
//
// Design decisions:
// - Intent detection is lightweight (regex / keyword). We never round-
//   trip Gemini for classification — that would double the cost of
//   every message. Cheap heuristics catch the common cases; the AI's
//   grounded fallback handles the rest.
// - We short-circuit when the tenant has no Shopify connection so the
//   normal RAG/KB path stays untouched.
// - Every returned field is optional. If nothing matched, we return
//   null and the engine adds no Shopify block to the prompt.
// - Product images and titles are surfaced so the AI can name them
//   accurately and the webhook route can send a follow-up image.

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  searchProducts,
  getOrderStatus,
  listStorePolicies,
  searchFAQ,
  listActiveDiscounts,
  getProduct,
} from './ai';

export interface ShopifyAIContext {
  store_url: string;
  currency: string | null;
  matched_products?: Array<{
    handle: string;
    title: string;
    vendor: string | null;
    price_min: number | null;
    price_max: number | null;
    currency: string | null;
    in_stock: boolean;
    url: string | null;
    snippet: string | null;
    image_url: string | null;
  }>;
  order?: {
    order_number: string | null;
    financial_status: string | null;
    fulfillment_status: string | null;
    total_price: number | null;
    currency: string | null;
    tracking: Array<{ number?: string; url?: string; company?: string; status?: string }>;
    line_items: Array<{ title?: string; quantity?: number }>;
    created_at: string | null;
    cancelled_at: string | null;
  };
  policies?: Array<{ type: string; title: string; snippet: string; url: string | null }>;
  faqs?: Array<{ source: string; title: string; snippet: string; url: string | null }>;
  discounts?: Array<{ code: string; type: string | null; value: number | null; ends_at: string | null }>;
}

interface BuildInput {
  tenantId: string;
  message: string;
  lead: { phone?: string | null; email?: string | null; shopify_customer_id?: string | null } | null;
}

// ─── Intent heuristics ─────────────────────────────────────
// Kept broad enough to catch Hinglish / short queries. Precision isn't
// critical — over-fetching is OK because the AI ignores irrelevant
// context, but under-fetching means the answer is generic.
const ORDER_KEYWORDS = /(order|tracking|track|shipped|shipping|dispatch|delivery|delivered|refund|return|cancel|invoice|receipt|awb|status|kaha|kab.*mile|order.*kaha)/i;
const ORDER_NUMBER_RE = /#?\b(\d{3,10})\b/;
const PRODUCT_KEYWORDS = /(product|item|price|cost|stock|available|buy|purchase|show|find|looking for|search|do you (have|sell)|kitne ka|kimat|milega|milegi)/i;
const POLICY_KEYWORDS = /(refund|return|exchange|shipping policy|delivery policy|privacy|terms|cancel|warranty|policy)/i;
const DISCOUNT_KEYWORDS = /(discount|coupon|promo|code|offer|deal|sale|off)/i;
const FAQ_KEYWORDS = /(how (do|does|to)|what (is|are)|when|where|why|faq|help|question)/i;

function hasShopifyIntent(msg: string): boolean {
  return (
    ORDER_KEYWORDS.test(msg) ||
    PRODUCT_KEYWORDS.test(msg) ||
    POLICY_KEYWORDS.test(msg) ||
    DISCOUNT_KEYWORDS.test(msg) ||
    FAQ_KEYWORDS.test(msg)
  );
}

async function getTenantShopifyMeta(tenantId: string): Promise<{ store_url: string; currency: string | null } | null> {
  const { data } = await supabaseAdmin.from('tenants')
    .select('shopify_store_url, shopify_shop_meta')
    .eq('id', tenantId).single();
  if (!data?.shopify_store_url) return null;
  const meta = (data.shopify_shop_meta as { currency?: string } | null) || null;
  return { store_url: data.shopify_store_url as string, currency: meta?.currency || null };
}

/**
 * Extract a query for product search. Strips common filler words so
 * "do you have silver rings under 2000" becomes "silver rings under 2000".
 */
function extractProductQuery(msg: string): string {
  return msg
    .replace(/^(hi|hello|hey|do you have|do u have|kya|kya aap|show me|show|find|looking for|i want|i need|i'?m looking|any|are there|is there|got any)\s+/i, '')
    .replace(/[?.!]+$/g, '')
    .trim()
    .slice(0, 120);
}

export async function getShopifyContext(input: BuildInput): Promise<ShopifyAIContext | null> {
  const { tenantId, message, lead } = input;

  // Fast-path skips: no connection or no Shopify-shaped intent.
  const meta = await getTenantShopifyMeta(tenantId);
  if (!meta) return null;
  if (!hasShopifyIntent(message)) return null;

  const ctx: ShopifyAIContext = { store_url: meta.store_url, currency: meta.currency };

  // ── Order intent ──────────────────────────────────────────
  if (ORDER_KEYWORDS.test(message)) {
    const numMatch = message.match(ORDER_NUMBER_RE);
    const order_number = numMatch ? numMatch[1] : undefined;
    // If they gave a number, look that up. Else try to find their most recent
    // order via lead phone/email.
    const order = await getOrderStatus(tenantId, {
      order_number,
      phone: lead?.phone || undefined,
      email: lead?.email || undefined,
    }).catch(() => null);
    if (order) {
      ctx.order = {
        order_number: order.order_number,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        total_price: order.total_price,
        currency: order.currency,
        tracking: order.tracking,
        line_items: order.line_items,
        created_at: order.created_at,
        cancelled_at: order.cancelled_at,
      };
    }
  }

  // ── Product intent ────────────────────────────────────────
  if (PRODUCT_KEYWORDS.test(message)) {
    const q = extractProductQuery(message);
    const products = await searchProducts(tenantId, { query: q, limit: 5 }).catch(() => []);
    if (products.length > 0) {
      ctx.matched_products = products.map(p => ({
        handle: p.handle,
        title: p.title,
        vendor: p.vendor,
        price_min: p.price_min,
        price_max: p.price_max,
        currency: p.currency,
        in_stock: p.in_stock,
        url: p.url,
        snippet: p.snippet,
        image_url: p.image_url,
      }));
    }
  }

  // ── Policy intent ─────────────────────────────────────────
  if (POLICY_KEYWORDS.test(message)) {
    const policies = await listStorePolicies(tenantId).catch(() => []);
    // Only include ones whose type or title matches the query keyword to keep
    // the prompt short.
    const q = message.toLowerCase();
    const relevant = policies.filter(p =>
      q.includes(p.type) || (p.title && q.includes(p.title.toLowerCase()))
    );
    const use = relevant.length > 0 ? relevant : policies.slice(0, 2);
    if (use.length > 0) {
      ctx.policies = use.map(p => ({
        type: p.type,
        title: p.title || p.type,
        snippet: (p.body || '').slice(0, 400),
        url: p.url,
      }));
    }
  }

  // ── FAQ intent ────────────────────────────────────────────
  if (FAQ_KEYWORDS.test(message) && !ctx.order && !ctx.matched_products) {
    const q = extractProductQuery(message);
    if (q.length >= 3) {
      const faqs = await searchFAQ(tenantId, { query: q, limit: 3 }).catch(() => []);
      if (faqs.length > 0) ctx.faqs = faqs;
    }
  }

  // ── Discount intent ───────────────────────────────────────
  if (DISCOUNT_KEYWORDS.test(message)) {
    const discounts = await listActiveDiscounts(tenantId).catch(() => []);
    if (discounts.length > 0) ctx.discounts = discounts.slice(0, 5);
  }

  // If nothing populated beyond the shell, return null so the prompt stays
  // clean rather than adding an empty Shopify block.
  if (!ctx.order && !ctx.matched_products && !ctx.policies && !ctx.faqs && !ctx.discounts) {
    return null;
  }
  return ctx;
}

/** Render the Shopify context as a system-prompt fragment. */
export function renderShopifyContextForPrompt(ctx: ShopifyAIContext): string {
  const lines: string[] = ['SHOPIFY STORE CONTEXT (the customer is asking about this store — use these facts, do NOT invent products, prices, or order status):'];
  lines.push(`- Store URL: https://${ctx.store_url}`);
  if (ctx.currency) lines.push(`- Currency: ${ctx.currency}`);

  if (ctx.order) {
    const o = ctx.order;
    lines.push('');
    lines.push('CUSTOMER\'S ORDER:');
    if (o.order_number) lines.push(`- Order: ${o.order_number}`);
    if (o.financial_status) lines.push(`- Payment: ${o.financial_status}`);
    if (o.fulfillment_status) lines.push(`- Fulfillment: ${o.fulfillment_status}`);
    else lines.push('- Fulfillment: not yet shipped');
    if (o.total_price != null) lines.push(`- Total: ${o.currency || ''} ${o.total_price}`);
    if (o.line_items.length) {
      const items = o.line_items.map(li => `${li.quantity || 1}× ${li.title || 'item'}`).join(', ');
      lines.push(`- Items: ${items}`);
    }
    if (o.tracking.length) {
      const tr = o.tracking[0];
      if (tr.number) lines.push(`- Tracking #: ${tr.number}${tr.company ? ` (${tr.company})` : ''}`);
      if (tr.url) lines.push(`- Tracking URL: ${tr.url}`);
      if (tr.status) lines.push(`- Shipment status: ${tr.status}`);
    }
    if (o.cancelled_at) lines.push(`- CANCELLED on ${o.cancelled_at}`);
    if (o.created_at) lines.push(`- Ordered on: ${o.created_at}`);
    lines.push('Use these to answer order/tracking/status questions truthfully. If you don\'t have a field, say so — do NOT guess.');
  }

  if (ctx.matched_products && ctx.matched_products.length > 0) {
    lines.push('');
    lines.push('PRODUCTS MATCHING THE CUSTOMER\'S QUERY:');
    ctx.matched_products.forEach((p, i) => {
      const price = p.price_min != null
        ? (p.price_max && p.price_max !== p.price_min ? `${p.currency || ''} ${p.price_min}–${p.price_max}` : `${p.currency || ''} ${p.price_min}`)
        : 'price on request';
      lines.push(`${i + 1}. "${p.title}" — ${price}${p.in_stock ? '' : ' (OUT OF STOCK)'}${p.vendor ? ` · by ${p.vendor}` : ''}`);
      if (p.snippet) lines.push(`   ${p.snippet}`);
      if (p.url) lines.push(`   ${p.url}`);
    });
    lines.push('When you recommend a product, ALWAYS include its exact link (the URL shown on its line above) in your reply text so the customer can open it directly — copy the URL verbatim, never shorten, guess, or invent one. If the customer asks for a specific product or its link/price, give that product\'s URL. Also list the matching product `handle`(s) in extractedData.sendShopifyProducts (max 2) so we send the product image too.');
  }

  if (ctx.policies && ctx.policies.length > 0) {
    lines.push('');
    lines.push('STORE POLICIES:');
    ctx.policies.forEach(p => {
      lines.push(`- ${p.title}${p.url ? ` (${p.url})` : ''}:`);
      lines.push(`  ${p.snippet}`);
    });
    lines.push('Quote or summarize the relevant policy directly; do NOT invent policy terms.');
  }

  if (ctx.faqs && ctx.faqs.length > 0) {
    lines.push('');
    lines.push('POSSIBLY RELEVANT PAGES / ARTICLES:');
    ctx.faqs.forEach(f => {
      lines.push(`- ${f.title}${f.url ? ` (${f.url})` : ''}`);
      lines.push(`  ${f.snippet}`);
    });
  }

  if (ctx.discounts && ctx.discounts.length > 0) {
    lines.push('');
    lines.push('ACTIVE DISCOUNT CODES (only mention if the customer asks or if the store\'s guidelines allow proactive mentions):');
    ctx.discounts.forEach(d => {
      const valueDesc = d.type === 'percentage' && d.value != null ? `${d.value}% off`
        : d.type === 'fixed_amount' && d.value != null ? `${ctx.currency || ''}${d.value} off`
        : 'discount';
      const expires = d.ends_at ? ` (expires ${d.ends_at})` : '';
      lines.push(`- ${d.code}: ${valueDesc}${expires}`);
    });
  }

  return lines.join('\n');
}

/** Public helper used by getProduct callers who need a live-inventory refresh. */
export { getProduct as getShopifyProductDetail };
