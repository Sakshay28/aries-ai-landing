// Customer-facing WhatsApp shipment-status notifications.
//
// businessNotify.ts's sendBusinessEvent() is staff/manager-facing only (its
// own header says so) — deliberately not used here. This is a separate,
// small, dedicated sender because customer notifications have a different
// shape: within the 24h session window a plain text message is enough;
// outside it, Meta requires an approved template, and only one
// (`shopify_shipping_update`, provisioned by the Shopify integration) exists
// today with slots that fit a "shipped" event. Every existing
// sendTemplateMessage() call site in the codebase only builds a body
// component — none construct the button component that template's tracking
// link actually needs, so that's built here for the first time.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptToken } from '@/lib/utils/crypto';
import { sendTextMessage, sendTemplateMessage } from '@/lib/meta/service';
import { getSessionState } from '@/lib/whatsapp/session';
import { notifyAdmin } from '@/lib/alerts/admin';
import { greetingName } from '@/lib/utils/contact-name';
import type { ShiprocketShipmentRow } from './shipments';
import type { ShipmentStatus } from './statusMap';

export async function sendShipmentStatusUpdate(tenantId: string, shipment: ShiprocketShipmentRow, newStatus: ShipmentStatus): Promise<void> {
  if (!shipment.customer_phone) return;

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('wa_access_token, wa_phone_number_id')
    .eq('id', tenantId)
    .maybeSingle();
  if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) return; // tenant has no WhatsApp configured

  const token = decryptToken(tenant.wa_access_token as string) as string | null;
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

  if (newStatus === 'in_transit') {
    const trackingUrl = shipment.awb_code ? `https://shiprocket.co/tracking/${shipment.awb_code}` : 'https://shiprocket.co/tracking';
    const components = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: greetingName(shipment.customer_name) },
          { type: 'text', text: shipment.shopify_order_number || '' },
          { type: 'text', text: shipment.awb_code || '' },
          { type: 'text', text: shipment.courier_name || '' },
        ],
      },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: trackingUrl }] },
    ];
    try {
      await sendTemplateMessage(token, phoneNumberId, shipment.customer_phone, 'shopify_shipping_update', components, 'en');
    } catch (err) {
      console.error('[shiprocket:notify] template send failed', (err as Error).message);
    }
    return;
  }

  // No approved template exists yet for out_for_delivery/delivered/rto/cancelled
  // outside the window. Surface it to the platform admin instead of letting
  // the notification silently vanish — new TemplateSpec entries + Meta
  // Business Manager approval (client-side, minutes-hours) are a fast-follow.
  await notifyAdmin({
    dedupeKey: `shiprocket-notify-skip:${tenantId}:${shipment.id}:${newStatus}`,
    subject: 'Shiprocket customer notification skipped — no approved template',
    summary: `Order ${shipment.shopify_order_number || shipment.id} moved to "${newStatus}" but the customer's WhatsApp window is closed and no approved template exists for this status yet.`,
    context: { tenant_id: tenantId, shipment_id: shipment.id, status: newStatus },
  }).catch(() => undefined);
}

function buildStatusLine(shipment: ShiprocketShipmentRow, status: ShipmentStatus): string {
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
