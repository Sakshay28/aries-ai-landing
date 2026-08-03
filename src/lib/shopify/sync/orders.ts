// Orders sync — recent snapshots only.
//
// Full-sync fetches orders from the last 90 days by default (configurable).
// Older orders can still be pulled on demand by the AI order-lookup tool
// via the live API. Volatile fields (financial_status, fulfillment_status,
// refunds) should be re-checked live for user-facing responses.
//
// Every order snapshot gets snapshot_expires_at = created_at + 90 days;
// a periodic cleanup task can VACUUM the expired ones.

import { ShopifyClient } from '../client';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { orderNumberOf, toNum } from '../util';
import { normalizePhoneNumber } from '@/lib/whatsapp/phone';

interface ShopifyOrder {
  id: number;
  name?: string;
  order_number?: number | string;
  customer?: { id?: number; email?: string | null; phone?: string | null } | null;
  email?: string | null;
  phone?: string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  total_price?: string | number | null;
  subtotal_price?: string | number | null;
  total_tax?: string | number | null;
  currency?: string | null;
  line_items?: Array<Record<string, unknown>>;
  shipping_address?: Record<string, unknown> | null;
  fulfillments?: Array<Record<string, unknown>>;
  tags?: string | null;
  note?: string | null;
  cancel_reason?: string | null;
  created_at?: string;
  updated_at?: string;
  processed_at?: string | null;
  cancelled_at?: string | null;
  closed_at?: string | null;
}

const DEFAULT_LOOKBACK_DAYS = 90;
const SNAPSHOT_RETENTION_DAYS = 90;

function snapshotExpiry(): string {
  return new Date(Date.now() + SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function findLeadFor(tenantId: string, phone: string | null, email: string | null): Promise<string | null> {
  if (phone) {
    const { data } = await supabaseAdmin.from('leads').select('id')
      .eq('tenant_id', tenantId).eq('phone', phone).limit(1).maybeSingle();
    if (data?.id) return data.id;
  }
  if (email) {
    const { data } = await supabaseAdmin.from('leads').select('id')
      .eq('tenant_id', tenantId).ilike('email', email).limit(1).maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

export async function upsertOrder(tenantId: string, o: ShopifyOrder): Promise<void> {
  const email = (o.customer?.email || o.email || '').toLowerCase() || null;
  const rawPhone = o.customer?.phone || o.phone || null;
  const phone = rawPhone ? normalizePhoneNumber(rawPhone) : null;
  const leadId = await findLeadFor(tenantId, phone, email);

  const row = {
    tenant_id: tenantId,
    shopify_id: o.id,
    order_number: orderNumberOf(o),
    customer_shopify_id: o.customer?.id ?? null,
    lead_id: leadId,
    email,
    phone,
    financial_status: o.financial_status || null,
    fulfillment_status: o.fulfillment_status || null,
    total_price: toNum(o.total_price),
    subtotal_price: toNum(o.subtotal_price),
    total_tax: toNum(o.total_tax),
    currency: o.currency || null,
    line_items: (o.line_items || []).map(li => ({
      id: (li as Record<string, unknown>).id,
      title: (li as Record<string, unknown>).title,
      quantity: (li as Record<string, unknown>).quantity,
      price: (li as Record<string, unknown>).price,
      sku: (li as Record<string, unknown>).sku,
      variant_id: (li as Record<string, unknown>).variant_id,
      product_id: (li as Record<string, unknown>).product_id,
    })),
    shipping_address: o.shipping_address || null,
    fulfillments: (o.fulfillments || []).map(f => ({
      id: (f as Record<string, unknown>).id,
      status: (f as Record<string, unknown>).status,
      tracking_number: (f as Record<string, unknown>).tracking_number,
      tracking_url: (f as Record<string, unknown>).tracking_url,
      tracking_company: (f as Record<string, unknown>).tracking_company,
      shipment_status: (f as Record<string, unknown>).shipment_status,
      created_at: (f as Record<string, unknown>).created_at,
    })),
    tags: o.tags ? o.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
    note: o.note || null,
    cancel_reason: o.cancel_reason || null,
    shopify_created_at: o.created_at || null,
    shopify_updated_at: o.updated_at || null,
    processed_at: o.processed_at || null,
    cancelled_at: o.cancelled_at || null,
    closed_at: o.closed_at || null,
    snapshot_expires_at: snapshotExpiry(),
    synced_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from('shopify_orders')
    .upsert(row, { onConflict: 'tenant_id,shopify_id' });
  if (error) throw new Error(`upsert order ${o.id}: ${error.message}`);
}

export async function syncOrdersPage(
  client: ShopifyClient,
  tenantId: string,
  pageInfo: string | null,
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS
): Promise<{ processed: number; upserted: number; errors: number; nextCursor: string | null }> {
  const initialQuery: Record<string, string | number> = {
    limit: 250,
    status: 'any',
    created_at_min: new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString(),
  };
  const res = await client.rest<{ orders: ShopifyOrder[] }>('GET', 'orders.json', {
    query: pageInfo ? { limit: 250 } : initialQuery,
    pageInfo: pageInfo ?? undefined,
  });
  const orders = res.body.orders || [];
  let upserted = 0;
  let errors = 0;
  for (const o of orders) {
    try { await upsertOrder(tenantId, o); upserted++; }
    catch (e) { errors++; console.error('[shopify:sync:orders]', (e as Error).message); }
  }
  return { processed: orders.length, upserted, errors, nextCursor: res.nextPageInfo };
}

export async function deleteOrder(tenantId: string, shopifyId: number): Promise<void> {
  const { error } = await supabaseAdmin.from('shopify_orders').delete()
    .eq('tenant_id', tenantId).eq('shopify_id', shopifyId);
  if (error) throw new Error(`delete order ${shopifyId}: ${error.message}`);
}
