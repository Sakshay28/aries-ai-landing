// Dispatch a verified Shopify webhook to the right upsert/delete path.
// Called from the queue worker after HMAC verification + dedupe.

import { ShopifyClient, shopifyClientForTenant } from './client';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { upsertProduct, deleteProduct } from './sync/products';
import { upsertCollectionFromWebhook, deleteCollection } from './sync/collections';
import { upsertCustomer, deleteCustomer } from './sync/customers';
import { upsertOrder, deleteOrder } from './sync/orders';

export interface DispatchInput {
  tenantId: string;
  topic: string;
  payload: unknown;
}

/** Run the appropriate handler for a given topic. Throws on error. */
export async function dispatchShopifyWebhook(input: DispatchInput): Promise<{ handled: boolean; note?: string }> {
  const { tenantId, topic, payload } = input;
  if (!payload || typeof payload !== 'object') return { handled: false, note: 'empty payload' };

  const client = await getClient(tenantId);
  const shopCurrency = await getShopCurrency(tenantId);

  switch (topic) {
    // ── Products ─────────────────────────────────────────
    case 'products/create':
    case 'products/update':
      await upsertProduct(tenantId, payload as never, shopCurrency);
      return { handled: true };
    case 'products/delete':
      await deleteProduct(tenantId, (payload as { id: number }).id);
      return { handled: true };

    // ── Collections ──────────────────────────────────────
    case 'collections/create':
    case 'collections/update': {
      if (!client) return { handled: false, note: 'no client' };
      // Topic doesn't tell us custom vs smart, but we don't currently care;
      // we treat as 'custom' unless the payload has `disjunctive` / `rules`.
      const p = payload as Record<string, unknown>;
      const type = ('rules' in p) ? 'smart' : 'custom';
      await upsertCollectionFromWebhook(client, tenantId, payload as never, type);
      return { handled: true };
    }
    case 'collections/delete':
      await deleteCollection(tenantId, (payload as { id: number }).id);
      return { handled: true };

    // ── Customers ────────────────────────────────────────
    case 'customers/create':
    case 'customers/update':
      await upsertCustomer(tenantId, payload as never);
      return { handled: true };
    case 'customers/delete':
      await deleteCustomer(tenantId, (payload as { id: number }).id);
      return { handled: true };

    // ── Orders ───────────────────────────────────────────
    case 'orders/create':
    case 'orders/updated':
    case 'orders/paid':
    case 'orders/fulfilled':
    case 'orders/partially_fulfilled':
    case 'orders/cancelled':
      await upsertOrder(tenantId, payload as never);
      await emitShopifyEvent(tenantId, topic, payload);
      return { handled: true };

    // ── Fulfillments ─────────────────────────────────────
    case 'fulfillments/create':
    case 'fulfillments/update': {
      // Fulfillment webhooks carry order_id; re-pull the order for a clean snapshot.
      if (!client) return { handled: false, note: 'no client' };
      const orderId = (payload as { order_id?: number }).order_id;
      if (!orderId) return { handled: false, note: 'no order_id' };
      const res = await client.rest<{ order: Record<string, unknown> }>('GET', `orders/${orderId}.json`);
      await upsertOrder(tenantId, res.body.order as never);
      await emitShopifyEvent(tenantId, topic, payload);
      return { handled: true };
    }

    // ── Checkouts / abandoned carts ──────────────────────
    case 'checkouts/create':
    case 'checkouts/update':
    case 'checkouts/delete':
      await emitShopifyEvent(tenantId, topic, payload);
      return { handled: true };

    // ── App/shop lifecycle ───────────────────────────────
    case 'app/uninstalled':
    case 'shop/update':
      // For Custom App: 'app/uninstalled' fires when the merchant deletes the
      // Custom App. Mark the connection dead so we stop trying to call the API.
      if (topic === 'app/uninstalled') {
        await supabaseAdmin.from('tenants').update({
          shopify_sync_status: 'error',
          shopify_sync_error: 'App uninstalled by merchant',
        }).eq('id', tenantId);
      }
      return { handled: true };

    default:
      return { handled: false, note: `unhandled topic: ${topic}` };
  }
}

async function getClient(tenantId: string): Promise<ShopifyClient | null> {
  const { data } = await supabaseAdmin.from('tenants')
    .select('shopify_store_url, shopify_access_token, shopify_api_version')
    .eq('id', tenantId).single();
  return data ? shopifyClientForTenant(data) : null;
}

async function getShopCurrency(tenantId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('tenants')
    .select('shopify_shop_meta').eq('id', tenantId).single();
  const meta = data?.shopify_shop_meta as { currency?: string } | null;
  return meta?.currency || null;
}

/**
 * Legacy compat: keep writing to the pre-existing shopify_events table so the
 * rest of the codebase (flows engine, google-sheets triggers) still sees the
 * order/checkout events it was already subscribed to.
 */
async function emitShopifyEvent(tenantId: string, topic: string, payload: unknown): Promise<void> {
  const p = payload as Record<string, unknown> | null;
  const map: Record<string, string> = {
    'orders/create': 'order_created',
    'orders/fulfilled': 'order_fulfilled',
    'orders/partially_fulfilled': 'order_fulfilled',
    'orders/cancelled': 'order_cancelled',
    'checkouts/create': 'checkout_started',
    'checkouts/update': 'cart_abandoned', // engines can filter by attempt count / age
  };
  const eventType = map[topic];
  if (!eventType || !p) return;

  const shopifyOrderId = 'id' in p ? String(p.id) : null;
  const totalPrice = p.total_price != null ? Number(p.total_price) : null;
  const currency = (p.currency as string) || null;

  try {
    await supabaseAdmin.from('shopify_events').insert({
      tenant_id: tenantId,
      event_type: eventType,
      shopify_order_id: shopifyOrderId,
      order_value: Number.isFinite(totalPrice as number) ? totalPrice : null,
      currency: currency || 'INR',
      payload: p,
    });
  } catch (err) {
    // Non-fatal — legacy table may have a stricter schema on some tenants.
    console.warn('[shopify:webhook] shopify_events insert failed:', (err as Error).message);
  }
}
