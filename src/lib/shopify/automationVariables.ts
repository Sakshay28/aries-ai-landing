// Resolve Shopify webhook payloads → automation variables map used by
// message templates. The keys here are what merchants will reference in
// the "message_text" body ({{customer_name}}, {{order_number}}, ...).
//
// Keep this dumb and self-contained: pick out what's likely to be useful
// and stringify safely. The automation engine already handles undefined
// keys (renders as blank).

import { normalizePhoneNumber } from '@/lib/whatsapp/phone';
import { greetingName, greetingFirstName } from '@/lib/utils/contact-name';

interface Money { amount?: string | number; currency_code?: string }
interface Address { first_name?: string; last_name?: string; address1?: string; address2?: string; city?: string; province?: string; country?: string; zip?: string; phone?: string }
interface Fulfillment { tracking_number?: string; tracking_url?: string; tracking_company?: string; shipment_status?: string; status?: string }

interface OrderLike {
  id?: number;
  name?: string;
  order_number?: number | string;
  email?: string | null;
  phone?: string | null;
  currency?: string;
  total_price?: string | number;
  subtotal_price?: string | number;
  total_tax?: string | number;
  financial_status?: string;
  fulfillment_status?: string | null;
  cancel_reason?: string | null;
  created_at?: string;
  processed_at?: string;
  cancelled_at?: string;
  line_items?: Array<{ title?: string; quantity?: number; price?: string | number; variant_title?: string | null; sku?: string }>;
  customer?: { id?: number; email?: string | null; phone?: string | null; first_name?: string; last_name?: string };
  shipping_address?: Address;
  billing_address?: Address;
  fulfillments?: Fulfillment[];
  current_total_price_set?: { shop_money?: Money };
}

interface CheckoutLike {
  id?: number;
  token?: string;
  abandoned_checkout_url?: string;
  email?: string | null;
  phone?: string | null;
  currency?: string;
  total_price?: string | number;
  subtotal_price?: string | number;
  created_at?: string;
  updated_at?: string;
  line_items?: Array<{ title?: string; quantity?: number; price?: string | number }>;
  shipping_address?: Address;
  billing_address?: Address;
  customer?: { email?: string | null; phone?: string | null; first_name?: string; last_name?: string };
}

function fullName(first?: string, last?: string): string {
  return [first, last].filter(Boolean).join(' ');
}

function shortItemList(items?: Array<{ title?: string; quantity?: number }>, max = 5): string {
  if (!items || items.length === 0) return '';
  const list = items.slice(0, max).map(i => `${i.quantity || 1}× ${i.title || 'Item'}`).join(', ');
  return items.length > max ? `${list} + ${items.length - max} more` : list;
}

function firstTracking(order: OrderLike): Fulfillment | null {
  const f = order.fulfillments?.find(x => x.tracking_url || x.tracking_number);
  return f || (order.fulfillments?.[0] ?? null);
}

/** Resolve variables for order-shaped topics (created, paid, fulfilled, cancelled). */
export function resolveShopifyOrderVariables(order: OrderLike, storeUrl: string | null): Record<string, string> {
  const customerName = fullName(order.customer?.first_name, order.customer?.last_name);
  const rawPhone = order.customer?.phone || order.phone || order.shipping_address?.phone || '';
  const customerPhone = rawPhone ? normalizePhoneNumber(rawPhone) : '';
  const email = (order.customer?.email || order.email || '').trim();
  const tracking = firstTracking(order);
  const orderNum = order.name || (order.order_number != null ? `#${order.order_number}` : '');
  const total = order.total_price != null ? String(order.total_price) : '';
  const currency = order.currency || '';
  const shippingCity = order.shipping_address?.city || '';
  const shippingZip = order.shipping_address?.zip || '';
  const shippingCountry = order.shipping_address?.country || '';
  const orderUrl = order.id && storeUrl ? `https://${storeUrl}/admin/orders/${order.id}` : '';

  return {
    // Customer
    customer_name:      greetingName(customerName || null),
    first_name:         greetingFirstName(order.customer?.first_name || customerName || null),
    customer_phone:     customerPhone,
    customer_email:     email,

    // Order
    order_number:       orderNum,
    order_id:           order.id != null ? String(order.id) : '',
    order_total:        total,
    order_currency:     currency,
    order_status:       order.financial_status || '',
    fulfillment_status: order.fulfillment_status || 'unfulfilled',
    order_items:        shortItemList(order.line_items),
    order_line_count:   String(order.line_items?.length || 0),
    order_url:          orderUrl,
    cancel_reason:      order.cancel_reason || '',
    ordered_at:         order.processed_at || order.created_at || '',
    cancelled_at:       order.cancelled_at || '',

    // Shipping
    tracking_number:    tracking?.tracking_number || '',
    tracking_url:       tracking?.tracking_url || '',
    tracking_company:   tracking?.tracking_company || '',
    shipment_status:    tracking?.shipment_status || tracking?.status || '',
    shipping_city:      shippingCity,
    shipping_zip:       shippingZip,
    shipping_country:   shippingCountry,

    // Store
    store_url:          storeUrl ? `https://${storeUrl}` : '',
  };
}

/** Resolve variables for checkout-shaped topics (abandoned). */
export function resolveShopifyCheckoutVariables(checkout: CheckoutLike, storeUrl: string | null): Record<string, string> {
  const customerName = fullName(checkout.customer?.first_name, checkout.customer?.last_name);
  const rawPhone = checkout.customer?.phone || checkout.phone || checkout.shipping_address?.phone || '';
  const customerPhone = rawPhone ? normalizePhoneNumber(rawPhone) : '';
  const email = (checkout.customer?.email || checkout.email || '').trim();
  const total = checkout.total_price != null ? String(checkout.total_price) : '';
  const currency = checkout.currency || '';

  return {
    customer_name:    greetingName(customerName || null),
    first_name:       greetingFirstName(checkout.customer?.first_name || customerName || null),
    customer_phone:   customerPhone,
    customer_email:   email,

    cart_total:       total,
    cart_currency:    currency,
    cart_items:       shortItemList(checkout.line_items),
    cart_line_count:  String(checkout.line_items?.length || 0),
    checkout_url:     checkout.abandoned_checkout_url || '',
    abandoned_at:     checkout.updated_at || checkout.created_at || '',

    store_url:        storeUrl ? `https://${storeUrl}` : '',
  };
}

/** Extract the customer identifiers we'll use to resolve a lead. */
export function extractCustomerIdentifiers(payload: { customer?: { phone?: string | null; email?: string | null; id?: number }; phone?: string | null; email?: string | null; shipping_address?: Address }): {
  phone: string | null;
  email: string | null;
  shopify_customer_id: number | null;
} {
  const rawPhone = payload.customer?.phone || payload.phone || payload.shipping_address?.phone || null;
  const phone = rawPhone ? normalizePhoneNumber(rawPhone) : null;
  const email = (payload.customer?.email || payload.email || '').trim().toLowerCase() || null;
  return { phone, email, shopify_customer_id: payload.customer?.id ?? null };
}
