// Customer-facing WhatsApp shipment-status notifications.
//
// businessNotify.ts's sendBusinessEvent() is staff/manager-facing only (its
// own header says so) — deliberately not used here. This is a separate,
// small, dedicated sender because customer notifications have a different
// shape: within the 24h session window a plain text message is enough;
// outside it, Meta requires an approved template — see TEMPLATE_BY_STATUS
// below for the shopify_* templates (provisioned by the Shopify integration,
// src/lib/shopify/templates.ts) covering in_transit/out_for_delivery/
// delivered/rto. "cancelled" and "ndr" have no approved template; outside the
// window they fall back to notifyAdmin().
//
// In-window wording is per-tenant overridable through the same JSONB column
// the order-confirmation replies use (tenants.shopify_order_confirmation_copy),
// under the keys in SHIPMENT_COPY_KEY below, with the same {{named}} placeholders.
//
// Every send is written to `messages` with its wamid so the inbox shows it and
// Meta's async delivery/failed status webhook can land on it — before this,
// shipment notifications never appeared anywhere and failures were invisible.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptTokenV2 } from '@/lib/security/keyManager';
import { sendTextMessage, sendTemplateMessage } from '@/lib/meta/service';
import { getSessionState } from '@/lib/whatsapp/session';
import { notifyAdmin } from '@/lib/alerts/admin';
import { greetingName } from '@/lib/utils/contact-name';
import type { ShiprocketShipmentRow } from './shipments';
import type { ShipmentStatus } from './statusMap';

/** A customer-facing shipment event. 'ndr' = a delivery attempt failed. */
export type ShipmentNotice = ShipmentStatus | 'ndr';

const TEMPLATE_BY_STATUS: Partial<Record<ShipmentNotice, string>> = {
  in_transit: 'shopify_shipping_update',
  out_for_delivery: 'shopify_out_for_delivery',
  delivered: 'shopify_delivered',
  rto: 'shopify_rto',
};

const SHIPMENT_COPY_KEY: Partial<Record<ShipmentNotice, string>> = {
  in_transit: 'shipped',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  ndr: 'ndr',
  rto: 'rto',
};

export function trackingUrl(awb: string | null): string {
  return awb ? `https://shiprocket.co/tracking/${awb}` : 'https://shiprocket.co/tracking';
}

export interface ShipmentNoticeContext {
  /** Order total, for the COD "keep cash ready" line. */
  amount?: string | null;
}

export async function sendShipmentStatusUpdate(
  tenantId: string,
  shipment: ShiprocketShipmentRow,
  notice: ShipmentNotice,
  ctx: ShipmentNoticeContext = {},
): Promise<void> {
  if (!shipment.customer_phone) return;

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('wa_access_token, wa_phone_number_id, shopify_order_confirmation_copy')
    .eq('id', tenantId)
    .maybeSingle();
  if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) return; // tenant has no WhatsApp configured

  const token = decryptTokenV2(tenant.wa_access_token as string);
  const phoneNumberId = tenant.wa_phone_number_id as string;
  if (!token) return;

  const session = await getSessionState(tenantId, shipment.customer_phone);
  const copyOverrides = (tenant.shopify_order_confirmation_copy as Record<string, string> | null) || null;

  if (session.windowOpen) {
    const text = renderShipmentNotice(copyOverrides, shipment, notice, ctx);
    try {
      const result = await sendTextMessage(token, phoneNumberId, shipment.customer_phone, text);
      await recordOutbound(tenantId, session.conversationId, text, 'text', result.messageId ?? null, null);
    } catch (err) {
      console.error('[shiprocket:notify] plain send failed', (err as Error).message);
      await recordOutbound(tenantId, session.conversationId, text, 'text', null, (err as Error).message);
    }
    return;
  }

  const templateName = TEMPLATE_BY_STATUS[notice];
  if (templateName) {
    const components: Array<Record<string, unknown>> = [
      { type: 'body', parameters: buildTemplateBodyParams(shipment, notice) },
    ];
    if (notice === 'in_transit') {
      // The approved button URL is https://shiprocket.co/tracking/{{1}} — pass
      // only the AWB suffix, or Meta renders a doubled prefix.
      components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: shipment.awb_code || '' }] });
    }
    const summary = `${templateName}: ${buildStatusLine(shipment, notice)}`;
    try {
      const result = await sendTemplateMessage(token, phoneNumberId, shipment.customer_phone, templateName, components, 'en');
      await recordOutbound(tenantId, session.conversationId, summary, 'template', result.messageId ?? null, null);
    } catch (err) {
      console.error('[shiprocket:notify] template send failed', (err as Error).message);
      await recordOutbound(tenantId, session.conversationId, summary, 'template', null, (err as Error).message);
    }
    return;
  }

  // No approved template for "cancelled"/"ndr" outside the window. Surface it
  // to the platform admin instead of letting the notification silently vanish.
  await notifyAdmin({
    dedupeKey: `shiprocket-notify-skip:${tenantId}:${shipment.id}:${notice}`,
    subject: 'Shiprocket customer notification skipped — no approved template',
    summary: `Order ${shipment.shopify_order_number || shipment.id} moved to "${notice}" but the customer's WhatsApp window is closed and no approved template exists for this status yet.`,
    context: { tenant_id: tenantId, shipment_id: shipment.id, status: notice },
  }).catch(() => undefined);
}

async function recordOutbound(
  tenantId: string,
  conversationId: string | null,
  content: string,
  messageType: 'text' | 'template',
  wamid: string | null,
  error: string | null,
): Promise<void> {
  if (!conversationId) return;
  const { error: dbErr } = await supabaseAdmin.from('messages').insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    direction: 'outbound',
    content,
    message_type: messageType,
    channel: 'whatsapp',
    status: wamid ? 'sent' : 'failed',
    error_message: error ? error.slice(0, 500) : null,
    ai_generated: false,
    wa_message_id: wamid,
  });
  if (dbErr) console.error('[shiprocket:notify] message log insert failed', dbErr.message);
}

/** Body params for the shopify_shipping_update / shopify_out_for_delivery / shopify_delivered / shopify_rto templates. */
function buildTemplateBodyParams(shipment: ShiprocketShipmentRow, notice: ShipmentNotice): Array<{ type: 'text'; text: string }> {
  const name = { type: 'text' as const, text: greetingName(shipment.customer_name) };
  const order = { type: 'text' as const, text: shipment.shopify_order_number || '' };
  if (notice === 'in_transit') {
    return [name, order, { type: 'text', text: shipment.awb_code || '-' }, { type: 'text', text: shipment.courier_name || '-' }];
  }
  return [name, order];
}

/**
 * The in-window text for a notice: the tenant's override when set, otherwise
 * the platform default line. Placeholders: {{customer_name}} {{order_id}}
 * {{courier}} {{awb}} {{tracking_url}} {{amount}}, plus {{cod_line}} which
 * renders " and keep ₹<amount> ready (Cash on Delivery)" for COD orders only.
 */
export function renderShipmentNotice(
  overrides: Record<string, string> | null,
  shipment: ShiprocketShipmentRow,
  notice: ShipmentNotice,
  ctx: ShipmentNoticeContext = {},
): string {
  const key = SHIPMENT_COPY_KEY[notice];
  const override = key ? overrides?.[key] : undefined;
  if (!override || !override.trim()) return buildStatusLine(shipment, notice);

  const amount = ctx.amount ? String(ctx.amount) : '';
  const codLine = shipment.payment_method === 'COD' && amount ? ` and keep ₹${amount} ready (Cash on Delivery)` : '';
  return override
    .replace(/\{\{\s*customer_name\s*\}\}/g, greetingName(shipment.customer_name))
    .replace(/\{\{\s*order_id\s*\}\}/g, shipment.shopify_order_number || '')
    .replace(/\{\{\s*courier\s*\}\}/g, shipment.courier_name || 'our courier partner')
    .replace(/\{\{\s*awb\s*\}\}/g, shipment.awb_code || '-')
    .replace(/\{\{\s*tracking_url\s*\}\}/g, trackingUrl(shipment.awb_code))
    .replace(/\{\{\s*amount\s*\}\}/g, amount)
    .replace(/\{\{\s*cod_line\s*\}\}/g, codLine);
}

export function buildStatusLine(shipment: ShiprocketShipmentRow, status: ShipmentNotice): string {
  const order = shipment.shopify_order_number || '';
  switch (status) {
    case 'in_transit':
      return `📦 Your order ${order} has shipped${shipment.courier_name ? ` via ${shipment.courier_name}` : ''}${shipment.awb_code ? ` (AWB ${shipment.awb_code})` : ''}.`;
    case 'out_for_delivery':
      return `🚚 Your order ${order} is out for delivery today.`;
    case 'delivered':
      return `✅ Your order ${order} has been delivered. Thank you for shopping with us!`;
    case 'ndr':
      return `Our delivery partner couldn't deliver your order ${order} today. Please reply with a convenient time or any address correction and we'll arrange another attempt.`;
    case 'rto':
      return `↩️ Your order ${order} is being returned to the seller.`;
    case 'cancelled':
      return `Your shipment for order ${order} has been cancelled.`;
    default:
      return `Update on your order ${order}.`;
  }
}
