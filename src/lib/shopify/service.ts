// Shopify integration service facade.
//
// One entrypoint per operation the admin UI (or cron) needs:
//   - validateCredentials()  — checks the token works and captures shop meta
//   - connectTenant()        — writes encrypted creds + kicks off full sync
//   - registerWebhooks()     — installs all topics we care about
//   - disconnectTenant()     — clears creds + best-effort deletes webhooks
//   - triggerFullSync()      — re-enqueue a full sync
//   - getStatus()            — dashboard summary
//
// When we add OAuth later, we only add a second `connectTenantByOAuth()`
// that calls the same connectTenant() with a token from the OAuth exchange.
// Nothing else moves.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { encryptTokenV2, decryptTokenV2 } from '@/lib/security/keyManager';
import {
  ShopifyClient,
  normaliseStoreDomain,
  DEFAULT_API_VERSION,
  shopifyClientForTenant,
} from './client';
import { enqueueFullSync } from './queue';

export interface ConnectInput {
  tenantId: string;
  storeUrl: string;
  accessToken: string;   // plaintext — will be encrypted before storing
  sharedSecret: string;  // plaintext — will be encrypted before storing
  apiVersion?: string;
}

export interface StatusSummary {
  connected: boolean;
  store_url: string | null;
  api_version: string | null;
  connected_at: string | null;
  last_full_sync_at: string | null;
  sync_status: 'idle' | 'syncing' | 'error' | null;
  sync_error: string | null;
  counts: {
    products: number;
    variants: number;
    collections: number;
    customers: number;
    orders: number;
    pages: number;
    articles: number;
    policies: number;
    discounts: number;
  };
  pending_jobs: number;
  failed_jobs: number;
}

// ─── Validate ───────────────────────────────────────────────
export async function validateCredentials(input: {
  storeUrl: string;
  accessToken: string;
  apiVersion?: string;
}): Promise<{ ok: true; shop: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const client = new ShopifyClient({
      storeUrl: input.storeUrl,
      accessToken: input.accessToken,
      apiVersion: input.apiVersion,
    });
    const shop = await client.getShop();
    return { ok: true, shop };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ─── Connect ────────────────────────────────────────────────
export async function connectTenant(input: ConnectInput): Promise<{ ok: true; shop: Record<string, unknown> } | { ok: false; error: string }> {
  const validation = await validateCredentials(input);
  if (!validation.ok) return validation;

  const domain = normaliseStoreDomain(input.storeUrl);
  const encToken = encryptTokenV2(input.accessToken);
  const encSecret = encryptTokenV2(input.sharedSecret);
  if (!encToken || !encSecret) return { ok: false, error: 'encryption failed' };

  const { error } = await supabaseAdmin.from('tenants').update({
    shopify_store_url: domain,
    shopify_access_token: encToken,
    shopify_webhook_secret: encSecret,
    shopify_api_version: input.apiVersion || DEFAULT_API_VERSION,
    shopify_connected_at: new Date().toISOString(),
    shopify_sync_status: 'idle',
    shopify_sync_error: null,
    shopify_shop_meta: validation.shop,
  }).eq('id', input.tenantId);

  if (error) return { ok: false, error: error.message };

  // Register webhooks best-effort. Failures don't block the connect flow — the
  // admin UI shows webhook status separately and can re-run this step.
  const client = new ShopifyClient({
    storeUrl: domain,
    accessToken: input.accessToken,
    apiVersion: input.apiVersion,
  });
  await registerWebhooks(input.tenantId, client).catch(err => {
    console.error('[shopify:connect] webhook registration failed', (err as Error).message);
  });

  await enqueueFullSync(input.tenantId).catch(err => {
    console.error('[shopify:connect] enqueue full sync failed', (err as Error).message);
  });

  return { ok: true, shop: validation.shop };
}

// ─── Webhooks registration ──────────────────────────────────
export const REQUIRED_WEBHOOK_TOPICS = [
  'products/create', 'products/update', 'products/delete',
  'collections/create', 'collections/update', 'collections/delete',
  'customers/create', 'customers/update', 'customers/delete',
  'orders/create', 'orders/updated', 'orders/paid',
  'orders/fulfilled', 'orders/partially_fulfilled', 'orders/cancelled',
  'fulfillments/create', 'fulfillments/update',
  'checkouts/create', 'checkouts/update', 'checkouts/delete',
  'app/uninstalled', 'shop/update',
] as const;

export async function registerWebhooks(tenantId: string, client: ShopifyClient): Promise<{ created: number; existing: number; failed: number }> {
  const publicBase = requiredEnv('APP_PUBLIC_URL');
  const address = `${publicBase.replace(/\/+$/, '')}/api/webhooks/shopify`;

  // List existing webhooks so we don't double-register.
  const existing = await client.rest<{ webhooks: Array<{ id: number; topic: string; address: string }> }>(
    'GET', 'webhooks.json', { query: { limit: 250 } },
  );
  const existingSet = new Set(
    (existing.body.webhooks || [])
      .filter(w => w.address === address)
      .map(w => w.topic),
  );

  let created = 0;
  let existingCount = 0;
  let failed = 0;
  for (const topic of REQUIRED_WEBHOOK_TOPICS) {
    if (existingSet.has(topic)) { existingCount++; continue; }
    try {
      await client.rest('POST', 'webhooks.json', {
        body: { webhook: { topic, address, format: 'json' } },
      });
      created++;
    } catch (e) {
      failed++;
      console.error(`[shopify:webhooks] failed to register ${topic}:`, (e as Error).message);
    }
  }
  console.log(`[shopify:webhooks] tenant=${tenantId} created=${created} existing=${existingCount} failed=${failed}`);
  return { created, existing: existingCount, failed };
}

// ─── Disconnect ─────────────────────────────────────────────
export async function disconnectTenant(tenantId: string): Promise<void> {
  const { data: tenant } = await supabaseAdmin.from('tenants')
    .select('shopify_store_url, shopify_access_token, shopify_api_version')
    .eq('id', tenantId).single();

  // Best-effort delete of our webhooks so the merchant sees them gone.
  if (tenant?.shopify_access_token) {
    const client = shopifyClientForTenant(tenant);
    if (client) {
      try {
        const publicBase = process.env.APP_PUBLIC_URL || '';
        const address = `${publicBase.replace(/\/+$/, '')}/api/webhooks/shopify`;
        const res = await client.rest<{ webhooks: Array<{ id: number; address: string }> }>(
          'GET', 'webhooks.json', { query: { limit: 250 } },
        );
        for (const w of res.body.webhooks || []) {
          if (w.address === address) {
            await client.rest('DELETE', `webhooks/${w.id}.json`).catch(() => undefined);
          }
        }
      } catch (err) {
        console.warn('[shopify:disconnect] webhook cleanup failed:', (err as Error).message);
      }
    }
  }

  await supabaseAdmin.from('tenants').update({
    shopify_store_url: null,
    shopify_access_token: null,
    shopify_webhook_secret: null,
    shopify_api_version: null,
    shopify_connected_at: null,
    shopify_last_full_sync_at: null,
    shopify_sync_status: 'idle',
    shopify_sync_error: null,
    shopify_shop_meta: {},
  }).eq('id', tenantId);

  // Cancel pending jobs.
  await supabaseAdmin.from('shopify_sync_jobs').update({
    status: 'cancelled', completed_at: new Date().toISOString(),
  }).eq('tenant_id', tenantId).eq('status', 'pending');
}

// ─── Trigger full sync ──────────────────────────────────────
export async function triggerFullSync(tenantId: string, opts: { lookbackDays?: number } = {}): Promise<void> {
  await enqueueFullSync(tenantId, opts);
}

// ─── Status summary ─────────────────────────────────────────
export async function getStatus(tenantId: string): Promise<StatusSummary> {
  const [{ data: tenant }, ...countRows] = await Promise.all([
    supabaseAdmin.from('tenants').select('shopify_store_url, shopify_api_version, shopify_connected_at, shopify_last_full_sync_at, shopify_sync_status, shopify_sync_error').eq('id', tenantId).single(),
    countTable('shopify_products', tenantId),
    countTable('shopify_variants', tenantId),
    countTable('shopify_collections', tenantId),
    countTable('shopify_customers', tenantId),
    countTable('shopify_orders', tenantId),
    countTable('shopify_pages', tenantId),
    countTable('shopify_articles', tenantId),
    countTable('shopify_policies', tenantId),
    countTable('shopify_discounts', tenantId),
    countJobs(tenantId, 'pending'),
    countJobs(tenantId, 'failed'),
  ]);
  const [products, variants, collections, customers, orders, pages, articles, policies, discounts, pending, failed] = countRows;
  return {
    connected: !!tenant?.shopify_store_url,
    store_url: tenant?.shopify_store_url || null,
    api_version: tenant?.shopify_api_version || null,
    connected_at: tenant?.shopify_connected_at || null,
    last_full_sync_at: tenant?.shopify_last_full_sync_at || null,
    sync_status: (tenant?.shopify_sync_status as StatusSummary['sync_status']) || null,
    sync_error: tenant?.shopify_sync_error || null,
    counts: { products, variants, collections, customers, orders, pages, articles, policies, discounts },
    pending_jobs: pending,
    failed_jobs: failed,
  };
}

async function countTable(table: string, tenantId: string): Promise<number> {
  const { count } = await supabaseAdmin.from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  return count || 0;
}
async function countJobs(tenantId: string, status: string): Promise<number> {
  const { count } = await supabaseAdmin.from('shopify_sync_jobs').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', status);
  return count || 0;
}

function requiredEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing env: ${key}`);
  return v;
}

// re-export for downstream
export { decryptTokenV2 };
