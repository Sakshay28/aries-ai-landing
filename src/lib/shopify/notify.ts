// Customer-facing "please confirm your order" WhatsApp request, sent the
// instant a Shopify order is created.
//
// This is a dedicated sender rather than a run through the generic
// automations engine (src/lib/automations/engine.ts) for the same reason
// src/lib/shiprocket/notify.ts is: the engine's window-closed template
// fallback only ever builds a single-variable body component — nothing in
// this codebase constructs the multi-variable BODY + 3 QUICK_REPLY BUTTON
// components this message needs. See src/lib/shopify/templates.ts for the
// approved-template spec (shopify_order_confirmation_action) this sends.
//
// Opt-in per tenant (tenants.shopify_order_confirmation_enabled) so no
// existing Shopify-connected tenant's behavior changes silently.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptTokenV2 } from '@/lib/security/keyManager';
import { sendTemplateMessage } from '@/lib/meta/service';
import { notifyAdmin } from '@/lib/alerts/admin';
import { resolveShopifyOrderVariables, type OrderLike } from './automationVariables';
import { ORDER_CONFIRMATION_TEMPLATE_NAME, ORDER_CONFIRMATION_PAYLOAD_PREFIX } from './templates';

type OrderConfirmationOrder = OrderLike & { id: number };

function formatAmount(total: string, currency: string): string {
  if (!total) return '';
  if (currency === 'INR') return `₹${total}`;
  return currency ? `${currency} ${total}` : total;
}

async function findOrCreateLead(
  tenantId: string,
  phone: string,
  email: string,
  rawName: string | null,
  shopifyCustomerId: number | null,
): Promise<string | null> {
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
  if (!phone) return null; // can't create a lead we can't message

  // rawName (not the greeting-wrapped display name) or null — never persist a
  // greeting placeholder like "there" into leads.name.
  const { data: created, error } = await supabaseAdmin.from('leads').insert({
    tenant_id: tenantId,
    name: rawName,
    phone,
    email: email || null,
    channel: 'shopify',
    source_detail: 'Shopify order confirmation',
    shopify_customer_id: shopifyCustomerId != null ? String(shopifyCustomerId) : null,
  }).select('id').single();

  if (error) {
    console.error('[shopify:notify] failed to create lead', error.message);
    return null;
  }
  return created?.id ?? null;
}

async function findOrCreateConversation(
  tenantId: string,
  phone: string,
  leadId: string | null,
  senderName: string | null,
): Promise<string | null> {
  const { data: existing } = await supabaseAdmin.from('conversations')
    .select('id, is_active')
    .eq('tenant_id', tenantId).eq('sender_id', phone).maybeSingle();

  if (existing) {
    if (!existing.is_active) {
      await supabaseAdmin.from('conversations')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await supabaseAdmin.from('conversations').insert({
    tenant_id: tenantId,
    lead_id: leadId,
    sender_id: phone,
    sender_name: senderName || phone,
    channel: 'whatsapp',
    is_active: true,
    created_at: new Date().toISOString(),
    last_message_at: new Date().toISOString(),
  }).select('id').single();

  if (error) {
    console.error('[shopify:notify] failed to create conversation', error.message);
    return null;
  }
  return created?.id ?? null;
}

export async function sendOrderConfirmationRequest(
  tenantId: string,
  order: OrderConfirmationOrder,
): Promise<{ sent: boolean; reason?: string }> {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('wa_access_token, wa_phone_number_id, shopify_order_confirmation_enabled, shopify_store_url')
    .eq('id', tenantId)
    .maybeSingle();

  if (!tenant?.shopify_order_confirmation_enabled) return { sent: false, reason: 'disabled' };
  if (!tenant.wa_access_token || !tenant.wa_phone_number_id) return { sent: false, reason: 'no_whatsapp_credentials' };

  // Atomic send-claim: guards against the Shopify sync queue retrying the
  // whole webhook-processing job (up to 6x) on any later failure in the same
  // dispatch — see src/lib/shopify/queue.ts ShopifyWorker.failJob. A second
  // concurrent/retried call sees confirmation_sent_at already set and no-ops.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('shopify_orders')
    .update({ confirmation_sent_at: new Date().toISOString(), confirmation_status: 'pending' })
    .eq('tenant_id', tenantId)
    .eq('shopify_id', order.id)
    .is('confirmation_sent_at', null)
    .select('id, lead_id')
    .single();

  if (claimError || !claimed) return { sent: false, reason: 'already_sent' };

  const accessToken = decryptTokenV2(tenant.wa_access_token);
  if (!accessToken) return { sent: false, reason: 'decrypt_failed' };

  const variables = resolveShopifyOrderVariables(order, tenant.shopify_store_url as string | null);
  const phone = variables.customer_phone;
  if (!phone) {
    console.warn(`[shopify:notify] order ${order.id} has no customer phone — cannot send confirmation request`);
    return { sent: false, reason: 'no_phone' };
  }

  const rawName = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') || null;
  const email = (order.customer?.email || order.email || '').trim() || '';

  let leadId = claimed.lead_id as string | null;
  if (!leadId) {
    leadId = await findOrCreateLead(tenantId, phone, email, rawName, order.customer?.id ?? null);
    if (leadId) {
      await supabaseAdmin.from('shopify_orders').update({ lead_id: leadId }).eq('id', claimed.id);
    }
  }
  const conversationId = await findOrCreateConversation(tenantId, phone, leadId, rawName);

  const components = [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: variables.customer_name },
        { type: 'text', text: variables.order_number || variables.order_id },
        { type: 'text', text: variables.product_name || 'your order' },
        { type: 'text', text: formatAmount(variables.order_total, variables.order_currency) },
        { type: 'text', text: variables.payment_method },
        { type: 'text', text: variables.shipping_city || '-' },
        { type: 'text', text: variables.shipping_state || '-' },
      ],
    },
    { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `${ORDER_CONFIRMATION_PAYLOAD_PREFIX.confirm}${order.id}` }] },
    { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `${ORDER_CONFIRMATION_PAYLOAD_PREFIX.cancel}${order.id}` }] },
    { type: 'button', sub_type: 'quick_reply', index: '2', parameters: [{ type: 'payload', payload: `${ORDER_CONFIRMATION_PAYLOAD_PREFIX.change}${order.id}` }] },
  ];

  try {
    const result = await sendTemplateMessage(accessToken, tenant.wa_phone_number_id as string, phone, ORDER_CONFIRMATION_TEMPLATE_NAME, components, 'en');

    if (conversationId) {
      await supabaseAdmin.from('messages').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'outbound',
        content: `Order confirmation requested for ${variables.order_number}: ${variables.product_name} — ${formatAmount(variables.order_total, variables.order_currency)} (${variables.payment_method}), delivering to ${variables.shipping_city}, ${variables.shipping_state}`,
        message_type: 'template',
        channel: 'whatsapp',
        sender_id: null,
        status: result.messageId ? 'sent' : 'failed',
        ai_generated: false,
        wa_message_id: result.messageId || null,
      });
    } else {
      console.warn(`[shopify:notify] order ${order.id} sent but no conversation to log it against`);
    }

    return { sent: true };
  } catch (err) {
    console.error('[shopify:notify] order confirmation send failed', (err as Error).message);
    await notifyAdmin({
      dedupeKey: `shopify-order-confirmation-failed:${tenantId}:${order.id}`,
      subject: 'Shopify order confirmation request failed to send',
      summary: `Order ${variables.order_number || order.id} could not be sent an order-confirmation WhatsApp message: ${(err as Error).message}`,
      context: { tenant_id: tenantId, shopify_order_id: order.id },
    }).catch(() => undefined);
    return { sent: false, reason: 'send_failed' };
  }
}
