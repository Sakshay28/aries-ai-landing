// Dispatch a verified Shopify webhook to the right upsert/delete path.
// Called from the queue worker after HMAC verification + dedupe.

import { ShopifyClient, shopifyClientForTenant } from './client';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { upsertProduct, deleteProduct } from './sync/products';
import { upsertCollectionFromWebhook, deleteCollection } from './sync/collections';
import { upsertCustomer, deleteCustomer } from './sync/customers';
import { upsertOrder, deleteOrder } from './sync/orders';
import { triggerAutomations, TriggerEvent } from '@/lib/automations/engine';
import { resolveShopifyOrderVariables, resolveShopifyCheckoutVariables, extractCustomerIdentifiers } from './automationVariables';

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
      await fireOrderAutomation(tenantId, topic, payload);
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
      // Fulfillments fire the SAME "order_fulfilled" automation as orders/fulfilled,
      // but sourced from the fresh order snapshot we just pulled.
      await fireOrderAutomation(tenantId, 'orders/fulfilled', res.body.order);
      return { handled: true };
    }

    // ── Checkouts / abandoned carts ──────────────────────
    case 'checkouts/create':
    case 'checkouts/update':
    case 'checkouts/delete':
      await emitShopifyEvent(tenantId, topic, payload);
      if (topic === 'checkouts/update') {
        await fireCheckoutAutomation(tenantId, payload);
      }
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

// ─── Automation dispatch ─────────────────────────────────────
// Maps a Shopify webhook topic to an automation TriggerEvent. Only these
// customer-visible topics fire automations — 'orders/updated' would fire
// on every internal edit and drown the queue in duplicates.
const ORDER_TOPIC_TO_TRIGGER: Record<string, TriggerEvent> = {
  'orders/create':               'shopify_order_created',
  'orders/paid':                 'shopify_order_paid',
  'orders/fulfilled':            'shopify_order_fulfilled',
  'orders/partially_fulfilled':  'shopify_order_fulfilled',
  'orders/cancelled':            'shopify_order_cancelled',
};

async function tenantStoreUrl(tenantId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('tenants').select('shopify_store_url').eq('id', tenantId).single();
  return (data?.shopify_store_url as string) || null;
}

async function resolveLeadId(tenantId: string, ids: { phone: string | null; email: string | null; shopify_customer_id: number | null }): Promise<string | null> {
  if (ids.shopify_customer_id != null) {
    const { data } = await supabaseAdmin.from('shopify_customers').select('lead_id').eq('tenant_id', tenantId).eq('shopify_id', ids.shopify_customer_id).maybeSingle();
    if (data?.lead_id) return data.lead_id as string;
  }
  if (ids.phone) {
    const { data } = await supabaseAdmin.from('leads').select('id').eq('tenant_id', tenantId).eq('phone', ids.phone).maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (ids.email) {
    const { data } = await supabaseAdmin.from('leads').select('id').eq('tenant_id', tenantId).ilike('email', ids.email).maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

async function fireOrderAutomation(tenantId: string, topic: string, payload: unknown): Promise<void> {
  const trigger = ORDER_TOPIC_TO_TRIGGER[topic];
  if (!trigger || !payload || typeof payload !== 'object') return;
  const order = payload as Record<string, unknown>;
  const ids = extractCustomerIdentifiers(order as never);
  const leadId = await resolveLeadId(tenantId, ids);
  // Even without a lead, we call triggerAutomations with phone so the resolver
  // can create/find one for automations that use phone-only send targets.
  const variables = resolveShopifyOrderVariables(order as never, await tenantStoreUrl(tenantId));
  try {
    await triggerAutomations({
      tenantId,
      event: trigger,
      leadId: leadId || undefined,
      phone: ids.phone || undefined,
      variables,
    });
  } catch (err) {
    console.error(`[shopify:automation] ${trigger} dispatch failed`, (err as Error).message);
  }
}

async function fireCheckoutAutomation(tenantId: string, payload: unknown): Promise<void> {
  if (!payload || typeof payload !== 'object') return;
  const checkout = payload as Record<string, unknown>;
  const ids = extractCustomerIdentifiers(checkout as never);
  // Abandoned-checkout guards: only fire when we have a way to reach the shopper.
  if (!ids.phone && !ids.email) return;
  const leadId = await resolveLeadId(tenantId, ids);
  const variables = resolveShopifyCheckoutVariables(checkout as never, await tenantStoreUrl(tenantId));
  try {
    await triggerAutomations({
      tenantId,
      event: 'shopify_checkout_abandoned',
      leadId: leadId || undefined,
      phone: ids.phone || undefined,
      variables,
    });
  } catch (err) {
    console.error('[shopify:automation] shopify_checkout_abandoned dispatch failed', (err as Error).message);
  }
}

