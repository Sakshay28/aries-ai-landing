// Shipment creation from a shopify_orders row — the core of the MVP slice.
//
// Idempotency is enforced by the DB (uq_shiprocket_shipments_tenant_order),
// not by disabling a frontend button: we INSERT a placeholder row before
// calling Shiprocket at all, and a concurrent/duplicate call that hits the
// unique-violation just returns the existing row instead of erroring or
// creating a second shipment — the same pattern the Shopify webhook route
// uses for duplicate deliveries (src/app/api/webhooks/shopify/route.ts).

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getValidShiprocketToken, shiprocketClientForTenant } from './service';
import { ShiprocketApiError, type CreateOrderLineItem, type CourierOption } from './client';
import { normalizeShiprocketStatus, type ShipmentStatus } from './statusMap';

export interface ShiprocketShipmentRow {
  id: string;
  tenant_id: string;
  shopify_order_id: string | null;
  shopify_order_number: string | null;
  shopify_order_shopify_id: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  shiprocket_order_id: number | null;
  shiprocket_shipment_id: number | null;
  courier_id: number | null;
  courier_name: string | null;
  awb_code: string | null;
  pickup_scheduled_at: string | null;
  pickup_token_number: string | null;
  label_url: string | null;
  manifest_url: string | null;
  payment_method: 'Prepaid' | 'COD' | null;
  status: ShipmentStatus;
  status_raw: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentResult {
  ok: boolean;
  shipment?: ShiprocketShipmentRow;
  error?: string;
}

const WEIGHT_UNIT_TO_KG: Record<string, number> = { kg: 1, g: 0.001, lb: 0.453592, oz: 0.0283495 };
const REQUIRED_ADDRESS_FIELDS = ['address1', 'city', 'zip', 'province', 'country', 'phone'] as const;

export async function createShipmentFromOrder(tenantId: string, shopifyOrderId: string): Promise<ShipmentResult> {
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('shopify_orders')
    .select('*')
    .eq('id', shopifyOrderId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (orderErr || !order) return { ok: false, error: 'Order not found' };

  // ── Step 1: insert the idempotency-guard row before any Shiprocket call ──
  const insert = await supabaseAdmin
    .from('shiprocket_shipments')
    .insert({
      tenant_id: tenantId,
      shopify_order_id: shopifyOrderId,
      shopify_order_number: order.order_number,
      shopify_order_shopify_id: order.shopify_id,
      customer_name: extractCustomerName(order),
      customer_phone: order.phone,
      customer_email: order.email,
      status: 'creating',
    })
    .select('*')
    .single();

  let shipmentRow: ShiprocketShipmentRow;
  if (insert.error) {
    if (insert.error.code === '23505') {
      const existing = await supabaseAdmin
        .from('shiprocket_shipments')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('shopify_order_id', shopifyOrderId)
        .single();
      if (existing.error || !existing.data) return { ok: false, error: 'Shipment lookup failed after duplicate insert' };
      // A shipment already exists and isn't in a failed state — this is the
      // idempotent no-op path, not an error.
      if (existing.data.status !== 'failed') return { ok: true, shipment: existing.data };
      shipmentRow = existing.data; // retry a previously failed attempt via UPDATE, never a second INSERT
    } else {
      return { ok: false, error: insert.error.message };
    }
  } else {
    shipmentRow = insert.data;
  }

  // ── Step 2: connection + token ──
  const { data: conn } = await supabaseAdmin.from('shiprocket_connections').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (!conn) return fail(shipmentRow.id, 'Shiprocket is not connected');
  if (!conn.default_pickup_location) return fail(shipmentRow.id, 'No pickup location configured — set one on the Connection tab');

  const token = await getValidShiprocketToken(tenantId);
  if (!token) return fail(shipmentRow.id, 'Could not authenticate with Shiprocket — check the Connection tab');

  // ── Step 3: address validation ──
  const address = order.shipping_address as Record<string, unknown> | null;
  const missing = REQUIRED_ADDRESS_FIELDS.filter((f) => !address?.[f]);
  if (!address || missing.length) {
    return fail(shipmentRow.id, `Incomplete shipping address (missing: ${missing.join(', ') || 'address'})`);
  }

  // ── Step 4: weight — join line items' variant_id against shopify_variants;
  //    Shopify's synced line_items strips the `grams` field, so this join is
  //    the only real weight source. Fall back to the tenant default per item
  //    when no variant match exists. ──
  const lineItems = (order.line_items || []) as Array<Record<string, unknown>>;
  const variantIds = lineItems.map((li) => li.variant_id).filter((v): v is number => typeof v === 'number');
  const { data: variants } = variantIds.length
    ? await supabaseAdmin.from('shopify_variants').select('shopify_id, weight, weight_unit').eq('tenant_id', tenantId).in('shopify_id', variantIds)
    : { data: [] as Array<{ shopify_id: number; weight: number | null; weight_unit: string | null }> };
  const variantByShopifyId = new Map((variants || []).map((v) => [v.shopify_id, v]));

  let totalWeightKg = 0;
  let estimatedItemCount = 0;
  const orderItems: CreateOrderLineItem[] = [];
  for (const li of lineItems) {
    const quantity = Number(li.quantity) || 1;
    const variant = typeof li.variant_id === 'number' ? variantByShopifyId.get(li.variant_id) : undefined;
    if (variant?.weight) {
      const unitKg = WEIGHT_UNIT_TO_KG[(variant.weight_unit || 'kg').toLowerCase()] ?? 1;
      totalWeightKg += variant.weight * unitKg * quantity;
    } else {
      totalWeightKg += Number(conn.default_item_weight_kg) * quantity;
      estimatedItemCount += quantity;
    }
    orderItems.push({
      name: String(li.title || 'Item'),
      sku: String(li.sku || li.variant_id || 'SKU'),
      units: quantity,
      selling_price: Number(li.price) || 0,
    });
  }
  if (totalWeightKg <= 0) totalWeightKg = Number(conn.default_item_weight_kg) || 0.5;

  // ── Step 5: payment method heuristic (no gateway field synced from Shopify) ──
  const paymentMethod: 'Prepaid' | 'COD' = order.financial_status === 'paid' ? 'Prepaid' : 'COD';

  // ── Step 6: create ──
  const client = shiprocketClientForTenant(token);
  try {
    const result = await client.createOrder({
      order_id: order.order_number || String(order.shopify_id),
      order_date: (order.shopify_created_at ? new Date(order.shopify_created_at) : new Date()).toISOString().slice(0, 16).replace('T', ' '),
      pickup_location: conn.default_pickup_location,
      billing_customer_name: extractCustomerName(order) || 'Customer',
      billing_address: String(address.address1 || ''),
      billing_city: String(address.city || ''),
      billing_pincode: String(address.zip || ''),
      billing_state: String(address.province || ''),
      billing_country: String(address.country || 'India'),
      billing_email: (order.email as string) || undefined,
      billing_phone: String(address.phone || order.phone || ''),
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: paymentMethod,
      sub_total: Number(order.subtotal_price) || 0,
      length: Number(conn.default_package_length_cm),
      breadth: Number(conn.default_package_breadth_cm),
      height: Number(conn.default_package_height_cm),
      weight: Number(totalWeightKg.toFixed(3)),
    });

    await supabaseAdmin
      .from('shiprocket_shipments')
      .update({
        status: 'created',
        shiprocket_order_id: result.order_id,
        shiprocket_shipment_id: result.shipment_id,
        payment_method: paymentMethod,
        last_error: estimatedItemCount > 0 ? `Estimated weight used for ${estimatedItemCount} item(s) with no synced weight` : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shipmentRow.id);

    // Shopify's 90-day snapshot purge (src/app/api/cron/shopify-sync/route.ts)
    // must not delete the order this shipment now points at.
    await supabaseAdmin.from('shopify_orders').update({ snapshot_expires_at: null }).eq('id', shopifyOrderId);

    // TODO(fast-follow): write fulfillment back to Shopify via the
    // FulfillmentOrder API — needs a write_fulfillments scope check on the
    // tenant's Custom App first. Deferred per plan §4 (cosmetic gap only;
    // doesn't block WhatsApp notification or AI tracking).

    const { data: updated } = await supabaseAdmin.from('shiprocket_shipments').select('*').eq('id', shipmentRow.id).single();
    return { ok: true, shipment: (updated as ShiprocketShipmentRow) || shipmentRow };
  } catch (err) {
    const message = err instanceof ShiprocketApiError ? err.message : (err as Error).message;
    return fail(shipmentRow.id, message);
  }
}

async function fail(shipmentId: string, message: string): Promise<ShipmentResult> {
  await supabaseAdmin
    .from('shiprocket_shipments')
    .update({ status: 'failed', last_error: message, updated_at: new Date().toISOString() })
    .eq('id', shipmentId);
  const { data } = await supabaseAdmin.from('shiprocket_shipments').select('*').eq('id', shipmentId).single();
  return { ok: false, error: message, shipment: (data as ShiprocketShipmentRow) || undefined };
}

function extractCustomerName(order: { shipping_address?: unknown }): string | null {
  const address = order.shipping_address as Record<string, unknown> | null;
  if (address?.name) return String(address.name);
  const first = address?.first_name as string | undefined;
  const last = address?.last_name as string | undefined;
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return null;
}

// ─── Per-shipment actions (post-creation lifecycle) ──────────
// Each loads the shipment row tenant-scoped first (defense in depth beyond
// RLS, matching the house convention in src/app/api/integrations/shopify/route.ts),
// then a valid token, then calls Shiprocket and persists the result.

async function loadShipment(tenantId: string, shipmentId: string): Promise<ShiprocketShipmentRow | null> {
  const { data } = await supabaseAdmin.from('shiprocket_shipments').select('*').eq('id', shipmentId).eq('tenant_id', tenantId).maybeSingle();
  return (data as ShiprocketShipmentRow) || null;
}

export async function getServiceabilityForShipment(tenantId: string, shipmentId: string): Promise<{ ok: boolean; couriers?: CourierOption[]; error?: string }> {
  const shipment = await loadShipment(tenantId, shipmentId);
  if (!shipment) return { ok: false, error: 'Shipment not found' };

  const [{ data: conn }, token] = await Promise.all([
    supabaseAdmin.from('shiprocket_connections').select('*').eq('tenant_id', tenantId).maybeSingle(),
    getValidShiprocketToken(tenantId),
  ]);
  if (!conn) return { ok: false, error: 'Shiprocket is not connected' };
  if (!token) return { ok: false, error: 'Could not authenticate with Shiprocket' };

  const { data: order } = await supabaseAdmin.from('shopify_orders').select('shipping_address').eq('id', shipment.shopify_order_id).maybeSingle();
  const deliveryPincode = String((order?.shipping_address as Record<string, unknown> | undefined)?.zip || '');

  try {
    const client = shiprocketClientForTenant(token);
    const couriers = await client.courierServiceability({
      pickup_postcode: '', // [UNVERIFIED] — Shiprocket resolves pickup pincode from the pickup_location on their side in most integrations; left blank rather than guessing a wrong value
      delivery_postcode: deliveryPincode,
      weight: 0.5,
      cod: shipment.payment_method === 'COD',
    });
    return { ok: true, couriers };
  } catch (err) {
    const message = err instanceof ShiprocketApiError ? err.message : (err as Error).message;
    return { ok: false, error: message };
  }
}

export async function assignAwbForShipment(tenantId: string, shipmentId: string, courierId?: number): Promise<ShipmentResult> {
  const shipment = await loadShipment(tenantId, shipmentId);
  if (!shipment) return { ok: false, error: 'Shipment not found' };
  if (!shipment.shiprocket_shipment_id) return { ok: false, error: 'Shipment has no Shiprocket shipment id yet' };

  const token = await getValidShiprocketToken(tenantId);
  if (!token) return fail(shipmentId, 'Could not authenticate with Shiprocket');

  try {
    const client = shiprocketClientForTenant(token);
    const result = await client.assignAwb(shipment.shiprocket_shipment_id, courierId);
    await supabaseAdmin.from('shiprocket_shipments').update({
      status: 'awb_assigned',
      awb_code: result.awb_code,
      courier_id: result.courier_company_id,
      courier_name: result.courier_name,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', shipmentId);
    return { ok: true, shipment: (await loadShipment(tenantId, shipmentId)) || undefined };
  } catch (err) {
    const message = err instanceof ShiprocketApiError ? err.message : (err as Error).message;
    return fail(shipmentId, message);
  }
}

export async function schedulePickupForShipment(tenantId: string, shipmentId: string): Promise<ShipmentResult> {
  const shipment = await loadShipment(tenantId, shipmentId);
  if (!shipment) return { ok: false, error: 'Shipment not found' };
  if (!shipment.shiprocket_shipment_id) return { ok: false, error: 'Shipment has no Shiprocket shipment id yet' };

  const token = await getValidShiprocketToken(tenantId);
  if (!token) return fail(shipmentId, 'Could not authenticate with Shiprocket');

  try {
    const client = shiprocketClientForTenant(token);
    const result = await client.generatePickup([shipment.shiprocket_shipment_id]);
    await supabaseAdmin.from('shiprocket_shipments').update({
      status: 'pickup_scheduled',
      pickup_scheduled_at: result.pickup_scheduled_date ? new Date(result.pickup_scheduled_date).toISOString() : new Date().toISOString(),
      pickup_token_number: result.pickup_token_number,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', shipmentId);
    return { ok: true, shipment: (await loadShipment(tenantId, shipmentId)) || undefined };
  } catch (err) {
    const message = err instanceof ShiprocketApiError ? err.message : (err as Error).message;
    return fail(shipmentId, message);
  }
}

export async function generateLabelForShipment(tenantId: string, shipmentId: string): Promise<ShipmentResult & { label_url?: string }> {
  const shipment = await loadShipment(tenantId, shipmentId);
  if (!shipment) return { ok: false, error: 'Shipment not found' };
  if (!shipment.shiprocket_shipment_id) return { ok: false, error: 'Shipment has no Shiprocket shipment id yet' };

  const token = await getValidShiprocketToken(tenantId);
  if (!token) return fail(shipmentId, 'Could not authenticate with Shiprocket');

  try {
    const client = shiprocketClientForTenant(token);
    const result = await client.generateLabel([shipment.shiprocket_shipment_id]);
    await supabaseAdmin.from('shiprocket_shipments').update({
      status: 'label_generated',
      label_url: result.label_url,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', shipmentId);
    const updated = await loadShipment(tenantId, shipmentId);
    return { ok: true, shipment: updated || undefined, label_url: result.label_url };
  } catch (err) {
    const message = err instanceof ShiprocketApiError ? err.message : (err as Error).message;
    return fail(shipmentId, message);
  }
}

/** Manual "refresh tracking" — live re-fetch + re-normalize, independent of the webhook path. */
export async function refreshTrackingForShipment(tenantId: string, shipmentId: string): Promise<ShipmentResult> {
  const shipment = await loadShipment(tenantId, shipmentId);
  if (!shipment) return { ok: false, error: 'Shipment not found' };
  if (!shipment.awb_code) return { ok: false, error: 'No AWB assigned yet' };

  const token = await getValidShiprocketToken(tenantId);
  if (!token) return { ok: false, error: 'Could not authenticate with Shiprocket' };

  try {
    const client = shiprocketClientForTenant(token);
    const tracking = await client.trackByAwb(shipment.awb_code);
    const nextStatus = normalizeShiprocketStatus(tracking.current_status) || shipment.status;

    await supabaseAdmin.from('shiprocket_shipments').update({
      status: nextStatus,
      status_raw: tracking.current_status,
      updated_at: new Date().toISOString(),
    }).eq('id', shipmentId);

    const latestActivity = tracking.shipment_track_activities?.[0];
    await supabaseAdmin.from('shiprocket_tracking_events').insert({
      tenant_id: tenantId,
      shipment_id: shipmentId,
      awb_code: shipment.awb_code,
      raw_status: tracking.current_status,
      normalized_status: nextStatus,
      status_location: latestActivity?.location || null,
      event_time: latestActivity?.date ? new Date(latestActivity.date).toISOString() : new Date().toISOString(),
      payload: tracking as unknown as Record<string, unknown>,
    });

    return { ok: true, shipment: (await loadShipment(tenantId, shipmentId)) || undefined };
  } catch (err) {
    const message = err instanceof ShiprocketApiError ? err.message : (err as Error).message;
    return { ok: false, error: message };
  }
}
