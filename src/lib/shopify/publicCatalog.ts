// ═══════════════════════════════════════════════════════════
// Public storefront catalog import (no Admin API token needed)
// ═══════════════════════════════════════════════════════════
// Some clients run a live Shopify storefront but haven't (or can't)
// create a Custom App to give us an Admin API token. Every Shopify
// storefront still exposes a PUBLIC, unauthenticated products feed at
// `/products.json` (paginated, 250/page). That feed is the same data
// shoppers see, so it's safe ground truth for product NAME, HANDLE,
// PRICE, IMAGE and IN-STOCK — everything the WhatsApp AI needs to
// answer "do you have X?" and share the exact product link.
//
// This importer mirrors that public feed into the SAME
// shopify_products / shopify_variants tables the Admin-API sync uses,
// so the entire downstream AI pipeline (aiContext → engine → webhook
// image/link reply) lights up unchanged.
//
// What the public feed does NOT give us: live inventory counts,
// customer/order data, discounts, or draft/unpublished products. Those
// stay empty and the AI degrades gracefully (see ./ai.ts — every
// live-API path returns [] when there's no token). Stock is inferred
// from the per-variant `available` boolean.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildProductSearchText, htmlToText, toNum, chunk } from './util';

interface PublicVariant {
  id: number;
  title?: string | null;
  sku?: string | null;
  price?: string | null;
  compare_at_price?: string | null;
  available?: boolean;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  requires_shipping?: boolean;
  grams?: number;
  created_at?: string | null;
  updated_at?: string | null;
}

interface PublicProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  tags?: string[] | string | null;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  images?: Array<{ id: number; src: string; alt?: string | null; position?: number }>;
  variants?: PublicVariant[];
  options?: unknown[];
}

export interface PublicCatalogResult {
  store_domain: string;
  currency: string | null;
  fetched: number;
  upserted: number;
  removed: number;
  errors: number;
}

const MAX_PAGES = 40; // 40 × 250 = 10k products — a hard safety stop.

/** Normalise a public storefront URL to the bare host (keeps a real domain as-is). */
export function publicStoreHost(input: string): string {
  const s = (input || '').trim().toLowerCase();
  if (!s) throw new Error('Empty storefront URL');
  return s.replace(/^https?:\/\//, '').replace(/\/+$/, '').split('/')[0];
}

async function fetchPublicProducts(host: string): Promise<PublicProduct[]> {
  const all: PublicProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `https://${host}/products.json?limit=250&page=${page}`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      if (page === 1) throw new Error(`storefront ${host} returned ${res.status} for /products.json`);
      break; // a later page failing just ends pagination
    }
    const json = (await res.json()) as { products?: PublicProduct[] };
    const products = json.products || [];
    all.push(...products);
    if (products.length < 250) break; // last page
  }
  return all;
}

/** Best-effort store currency from the public feed price shape (Shopify feed omits it). */
async function detectCurrency(host: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${host}/meta.json`, { headers: { accept: 'application/json' } });
    if (res.ok) {
      const j = (await res.json()) as { currency?: string };
      if (j.currency) return j.currency;
    }
  } catch { /* ignore */ }
  return null;
}

/** Map one public product to the shopify_products row shape (matches sync/products.ts). */
function toProductRow(tenantId: string, p: PublicProduct, currency: string | null) {
  const body_text = htmlToText(p.body_html);
  const variants = p.variants || [];
  const prices = variants.map(v => toNum(v.price)).filter((n): n is number => n != null);
  const price_min = prices.length ? Math.min(...prices) : null;
  const price_max = prices.length ? Math.max(...prices) : null;
  // Public feed has no inventory counts — infer stock from `available`.
  // null = "in stock, count unknown" (toSummary treats null as in-stock);
  // 0 = "no variant available" so the AI flags it OUT OF STOCK.
  const anyAvailable = variants.some(v => v.available);
  const total_inventory = variants.length === 0 ? null : anyAvailable ? null : 0;
  const tags = Array.isArray(p.tags)
    ? p.tags
    : typeof p.tags === 'string'
      ? p.tags.split(',').map(s => s.trim()).filter(Boolean)
      : [];

  return {
    tenant_id: tenantId,
    shopify_id: p.id,
    handle: p.handle,
    title: p.title,
    body_html: p.body_html || null,
    body_text: body_text || null,
    vendor: p.vendor || null,
    product_type: p.product_type || null,
    tags,
    status: 'active', // the public feed only returns published/active products
    image_url: p.images?.[0]?.src || null,
    images: p.images || [],
    price_min,
    price_max,
    currency,
    total_inventory,
    online_store_url: null,
    shopify_created_at: p.created_at || null,
    shopify_updated_at: p.updated_at || null,
    published_at: p.published_at || null,
    synced_at: new Date().toISOString(),
    search_text: buildProductSearchText({
      title: p.title,
      vendor: p.vendor,
      product_type: p.product_type,
      tags,
      body_text,
      handle: p.handle,
    }),
    raw: null,
  };
}

function toVariantRows(tenantId: string, productRowId: string, p: PublicProduct, currency: string | null) {
  return (p.variants || []).map(v => ({
    tenant_id: tenantId,
    product_id: productRowId,
    shopify_id: v.id,
    shopify_product_id: p.id,
    sku: v.sku || null,
    title: v.title || null,
    price: toNum(v.price),
    compare_at_price: toNum(v.compare_at_price),
    currency,
    inventory_item_id: null, // Admin-only; unavailable from public feed
    inventory_quantity: null,
    inventory_policy: null,
    option1: v.option1 || null,
    option2: v.option2 || null,
    option3: v.option3 || null,
    image_url: null,
    requires_shipping: v.requires_shipping ?? null,
    weight: v.grams != null ? v.grams / 1000 : null,
    weight_unit: v.grams != null ? 'kg' : null,
    barcode: null,
    shopify_created_at: v.created_at || null,
    shopify_updated_at: v.updated_at || null,
    synced_at: new Date().toISOString(),
  }));
}

/**
 * Import a public Shopify storefront catalog into the mirror for `tenantId`.
 * Idempotent: upserts on (tenant_id, shopify_id) and removes products that
 * have disappeared from the storefront since the last run. Also stamps the
 * tenant's shopify_store_url + currency so the AI context path activates.
 */
export async function importPublicCatalog(
  tenantId: string,
  storefrontUrl: string,
  opts: { pruneMissing?: boolean } = {},
): Promise<PublicCatalogResult> {
  const host = publicStoreHost(storefrontUrl);
  const products = await fetchPublicProducts(host);
  const currency = await detectCurrency(host);

  let upserted = 0;
  let errors = 0;
  const seenIds: number[] = [];

  for (const p of products) {
    try {
      const { data: row, error } = await supabaseAdmin
        .from('shopify_products')
        .upsert(toProductRow(tenantId, p, currency), { onConflict: 'tenant_id,shopify_id' })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      seenIds.push(p.id);

      const variantRows = toVariantRows(tenantId, row.id, p, currency);
      if (variantRows.length) {
        for (const batch of chunk(variantRows, 100)) {
          const { error: verr } = await supabaseAdmin
            .from('shopify_variants')
            .upsert(batch, { onConflict: 'tenant_id,shopify_id' });
          if (verr) throw new Error(`variants: ${verr.message}`);
        }
      }
      upserted++;
    } catch (e) {
      errors++;
      console.error('[shopify:publicCatalog] upsert failed', { productId: p.id, err: (e as Error).message });
    }
  }

  // Prune products that vanished from the storefront (deleted / unpublished).
  let removed = 0;
  if (opts.pruneMissing !== false && seenIds.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from('shopify_products')
      .select('shopify_id')
      .eq('tenant_id', tenantId);
    const seen = new Set(seenIds);
    const stale = (existing || [])
      .map(r => r.shopify_id as number)
      .filter(id => !seen.has(id));
    for (const batch of chunk(stale, 100)) {
      const { error, count } = await supabaseAdmin
        .from('shopify_products')
        .delete({ count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('shopify_id', batch);
      if (!error) removed += count ?? 0;
    }
  }

  // Stamp tenant so the WhatsApp AI context path activates. We deliberately
  // leave shopify_access_token NULL — this is a token-less, mirror-only
  // connection. Marking the source lets the refresh cron find it again.
  const meta = { currency, source: 'public_catalog', last_public_sync_at: new Date().toISOString() };
  await supabaseAdmin.from('tenants').update({
    // Store the customer-facing host (e.g. "devprayagjal.com"), NOT the
    // *.myshopify.com admin domain — product links are built as
    // https://{shopify_store_url}/products/{handle} and must be shareable.
    shopify_store_url: host,
    shopify_shop_meta: meta,
    shopify_sync_status: errors > 0 ? 'error' : 'idle',
    shopify_last_full_sync_at: new Date().toISOString(),
  }).eq('id', tenantId);

  return { store_domain: host, currency, fetched: products.length, upserted, removed, errors };
}
