// ═══════════════════════════════════════════════════════════
// Provision WhatsApp templates for the Shopify integration
// ═══════════════════════════════════════════════════════════
// Meta requires PRE-APPROVED templates for any message sent outside
// the 24h customer service window. Ecom flows (order confirmation,
// shipping update, cart recovery, review request) fire days after
// the customer's last message, so they MUST go through templates.
//
// This module submits four canned utility/marketing templates to
// Meta on behalf of the tenant during the Shopify connect flow. It's
// idempotent: templates that already exist under the same name are
// left alone. Approval is Meta-side and asynchronous (minutes to
// hours). Rejections are surfaced to the admin UI via the existing
// message_templates cache.
//
// Categories: WhatsApp requires exact category classification. Order
// confirmation, shipping, and cancellation are UTILITY (post-purchase
// notifications). Cart recovery and review request are MARKETING.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { decryptTokenV2 } from '@/lib/security/keyManager';

export interface TemplateSpec {
  name: string;
  category: 'UTILITY' | 'MARKETING';
  language: string; // e.g. 'en', 'en_US', 'hi'
  body: string;    // Contains {{1}}, {{2}}, ... placeholders in Meta's format
  bodyExample: string[]; // Sample values for approval
  footer?: string;
  buttons?: Array<
    | { type: 'URL'; text: string; url: string; example?: string[] }
    | { type: 'PHONE_NUMBER'; text: string; phone_number: string }
    | { type: 'QUICK_REPLY'; text: string }
  >;
}

/**
 * The four canned Shopify templates. Body text is Meta-flavoured with
 * numeric placeholders. When automations render them, we substitute in
 * the same order using the shopify automation variables.
 */
export function shopifyTemplateSpecs(): TemplateSpec[] {
  return [
    {
      name: 'shopify_order_confirmation',
      category: 'UTILITY',
      language: 'en',
      body: 'Hi {{1}}! Thanks for your order {{2}} from {{3}}. Total: {{4}}. We\'ll notify you when it ships. 🛍️',
      bodyExample: ['Aarav', '#1042', 'AcmeStore', 'INR 2499'],
      buttons: [
        { type: 'QUICK_REPLY', text: 'Track my order' },
        { type: 'QUICK_REPLY', text: 'Contact support' },
      ],
    },
    {
      name: 'shopify_shipping_update',
      category: 'UTILITY',
      language: 'en',
      body: 'Hi {{1}}! Your order {{2}} has shipped 🚚 Tracking: {{3}} (via {{4}}). Follow along here: {{5}}',
      bodyExample: ['Aarav', '#1042', 'AWB123456', 'BlueDart', 'https://bluedart.com/track/AWB123456'],
      buttons: [
        { type: 'URL', text: 'Track shipment', url: '{{1}}', example: ['https://bluedart.com/track/AWB123456'] },
      ],
    },
    {
      name: 'shopify_order_cancelled',
      category: 'UTILITY',
      language: 'en',
      body: 'Hi {{1}}, your order {{2}} has been cancelled. If this wasn\'t you, or you need help, just reply to this message and our team will jump in.',
      bodyExample: ['Aarav', '#1042'],
      buttons: [
        { type: 'QUICK_REPLY', text: 'Contact support' },
      ],
    },
    {
      name: 'shopify_cart_recovery',
      category: 'MARKETING',
      language: 'en',
      body: 'Hi {{1}} 👋 You left some items in your cart at {{2}}. Complete your order here: {{3}} — we saved it for you!',
      bodyExample: ['Aarav', 'AcmeStore', 'https://acme.com/checkouts/abc123'],
      buttons: [
        { type: 'URL', text: 'Resume checkout', url: '{{1}}', example: ['https://acme.com/checkouts/abc123'] },
      ],
    },
    {
      name: 'shopify_review_request',
      category: 'MARKETING',
      language: 'en',
      body: 'Hey {{1}}! Hope you\'re loving your order from {{2}} 💛 Mind sharing a quick review? It really helps us: {{3}}',
      bodyExample: ['Aarav', 'AcmeStore', 'https://acme.com/reviews'],
      buttons: [
        { type: 'URL', text: 'Leave a review', url: '{{1}}', example: ['https://acme.com/reviews'] },
      ],
    },
  ];
}

export interface ProvisionResult {
  created: string[];
  skipped_existing: string[];
  failed: Array<{ name: string; error: string }>;
}

interface MetaTemplateComponent {
  type: 'BODY' | 'HEADER' | 'FOOTER' | 'BUTTONS';
  text?: string;
  example?: { body_text?: string[][]; header_text?: string[]; header_handle?: string[] };
  buttons?: Array<Record<string, unknown>>;
}

function componentsFor(spec: TemplateSpec): MetaTemplateComponent[] {
  const components: MetaTemplateComponent[] = [
    {
      type: 'BODY',
      text: spec.body,
      example: { body_text: [spec.bodyExample] },
    },
  ];
  if (spec.footer) components.push({ type: 'FOOTER', text: spec.footer });
  if (spec.buttons?.length) {
    const buttons: Array<Record<string, unknown>> = spec.buttons.map(b => {
      if (b.type === 'URL') {
        const button: Record<string, unknown> = { type: 'URL', text: b.text, url: b.url };
        if (b.example) button.example = b.example;
        return button;
      }
      if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
      return { type: 'QUICK_REPLY', text: b.text };
    });
    components.push({ type: 'BUTTONS', buttons });
  }
  return components;
}

/**
 * Provision all canned Shopify templates for a tenant. Safe to re-run —
 * templates already registered under the same name are skipped rather
 * than erroring.
 */
export async function provisionShopifyTemplates(tenantId: string): Promise<ProvisionResult> {
  const result: ProvisionResult = { created: [], skipped_existing: [], failed: [] };

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('wa_access_token, wa_business_account_id')
    .eq('id', tenantId)
    .single();

  if (!tenant?.wa_access_token || !tenant?.wa_business_account_id) {
    for (const s of shopifyTemplateSpecs()) {
      result.failed.push({ name: s.name, error: 'tenant has no WhatsApp credentials — skip' });
    }
    return result;
  }

  const accessToken = decryptTokenV2(tenant.wa_access_token);
  if (!accessToken) {
    for (const s of shopifyTemplateSpecs()) {
      result.failed.push({ name: s.name, error: 'failed to decrypt WhatsApp access token' });
    }
    return result;
  }
  const wabaId = tenant.wa_business_account_id as string;

  for (const spec of shopifyTemplateSpecs()) {
    try {
      const body = {
        name: spec.name,
        category: spec.category,
        language: spec.language,
        components: componentsFor(spec),
      };
      const res = await fetch(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.status === 200 || res.status === 201) {
        result.created.push(spec.name);
        continue;
      }

      const errBody = await res.json().catch(() => ({}));
      const code = errBody?.error?.code;
      const subcode = errBody?.error?.error_subcode;
      const msg = errBody?.error?.message || `HTTP ${res.status}`;

      // 100 / 2388023 → template with that name already exists. Idempotent skip.
      if (code === 100 || subcode === 2388023 || /already exists|duplicate/i.test(msg)) {
        result.skipped_existing.push(spec.name);
        continue;
      }

      result.failed.push({ name: spec.name, error: msg });
    } catch (err) {
      result.failed.push({ name: spec.name, error: (err as Error).message });
    }
  }

  return result;
}
