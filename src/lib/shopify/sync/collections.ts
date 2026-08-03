// Collections (custom + smart) sync.
//
// Shopify splits collections across two REST endpoints; we merge them
// into shopify_collections with collection_type marking origin. We also
// pull the product_ids list per collection so AI/segmentation can query
// "which products are in collection X".

import { ShopifyClient } from '../client';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { chunk } from '../util';

interface ShopifyCollection {
  id: number;
  handle: string;
  title: string;
  body_html?: string | null;
  image?: { src?: string } | null;
  updated_at?: string | null;
  published_at?: string | null;
  products_count?: number;
}

async function fetchProductIds(client: ShopifyClient, collectionId: number): Promise<number[]> {
  // /collections/{id}/products.json returns products; we only need ids.
  const ids: number[] = [];
  let pageInfo: string | null = null;
  do {
    const res: Awaited<ReturnType<typeof client.rest<{ products: Array<{ id: number }> }>>> = await client.rest<{ products: Array<{ id: number }> }>(
      'GET',
      `collections/${collectionId}/products.json`,
      pageInfo ? { pageInfo, query: { limit: 250 } } : { query: { limit: 250, fields: 'id' } }
    );
    for (const p of res.body.products || []) ids.push(p.id);
    pageInfo = res.nextPageInfo;
  } while (pageInfo);
  return ids;
}

async function upsertOne(tenantId: string, c: ShopifyCollection, type: 'custom' | 'smart', productIds: number[]): Promise<void> {
  const { error } = await supabaseAdmin.from('shopify_collections').upsert({
    tenant_id: tenantId,
    shopify_id: c.id,
    handle: c.handle,
    title: c.title,
    body_html: c.body_html || null,
    image_url: c.image?.src || null,
    collection_type: type,
    product_ids: productIds,
    products_count: productIds.length || (c.products_count ?? 0),
    shopify_updated_at: c.updated_at || null,
    published_at: c.published_at || null,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,shopify_id' });
  if (error) throw new Error(`upsert collection ${c.id}: ${error.message}`);
}

export async function syncAllCollections(client: ShopifyClient, tenantId: string): Promise<{ upserted: number; errors: number }> {
  let upserted = 0;
  let errors = 0;
  for (const kind of ['custom_collections', 'smart_collections'] as const) {
    const type: 'custom' | 'smart' = kind === 'custom_collections' ? 'custom' : 'smart';
    for await (const page of client.paginate<ShopifyCollection>(`${kind}.json`, {}, kind)) {
      for (const c of page) {
        try {
          const ids = await fetchProductIds(client, c.id);
          await upsertOne(tenantId, c, type, ids);
          upserted++;
        } catch (e) {
          errors++;
          console.error('[shopify:sync:collections] failed', { id: c.id, err: (e as Error).message });
        }
      }
    }
  }
  return { upserted, errors };
}

export async function upsertCollectionFromWebhook(client: ShopifyClient, tenantId: string, c: ShopifyCollection, type: 'custom' | 'smart'): Promise<void> {
  const ids = await fetchProductIds(client, c.id).catch(() => []);
  await upsertOne(tenantId, c, type, ids);
}

export async function deleteCollection(tenantId: string, shopifyId: number): Promise<void> {
  const { error } = await supabaseAdmin.from('shopify_collections').delete()
    .eq('tenant_id', tenantId).eq('shopify_id', shopifyId);
  if (error) throw new Error(`delete collection ${shopifyId}: ${error.message}`);
}

// used by other modules to avoid unused-import warnings
export { chunk };
