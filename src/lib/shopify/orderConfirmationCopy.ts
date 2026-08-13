// Free-form (non-template) reply copy for the order-confirmation flow.
//
// Unlike the initial order-confirmation message (src/lib/shopify/notify.ts),
// these 5 replies are all sent inside the WhatsApp session window that the
// customer's own message/button-tap just reopened — sendTextMessage, not an
// approved Meta template. That means no Meta approval cycle and no Meta
// positional {{n}} placeholders: tenants can override the wording directly
// with simple named placeholders, substituted here.

export type OrderConfirmationCopyKey =
  | 'confirm'
  | 'cancel'
  | 'change_request'
  | 'change_received'
  | 'change_reminder';

const DEFAULT_COPY: Record<OrderConfirmationCopyKey, string> = {
  confirm: '✅ Thank you! Your order {{order_id}} has been confirmed and is being processed. 🙏',
  cancel: `We've received your cancellation request for order {{order_id}}. Our team will follow up shortly.`,
  change_request: `No problem! Please reply here with the corrected details (name/address/phone) and our team will update order {{order_id}} for you.`,
  change_received: `Thank you! We've received your updated details for order {{order_id}} and will update it accordingly. 🙏`,
  change_reminder: `Hi {{customer_name}}, your order {{order_id}} is still waiting for your updated details. Please share them so we can proceed with your order. 🙏`,
};

export interface OrderConfirmationCopyVars {
  customer_name: string;
  order_id: string;
}

function substitute(template: string, vars: OrderConfirmationCopyVars): string {
  return template
    .replace(/\{\{\s*customer_name\s*\}\}/g, vars.customer_name)
    .replace(/\{\{\s*order_id\s*\}\}/g, vars.order_id);
}

/**
 * Resolve one of the 5 order-confirmation replies for a tenant, preferring
 * their JSONB override (tenants.shopify_order_confirmation_copy) and falling
 * back to the platform default when unset or blank.
 */
export function renderOrderConfirmationCopy(
  tenant: { shopify_order_confirmation_copy?: Record<string, string> | null },
  key: OrderConfirmationCopyKey,
  vars: OrderConfirmationCopyVars,
): string {
  const override = tenant.shopify_order_confirmation_copy?.[key];
  const template = (override && override.trim()) || DEFAULT_COPY[key];
  return substitute(template, vars);
}
