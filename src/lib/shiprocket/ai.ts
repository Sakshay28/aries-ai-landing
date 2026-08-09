// Read-only shipment lookup for the AI assistant ("where's my order?").
// Mirrors src/lib/shopify/ai.ts's getOrderStatus() resolution order
// (order number → phone → email), tenant-scoped on every query.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { normalizePhoneNumber } from '@/lib/whatsapp/phone';

export interface ShipmentTracking {
  order_number: string | null;
  status: string;
  status_raw: string | null;
  courier_name: string | null;
  awb_code: string | null;
  tracking_url: string | null;
  last_event: { status: string | null; location: string | null; event_time: string | null } | null;
}

/**
 * Returns the Shiprocket shipment for a customer's order, or null if no
 * shipment exists yet for that order (or the order can't be resolved) — the
 * caller should fall back to Shopify's own fulfillment-status context in
 * that case, since Shiprocket doesn't own every order.
 */
export async function getShipmentTracking(
  tenantId: string,
  args: { order_number?: string; phone?: string; email?: string }
): Promise<ShipmentTracking | null> {
  let shopifyOrderId: string | null = null;

  if (args.order_number) {
    const normalised = args.order_number.startsWith('#') ? args.order_number : `#${args.order_number}`;
    const { data } = await supabaseAdmin.from('shopify_orders').select('id').eq('tenant_id', tenantId).eq('order_number', normalised).maybeSingle();
    shopifyOrderId = data?.id || null;
  }

  if (!shopifyOrderId) {
    const phone = args.phone ? normalizePhoneNumber(args.phone) : null;
    const email = args.email ? args.email.toLowerCase() : null;
    if (phone || email) {
      let q = supabaseAdmin.from('shopify_orders').select('id').eq('tenant_id', tenantId).order('shopify_created_at', { ascending: false }).limit(1);
      if (phone) q = q.eq('phone', phone);
      else if (email) q = q.ilike('email', email);
      const { data } = await q.maybeSingle();
      shopifyOrderId = data?.id || null;
    }
  }

  if (!shopifyOrderId) return null;

  const { data: shipment } = await supabaseAdmin.from('shiprocket_shipments').select('*').eq('tenant_id', tenantId).eq('shopify_order_id', shopifyOrderId).maybeSingle();
  if (!shipment) return null;

  const { data: lastEvent } = await supabaseAdmin
    .from('shiprocket_tracking_events')
    .select('normalized_status, status_location, event_time')
    .eq('shipment_id', shipment.id)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    order_number: shipment.shopify_order_number,
    status: shipment.status,
    status_raw: shipment.status_raw,
    courier_name: shipment.courier_name,
    awb_code: shipment.awb_code,
    tracking_url: shipment.awb_code ? `https://shiprocket.co/tracking/${shipment.awb_code}` : null,
    last_event: lastEvent
      ? { status: lastEvent.normalized_status, location: lastEvent.status_location, event_time: lastEvent.event_time }
      : null,
  };
}
