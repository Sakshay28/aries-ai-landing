// AI-facing query tools over the Shopify mirror.
//
// Every function is tenant-scoped, safe to call from the AI engine (RAG /
// tool calling), and shaped as pure data — the caller decides whether to
// render as WhatsApp text, buttons, product carousel, etc.
//
// Live vs. cached rule:
//   - Product/collection/page/policy metadata → mirror (fast)
//   - Live inventory quantities and up-to-the-minute order/fulfillment
//     status → live Admin API call
//
// If the tenant is disconnected, every function returns an empty result
// rather than throwing — the AI engine falls back to a friendly reply.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { shopifyClientForTenant, ShopifyClient } from './client';
import { normalizePhoneNumber } from '@/lib/whatsapp/phone';
import { getRedisClient } from '@/lib/redis/client';

// Live inventory refresh cache: coalesce identical bursts (multiple chat
// sessions asking about the same variant) into one Shopify API call. Short
// TTL keeps the answer honest without burning the 40-token bucket.
const INVENTORY_CACHE_TTL_SECONDS = 45;

export interface ProductSummary {
  id: string;
  shopify_id: number;
  handle: string;
  title: string;
  vendor: string | null;
  product_type: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  image_url: string | null;
  total_inventory: number | null;
  in_stock: boolean;
  tags: string[];
  url: string | null;
  snippet: string | null;
}

export interface ProductDetail extends ProductSummary {
  body_text: string | null;
  variants: Array<{
    id: number;
    sku: string | null;
    title: string | null;
    price: number | null;
    compare_at_price: number | null;
    inventory_quantity: number | null;   // LIVE-refreshed
    inventory_policy: string | null;
    option1: string | null;
    option2: string | null;
    option3: string | null;
  }>;
  images: unknown[];
}

export interface OrderStatus {
  order_number: string | null;
  shopify_id: number;
  financial_status: string | null;
  fulfillment_status: string | null;
  total_price: number | null;
  currency: string | null;
  line_items: Array<{ title?: string; quantity?: number }>;
  tracking: Array<{ number?: string; url?: string; company?: string; status?: string }>;
  created_at: string | null;
  cancelled_at: string | null;
}

// ─── Utility ────────────────────────────────────────────────
async function getClient(tenantId: string): Promise<ShopifyClient | null> {
  const { data } = await supabaseAdmin.from('tenants')
    .select('shopify_store_url, shopify_access_token, shopify_api_version, shopify_shop_meta')
    .eq('id', tenantId).single();
  if (!data) return null;
  return shopifyClientForTenant(data);
}

function shopUrlFor(storeUrl: string | null, handle: string | null): string | null {
  if (!storeUrl || !handle) return null;
  return `https://${storeUrl}/products/${handle}`;
}

function toSummary(row: Record<string, unknown>, storeUrl: string | null): ProductSummary {
  const total = row.total_inventory as number | null;
  return {
    id: row.id as string,
    shopify_id: row.shopify_id as number,
    handle: row.handle as string,
    title: row.title as string,
    vendor: (row.vendor as string) || null,
    product_type: (row.product_type as string) || null,
    price_min: (row.price_min as number) ?? null,
    price_max: (row.price_max as number) ?? null,
    currency: (row.currency as string) || null,
    image_url: (row.image_url as string) || null,
    total_inventory: total ?? null,
    in_stock: total == null ? true : total > 0,
    tags: (row.tags as string[]) || [],
    url: shopUrlFor(storeUrl, row.handle as string),
    snippet: ((row.body_text as string) || '').slice(0, 200) || null,
  };
}

async function getStoreUrl(tenantId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('tenants').select('shopify_store_url').eq('id', tenantId).single();
  return data?.shopify_store_url || null;
}

// ─── Product search ─────────────────────────────────────────
/**
 * Fuzzy product search across title / vendor / type / tags / body.
 * Uses the trigram GIN index on `search_text` for scale. `limit` capped at 20.
 */
export async function searchProducts(
  tenantId: string,
  args: { query: string; limit?: number; only_in_stock?: boolean; vendor?: string; product_type?: string; tags_include?: string[] }
): Promise<ProductSummary[]> {
  const q = (args.query || '').toLowerCase().trim();
  if (!q) return [];
  const limit = Math.min(Math.max(args.limit || 5, 1), 20);
  const storeUrl = await getStoreUrl(tenantId);

  let builder = supabaseAdmin.from('shopify_products')
    .select('id, shopify_id, handle, title, vendor, product_type, price_min, price_max, currency, image_url, total_inventory, tags, body_text')
    .eq('tenant_id', tenantId)
    .eq('status', 'active');

  // ilike over search_text; the GIN index handles it.
  builder = builder.ilike('search_text', `%${q}%`);
  if (args.vendor) builder = builder.ilike('vendor', args.vendor);
  if (args.product_type) builder = builder.ilike('product_type', args.product_type);
  if (args.tags_include?.length) builder = builder.contains('tags', args.tags_include);
  if (args.only_in_stock) builder = builder.gt('total_inventory', 0);

  const { data, error } = await builder.limit(limit);
  if (error) {
    console.error('[shopify:ai] searchProducts failed', error.message);
    return [];
  }
  return (data || []).map(r => toSummary(r, storeUrl));
}

// ─── Product detail (with live inventory) ───────────────────
export async function getProduct(
  tenantId: string,
  args: { handle?: string; shopify_id?: number; refresh_inventory?: boolean }
): Promise<ProductDetail | null> {
  if (!args.handle && !args.shopify_id) return null;
  const storeUrl = await getStoreUrl(tenantId);

  let productQ = supabaseAdmin.from('shopify_products')
    .select('id, shopify_id, handle, title, vendor, product_type, price_min, price_max, currency, image_url, total_inventory, tags, body_text, images')
    .eq('tenant_id', tenantId);
  if (args.handle) productQ = productQ.eq('handle', args.handle);
  if (args.shopify_id) productQ = productQ.eq('shopify_id', args.shopify_id);
  const { data: prod } = await productQ.limit(1).maybeSingle();
  if (!prod) return null;

  const { data: variants } = await supabaseAdmin.from('shopify_variants')
    .select('shopify_id, sku, title, price, compare_at_price, inventory_quantity, inventory_policy, inventory_item_id, option1, option2, option3')
    .eq('tenant_id', tenantId)
    .eq('product_id', prod.id);

  const variantRows = (variants || []).map(v => ({
    id: v.shopify_id as number,
    sku: v.sku as string | null,
    title: v.title as string | null,
    price: v.price as number | null,
    compare_at_price: v.compare_at_price as number | null,
    inventory_quantity: v.inventory_quantity as number | null,
    inventory_policy: v.inventory_policy as string | null,
    option1: v.option1 as string | null,
    option2: v.option2 as string | null,
    option3: v.option3 as string | null,
  }));

  // Optional live inventory refresh — one API call for all variants, cached
  // in Redis for 45s so hot products don't burn our rate-limit bucket.
  if (args.refresh_inventory && variants?.length) {
    const inventoryItemIds = (variants || []).map(v => v.inventory_item_id).filter((x): x is number => !!x);
    if (inventoryItemIds.length) {
      const liveMap = await fetchLiveInventory(tenantId, inventoryItemIds);
      if (liveMap) {
        for (let i = 0; i < variantRows.length; i++) {
          const invId = variants?.[i]?.inventory_item_id as number | null;
          if (invId != null && liveMap.has(invId)) {
            variantRows[i].inventory_quantity = liveMap.get(invId)!;
          }
        }
      }
    }
  }

  return {
    ...toSummary(prod, storeUrl),
    body_text: (prod.body_text as string) || null,
    variants: variantRows,
    images: (prod.images as unknown[]) || [],
  };
}

// ─── Order lookup (live) ────────────────────────────────────
/**
 * Find one order by number/id, or the most recent order for a customer
 * (phone or email). Always re-fetches from Shopify so financial_status
 * and fulfillment_status are current.
 */
export async function getOrderStatus(
  tenantId: string,
  args: { order_number?: string; shopify_order_id?: number; phone?: string; email?: string }
): Promise<OrderStatus | null> {
  const client = await getClient(tenantId);

  // Prefer live fetch by id → number → most recent for customer.
  if (client && args.shopify_order_id) {
    try {
      const res = await client.rest<{ order: Record<string, unknown> }>('GET', `orders/${args.shopify_order_id}.json`);
      return normaliseLiveOrder(res.body.order);
    } catch (err) {
      console.warn('[shopify:ai] live getOrder failed', (err as Error).message);
    }
  }

  // Number → look up in mirror to get id → live fetch.
  if (args.order_number) {
    const normalised = args.order_number.startsWith('#') ? args.order_number : `#${args.order_number}`;
    const { data } = await supabaseAdmin.from('shopify_orders')
      .select('shopify_id').eq('tenant_id', tenantId).eq('order_number', normalised).maybeSingle();
    if (data?.shopify_id && client) {
      try {
        const res = await client.rest<{ order: Record<string, unknown> }>('GET', `orders/${data.shopify_id}.json`);
        return normaliseLiveOrder(res.body.order);
      } catch {
        // fall through to mirror snapshot
      }
    }
    if (data?.shopify_id) return mirrorToStatus(tenantId, data.shopify_id);
  }

  // Phone/email → most recent order in mirror → live fetch.
  const phone = args.phone ? normalizePhoneNumber(args.phone) : null;
  const email = args.email ? args.email.toLowerCase() : null;
  if (phone || email) {
    let q = supabaseAdmin.from('shopify_orders').select('shopify_id, shopify_created_at')
      .eq('tenant_id', tenantId).order('shopify_created_at', { ascending: false }).limit(1);
    if (phone) q = q.eq('phone', phone);
    else if (email) q = q.ilike('email', email);
    const { data } = await q.maybeSingle();
    if (data?.shopify_id && client) {
      try {
        const res = await client.rest<{ order: Record<string, unknown> }>('GET', `orders/${data.shopify_id}.json`);
        return normaliseLiveOrder(res.body.order);
      } catch {
        return mirrorToStatus(tenantId, data.shopify_id);
      }
    }
    if (data?.shopify_id) return mirrorToStatus(tenantId, data.shopify_id);
  }

  return null;
}

async function mirrorToStatus(tenantId: string, shopifyId: number): Promise<OrderStatus | null> {
  const { data } = await supabaseAdmin.from('shopify_orders')
    .select('order_number, shopify_id, financial_status, fulfillment_status, total_price, currency, line_items, fulfillments, shopify_created_at, cancelled_at')
    .eq('tenant_id', tenantId).eq('shopify_id', shopifyId).maybeSingle();
  if (!data) return null;
  const ff = (data.fulfillments as Array<Record<string, unknown>>) || [];
  return {
    order_number: (data.order_number as string) || null,
    shopify_id: data.shopify_id as number,
    financial_status: (data.financial_status as string) || null,
    fulfillment_status: (data.fulfillment_status as string) || null,
    total_price: (data.total_price as number) ?? null,
    currency: (data.currency as string) || null,
    line_items: ((data.line_items as Array<Record<string, unknown>>) || []).map(li => ({
      title: li.title as string | undefined,
      quantity: li.quantity as number | undefined,
    })),
    tracking: ff.map(f => ({
      number: f.tracking_number as string | undefined,
      url: f.tracking_url as string | undefined,
      company: f.tracking_company as string | undefined,
      status: (f.shipment_status || f.status) as string | undefined,
    })),
    created_at: (data.shopify_created_at as string) || null,
    cancelled_at: (data.cancelled_at as string) || null,
  };
}

function normaliseLiveOrder(o: Record<string, unknown>): OrderStatus {
  const ff = (o.fulfillments as Array<Record<string, unknown>>) || [];
  return {
    order_number: (o.name as string) || (o.order_number != null ? `#${o.order_number}` : null),
    shopify_id: o.id as number,
    financial_status: (o.financial_status as string) || null,
    fulfillment_status: (o.fulfillment_status as string) || null,
    total_price: o.total_price != null ? Number(o.total_price) : null,
    currency: (o.currency as string) || null,
    line_items: ((o.line_items as Array<Record<string, unknown>>) || []).map(li => ({
      title: li.title as string | undefined,
      quantity: li.quantity as number | undefined,
    })),
    tracking: ff.map(f => ({
      number: f.tracking_number as string | undefined,
      url: f.tracking_url as string | undefined,
      company: f.tracking_company as string | undefined,
      status: (f.shipment_status || f.status) as string | undefined,
    })),
    created_at: (o.created_at as string) || null,
    cancelled_at: (o.cancelled_at as string) || null,
  };
}

// ─── Policies ───────────────────────────────────────────────
export async function listStorePolicies(
  tenantId: string
): Promise<Array<{ type: string; title: string | null; body: string | null; url: string | null }>> {
  const { data } = await supabaseAdmin.from('shopify_policies')
    .select('policy_type, title, body, url').eq('tenant_id', tenantId);
  return (data || []).map(r => ({
    type: r.policy_type as string,
    title: (r.title as string) || null,
    body: (r.body as string) || null,
    url: (r.url as string) || null,
  }));
}

// ─── FAQ search across pages, articles, policies ────────────
export async function searchFAQ(
  tenantId: string,
  args: { query: string; limit?: number }
): Promise<Array<{ source: 'page' | 'article' | 'policy'; title: string; snippet: string; url: string | null }>> {
  const q = (args.query || '').toLowerCase().trim();
  if (!q) return [];
  const limit = Math.min(Math.max(args.limit || 5, 1), 15);
  const storeUrl = await getStoreUrl(tenantId);

  const [pagesRes, articlesRes, policiesRes] = await Promise.all([
    supabaseAdmin.from('shopify_pages').select('title, handle, body_text')
      .eq('tenant_id', tenantId).ilike('body_text', `%${q}%`).limit(limit),
    supabaseAdmin.from('shopify_articles').select('title, handle, body_text')
      .eq('tenant_id', tenantId).ilike('body_text', `%${q}%`).limit(limit),
    supabaseAdmin.from('shopify_policies').select('title, body, url, policy_type')
      .eq('tenant_id', tenantId).ilike('body', `%${q}%`).limit(limit),
  ]);

  const results: Array<{ source: 'page' | 'article' | 'policy'; title: string; snippet: string; url: string | null }> = [];
  for (const p of pagesRes.data || []) {
    const body = (p.body_text as string) || '';
    results.push({
      source: 'page',
      title: p.title as string,
      snippet: excerpt(body, q, 240),
      url: storeUrl ? `https://${storeUrl}/pages/${p.handle}` : null,
    });
  }
  for (const a of articlesRes.data || []) {
    const body = (a.body_text as string) || '';
    results.push({
      source: 'article',
      title: a.title as string,
      snippet: excerpt(body, q, 240),
      url: null,
    });
  }
  for (const p of policiesRes.data || []) {
    results.push({
      source: 'policy',
      title: (p.title as string) || (p.policy_type as string),
      snippet: excerpt((p.body as string) || '', q, 240),
      url: (p.url as string) || null,
    });
  }
  return results.slice(0, limit);
}

function excerpt(body: string, needle: string, len: number): string {
  if (!body) return '';
  const idx = body.toLowerCase().indexOf(needle);
  if (idx < 0) return body.slice(0, len);
  const start = Math.max(0, idx - Math.floor(len / 4));
  return body.slice(start, start + len).trim();
}

// ─── Active discount codes ──────────────────────────────────
export async function listActiveDiscounts(
  tenantId: string
): Promise<Array<{ code: string; type: string | null; value: number | null; ends_at: string | null }>> {
  const { data } = await supabaseAdmin.from('shopify_discounts')
    .select('code, discount_type, value, ends_at')
    .eq('tenant_id', tenantId).eq('status', 'active').limit(20);
  return (data || []).map(d => ({
    code: d.code as string,
    type: (d.discount_type as string) || null,
    value: (d.value as number) ?? null,
    ends_at: (d.ends_at as string) || null,
  }));
}

// ─── Upsell / cross-sell recommendations ────────────────────
/**
 * Simple rule-based recommender: prefer products in the same collection or
 * with overlapping tags, excluding the seed product. Good default; a smarter
 * ranker (embeddings, purchase-graph) can drop in later without changing the
 * signature.
 */
export async function recommendUpsell(
  tenantId: string,
  args: { seed_shopify_product_id: number; limit?: number }
): Promise<ProductSummary[]> {
  const limit = Math.min(Math.max(args.limit || 4, 1), 10);
  const storeUrl = await getStoreUrl(tenantId);

  const { data: seed } = await supabaseAdmin.from('shopify_products')
    .select('id, shopify_id, tags, product_type, vendor')
    .eq('tenant_id', tenantId).eq('shopify_id', args.seed_shopify_product_id).maybeSingle();
  if (!seed) return [];

  const tags = (seed.tags as string[]) || [];
  let q = supabaseAdmin.from('shopify_products')
    .select('id, shopify_id, handle, title, vendor, product_type, price_min, price_max, currency, image_url, total_inventory, tags, body_text')
    .eq('tenant_id', tenantId).eq('status', 'active')
    .neq('shopify_id', seed.shopify_id);
  if (tags.length) q = q.overlaps('tags', tags);
  else if (seed.product_type) q = q.eq('product_type', seed.product_type);

  const { data } = await q.limit(limit);
  return (data || []).map(r => toSummary(r, storeUrl));
}

// ─── Live inventory cache ───────────────────────────────────
/**
 * Fetch on-hand inventory quantities for a set of inventory_item_ids, using
 * a short-lived Redis cache to coalesce concurrent lookups. Returns null when
 * the tenant has no Shopify client OR the request fails.
 */
async function fetchLiveInventory(tenantId: string, inventoryItemIds: number[]): Promise<Map<number, number> | null> {
  if (inventoryItemIds.length === 0) return new Map();

  const redis = getRedisClient();
  const idsKey = [...inventoryItemIds].sort((a, b) => a - b).join(',');
  const cacheKey = `shopify:inv:${tenantId}:${idsKey}`;

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return new Map(JSON.parse(cached) as Array<[number, number]>);
      }
    } catch (err) {
      console.warn('[shopify:ai] inventory cache read failed', (err as Error).message);
    }
  }

  const client = await getClient(tenantId);
  if (!client) return null;

  try {
    const res = await client.rest<{ inventory_levels: Array<{ inventory_item_id: number; available: number }> }>(
      'GET', 'inventory_levels.json', { query: { inventory_item_ids: inventoryItemIds.join(',') } },
    );
    const map = new Map<number, number>();
    for (const lvl of res.body.inventory_levels || []) {
      // Sum across ALL locations — a variant with 3 in Delhi + 2 in Mumbai
      // reads as 5 available.
      map.set(lvl.inventory_item_id, (map.get(lvl.inventory_item_id) || 0) + (lvl.available || 0));
    }
    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(Array.from(map.entries())), 'EX', INVENTORY_CACHE_TTL_SECONDS);
      } catch (err) {
        console.warn('[shopify:ai] inventory cache write failed', (err as Error).message);
      }
    }
    return map;
  } catch (err) {
    console.warn('[shopify:ai] live inventory refresh failed', (err as Error).message);
    return null;
  }
}
