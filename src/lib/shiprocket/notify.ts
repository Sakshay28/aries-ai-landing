// Customer-facing WhatsApp shipment-status notifications.
//
// businessNotify.ts's sendBusinessEvent() is staff/manager-facing only (its
// own header says so) — deliberately not used here. This is a separate,
// small, dedicated sender because customer notifications have a different
// shape: within the 24h session window a plain text message is enough;
// outside it, Meta requires an approved template — see TEMPLATE_BY_STATUS
// below for the shopify_* templates (provisioned by the Shopify integration,
// src/lib/shopify/templates.ts) covering in_transit/out_for_delivery/
// delivered/rto. "cancelled" still has no approved template; it stays on the
// notifyAdmin() fallback.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptTokenV2 } from '@/lib/security/keyManager';
import { sendTextMessage, sendTemplateMessage } from '@/lib/meta/service';
import { getSessionState } from '@/lib/whatsapp/session';
import { notifyAdmin } from '@/lib/alerts/admin';
import { greetingName } from '@/lib/utils/contact-name';
import type { ShiprocketShipmentRow } from './shipments';
import type { ShipmentStatus } from './statusMap';

const TEMPLATE_BY_STATUS: Partial<Record<ShipmentStatus, string>> = {
  in_transit: 'shopify_shipping_update',
  out_for_delivery: 'shopify_out_for_delivery',
  delivered: 'shopify_delivered',
  rto: 'shopify_rto',
};

export async function sendShipmentStatusUpdate(tenantId: string, shipment: ShiprocketShipmentRow, newStatus: ShipmentStatus): Promise<void> {
  if (!shipment.customer_phone) return;

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('wa_access_token, wa_phone_number_id')
    .eq('id', tenantId)
    .maybeSingle();
  if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) return; // tenant has no WhatsApp configured

  const token = decryptTokenV2(tenant.wa_access_token as string);
  const phoneNumberId = tenant.wa_phone_number_id as string;
  if (!token) return;

  const session = await getSessionState(tenantId, shipment.customer_phone);

  if (session.windowOpen) {
    try {
      await sendTextMessage(token, phoneNumberId, shipment.customer_phone, buildStatusLine(shipment, newStatus));
    } catch (err) {
      console.error('[shiprocket:notify] plain send failed', (err as Error).message);
    }
    return;
  }

  const templateName = TEMPLATE_BY_STATUS[newStatus];
  if (templateName) {
    const components: Array<Record<string, unknown>> = [
      { type: 'body', parameters: buildTemplateBodyParams(shipment, newStatus) },
    ];
    if (newStatus === 'in_transit') {
      const trackingUrl = shipment.awb_code ? `https://shiprocket.co/tracking/${shipment.awb_code}` : 'https://shiprocket.co/tracking';
      components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: trackingUrl }] });
    }
    try {
      await sendTemplateMessage(token, phoneNumberId, shipment.customer_phone, templateName, components, 'en');
    } catch (err) {
      console.error('[shiprocket:notify] template send failed', (err as Error).message);
    }
    return;
  }

  // No approved template exists yet for "cancelled" outside the window.
  // Surface it to the platform admin instead of letting the notification
  // silently vanish — a new TemplateSpec entry + Meta Business Manager
  // approval (client-side, minutes-hours) are a fast-follow.
  await notifyAdmin({
    dedupeKey: `shiprocket-notify-skip:${tenantId}:${shipment.id}:${newStatus}`,
    subject: 'Shiprocket customer notification skipped — no approved template',
    summary: `Order ${shipment.shopify_order_number || shipment.id} moved to "${newStatus}" but the customer's WhatsApp window is closed and no approved template exists for this status yet.`,
    context: { tenant_id: tenantId, shipment_id: shipment.id, status: newStatus },
  }).catch(() => undefined);
}

/** Body params for the shopify_shipping_update / shopify_out_for_delivery / shopify_delivered / shopify_rto templates. */
function buildTemplateBodyParams(shipment: ShiprocketShipmentRow, status: ShipmentStatus): Array<{ type: 'text'; text: string }> {
  const name = { type: 'text' as const, text: greetingName(shipment.customer_name) };
  const order = { type: 'text' as const, text: shipment.shopify_order_number || '' };
  if (status === 'in_transit') {
    return [name, order, { type: 'text', text: shipment.awb_code || '' }, { type: 'text', text: shipment.courier_name || '' }];
  }
  return [name, order];
}

export function buildStatusLine(shipment: ShiprocketShipmentRow, status: ShipmentStatus): string {
  const order = shipment.shopify_order_number || '';
  switch (status) {
    case 'in_transit':
      return `📦 Your order ${order} has shipped${shipment.courier_name ? ` via ${shipment.courier_name}` : ''}${shipment.awb_code ? ` (AWB ${shipment.awb_code})` : ''}.`;
    case 'out_for_delivery':
      return `🚚 Your order ${order} is out for delivery today.`;
    case 'delivered':
      return `✅ Your order ${order} has been delivered. Thank you for shopping with us!`;
    case 'rto':
      return `↩️ Your order ${order} is being returned to the seller.`;
    case 'cancelled':
      return `Your shipment for order ${order} has been cancelled.`;
    default:
      return `Update on your order ${order}.`;
  }
}
