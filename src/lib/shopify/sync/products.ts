// Products + variants sync. Upsert-based, idempotent, restartable.
//
// Called from the initial full sync AND from products/create|update
// webhooks. Deletion is handled by products/delete (see webhooks.ts).

import { ShopifyClient } from '../client';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { buildProductSearchText, chunk, htmlToText, toNum } from '../util';

interface ShopifyProduct {
  id: number;
  title: string;
  body_html?: string | null;
  vendor?: string | null;
  product_type?: string | null;
  handle: string;
  tags?: string | null;
  status?: string;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  image?: { src?: string } | null;
  images?: Array<{ id: number; src: string; alt?: string; position?: number }>;
  variants?: ShopifyVariant[];
  options?: unknown[];
}

interface ShopifyVariant {
  id: number;
  product_id: number;
  title?: string;
  sku?: string | null;
  price?: string | null;
  compare_at_price?: string | null;
  inventory_item_id?: number;
  inventory_quantity?: number;
  inventory_policy?: string;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  image_id?: number | null;
  requires_shipping?: boolean;
  weight?: number;
  weight_unit?: string;
  barcode?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SyncResult {
  processed: number;
  upserted: number;
  errors: number;
  nextCursor: string | null;
}

/** Upsert one product + its variants. Used by both full-sync page and webhook handlers. */
export async function upsertProduct(tenantId: string, p: ShopifyProduct, shopCurrency: string | null): Promise<void> {
  const body_text = htmlToText(p.body_html);
  const variants = p.variants || [];
  const prices = variants.map(v => toNum(v.price)).filter((n): n is number => n != null);
  const price_min = prices.length ? Math.min(...prices) : null;
  const price_max = prices.length ? Math.max(...prices) : null;
  const total_inventory = variants.reduce((a, v) => a + (v.inventory_quantity ?? 0), 0);

  const productRow = {
    tenant_id: tenantId,
    shopify_id: p.id,
    handle: p.handle,
    title: p.title,
    body_html: p.body_html || null,
    body_text: body_text || null,
    vendor: p.vendor || null,
    product_type: p.product_type || null,
    tags: p.tags ? p.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
    status: p.status || null,
    image_url: p.image?.src || p.images?.[0]?.src || null,
    images: p.images || [],
    price_min,
    price_max,
    currency: shopCurrency,
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
      tags: p.tags,
      body_text,
      handle: p.handle,
    }),
    raw: null, // keep row small; re-fetch from Shopify if raw needed
  };

  const { data: upserted, error } = await supabaseAdmin
    .from('shopify_products')
    .upsert(productRow, { onConflict: 'tenant_id,shopify_id' })
    .select('id')
    .single();
  if (error) throw new Error(`upsert product ${p.id}: ${error.message}`);

  if (variants.length === 0) return;

  const variantRows = variants.map(v => ({
    tenant_id: tenantId,
    product_id: upserted.id,
    shopify_id: v.id,
    shopify_product_id: v.product_id,
    sku: v.sku || null,
    title: v.title || null,
    price: toNum(v.price),
    compare_at_price: toNum(v.compare_at_price),
    currency: shopCurrency,
    inventory_item_id: v.inventory_item_id || null,
    inventory_quantity: v.inventory_quantity ?? null,
    inventory_policy: v.inventory_policy || null,
    option1: v.option1 || null,
    option2: v.option2 || null,
    option3: v.option3 || null,
    image_url: null, // resolve via image_id lookup if needed
    requires_shipping: v.requires_shipping ?? null,
    weight: v.weight ?? null,
    weight_unit: v.weight_unit || null,
    barcode: v.barcode || null,
    shopify_created_at: v.created_at || null,
    shopify_updated_at: v.updated_at || null,
    synced_at: new Date().toISOString(),
  }));

  for (const batch of chunk(variantRows, 100)) {
    const { error: verr } = await supabaseAdmin
      .from('shopify_variants')
      .upsert(batch, { onConflict: 'tenant_id,shopify_id' });
    if (verr) throw new Error(`upsert variants for product ${p.id}: ${verr.message}`);
  }
}

/** Delete a product (used by products/delete webhook). Cascade drops variants via FK. */
export async function deleteProduct(tenantId: string, shopifyProductId: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('shopify_products')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('shopify_id', shopifyProductId);
  if (error) throw new Error(`delete product ${shopifyProductId}: ${error.message}`);
}

/** Sync one page of products. Returns the next cursor for the caller to enqueue. */
export async function syncProductsPage(
  client: ShopifyClient,
  tenantId: string,
  shopCurrency: string | null,
  pageInfo: string | null
): Promise<SyncResult> {
  const res = await client.rest<{ products: ShopifyProduct[] }>('GET', 'products.json', {
    query: pageInfo ? { limit: 250 } : { limit: 250, status: 'any' },
    pageInfo: pageInfo ?? undefined,
  });
  const products = res.body.products || [];
  let upserted = 0;
  let errors = 0;
  for (const p of products) {
    try {
      await upsertProduct(tenantId, p, shopCurrency);
      upserted++;
    } catch (e) {
      errors++;
      console.error('[shopify:sync:products] upsert failed', { productId: p.id, err: (e as Error).message });
    }
  }
  return { processed: products.length, upserted, errors, nextCursor: res.nextPageInfo };
}
