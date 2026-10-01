// Live lookups the daily report makes at send time, so the numbers are right
// even when background syncs are behind:
//
//  - Product cost (for Profit / Top Profit) straight from Shopify's
//    InventoryItem.cost, only for the products sold on the report day. The
//    product sync that would copy cost into shopify_variants only runs on a
//    full admin sync, which most tenants rarely do — and a cost edited in
//    Shopify never fires a product webhook, so the copy goes stale silently.
//  - Ad spend from the Meta Marketing API, using the tenant's WhatsApp
//    system-user token. A system user from the merchant's OWN business and app
//    can be granted ads_read on its own ad account with no App Review, so one
//    token (whatsapp_* + ads_read) covers both — see
//    scripts/connect-meta-ads-token.mjs. Without ads_read this returns null and
//    the report shows N/A.
//
// Both return null on any failure; the report never blocks on them.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptTokenV2 } from '@/lib/security/keyManager';
import { ShopifyClient } from '@/lib/shopify/client';

const GRAPH = 'https://graph.facebook.com/v22.0';
const TIMEOUT_MS = 10_000;

/** variant_id → cost per unit, for the given Shopify product ids. */
export async function fetchVariantCostsLive(tenantId: string, productIds: number[]): Promise<Map<number, number> | null> {
  if (productIds.length === 0) return new Map();
  const { data: tenant } = await supabaseAdmin.from('tenants')
    .select('shopify_store_url, shopify_access_token, shopify_api_version, shopify_shop_meta')
    .eq('id', tenantId).maybeSingle();
  if (!tenant?.shopify_access_token) return null;
  const token = decryptTokenV2(tenant.shopify_access_token as string);
  if (!token) return null;
  // The Admin API only answers on the *.myshopify.com host, not a custom domain.
  const meta = (tenant.shopify_shop_meta || {}) as { myshopify_domain?: string };
  const storeUrl = meta.myshopify_domain || (tenant.shopify_store_url as string | null);
  if (!storeUrl) return null;

  try {
    const client = new ShopifyClient({ storeUrl, accessToken: token, apiVersion: (tenant.shopify_api_version as string) || undefined });
    const variantToItem = new Map<number, number>();
    for (let i = 0; i < productIds.length; i += 100) {
      const ids = productIds.slice(i, i + 100).join(',');
      const res = await client.rest<{ products: Array<{ variants: Array<{ id: number; inventory_item_id: number }> }> }>(
        'GET', 'products.json', { query: { ids, fields: 'id,variants', limit: 250 } },
      );
      for (const p of res.body.products || []) for (const v of p.variants || []) variantToItem.set(v.id, v.inventory_item_id);
    }
    const itemIds = Array.from(new Set(variantToItem.values()));
    const costByItem = new Map<number, number>();
    for (let i = 0; i < itemIds.length; i += 100) {
      const res = await client.rest<{ inventory_items: Array<{ id: number; cost: string | null }> }>(
        'GET', 'inventory_items.json', { query: { ids: itemIds.slice(i, i + 100).join(','), limit: 100 } },
      );
      for (const it of res.body.inventory_items || []) {
        const c = it.cost == null || it.cost === '' ? NaN : Number(it.cost);
        if (Number.isFinite(c)) costByItem.set(it.id, c);
      }
    }
    const out = new Map<number, number>();
    for (const [variantId, itemId] of variantToItem) {
      const c = costByItem.get(itemId);
      if (c != null) out.set(variantId, c);
    }
    return out;
  } catch (err) {
    console.warn('[report] live Shopify cost lookup failed:', (err as Error).message);
    return null;
  }
}

async function graphGet<T>(path: string, token: string): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH}/${path}${sep}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || (body as { error?: unknown }).error) {
    throw new Error((body as { error?: { message?: string } }).error?.message || `HTTP ${res.status}`);
  }
  return body as T;
}

/**
 * Total ad spend (in the ad accounts' currency) across every ad account the
 * tenant's token can see, for one calendar day ('YYYY-MM-DD', the accounts'
 * own timezone — Indian accounts are Asia/Kolkata). null = no ads access.
 */
export async function fetchAdSpendLive(tenantId: string, day: string): Promise<number | null> {
  const { data: tenant } = await supabaseAdmin.from('tenants').select('wa_access_token').eq('id', tenantId).maybeSingle();
  const token = tenant?.wa_access_token ? decryptTokenV2(tenant.wa_access_token as string) : null;
  if (!token) return null;
  try {
    const accounts = await graphGet<{ data: Array<{ id: string; account_status: number }> }>('me/adaccounts?fields=id,account_status&limit=50', token);
    const ids = (accounts.data || []).map((a) => a.id);
    if (ids.length === 0) return null;
    let spend = 0;
    const range = encodeURIComponent(JSON.stringify({ since: day, until: day }));
    for (const id of ids) {
      const ins = await graphGet<{ data: Array<{ spend?: string }> }>(`${id}/insights?fields=spend&level=account&time_range=${range}`, token);
      for (const row of ins.data || []) spend += Number(row.spend) || 0;
    }
    return Math.round(spend * 100) / 100;
  } catch (err) {
    // Expected until the token has ads_read: "(#200) Missing Permissions".
    console.warn('[report] live Meta ad spend lookup failed:', (err as Error).message);
    return null;
  }
}
