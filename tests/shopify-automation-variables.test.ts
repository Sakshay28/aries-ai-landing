import { describe, it, expect } from 'vitest';
import {
  resolveShopifyOrderVariables,
  resolveShopifyCheckoutVariables,
  extractCustomerIdentifiers,
} from '@/lib/shopify/automationVariables';

describe('resolveShopifyOrderVariables', () => {
  const order = {
    id: 5001,
    name: '#1042',
    email: 'aarav@example.com',
    currency: 'INR',
    total_price: '2499.00',
    financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [
      { title: 'Silver Ring', quantity: 1, price: '1999.00' },
      { title: 'Gift Wrap', quantity: 1, price: '500.00' },
    ],
    customer: { id: 900, first_name: 'Aarav', last_name: 'Kumar', phone: '+919999999999' },
    shipping_address: { city: 'Mumbai', zip: '400001', country: 'India' },
    fulfillments: [
      { tracking_number: 'BD123', tracking_url: 'https://bluedart.com/BD123', tracking_company: 'BlueDart', shipment_status: 'in_transit' },
    ],
    created_at: '2026-08-01T10:00:00Z',
  };

  it('flattens order data into template variables', () => {
    const v = resolveShopifyOrderVariables(order as never, 'acme.myshopify.com');
    expect(v.customer_name).toBe('Aarav Kumar');
    expect(v.first_name).toBe('Aarav');
    expect(v.order_number).toBe('#1042');
    expect(v.order_total).toBe('2499.00');
    expect(v.order_currency).toBe('INR');
    expect(v.fulfillment_status).toBe('fulfilled');
    expect(v.order_items).toContain('1× Silver Ring');
    expect(v.tracking_number).toBe('BD123');
    expect(v.tracking_url).toBe('https://bluedart.com/BD123');
    expect(v.store_url).toBe('https://acme.myshopify.com');
    expect(v.order_url).toBe('https://acme.myshopify.com/admin/orders/5001');
  });

  it('falls back gracefully when name / phone are missing', () => {
    const v = resolveShopifyOrderVariables({} as never, null);
    expect(v.customer_name).toBe('there');
    expect(v.first_name).toBe('there');
    expect(v.tracking_url).toBe('');
    expect(v.store_url).toBe('');
  });

  it('generates order_number as # + order_number when name absent', () => {
    const v = resolveShopifyOrderVariables({ order_number: 42 } as never, null);
    expect(v.order_number).toBe('#42');
  });

  it('truncates long line-item lists with a "+ N more" suffix', () => {
    const many = { line_items: Array.from({ length: 7 }, (_, i) => ({ title: `Item${i}`, quantity: 1 })) };
    const v = resolveShopifyOrderVariables(many as never, null);
    expect(v.order_items).toMatch(/\+ 2 more$/);
  });

  // ── product_name / payment_method / shipping_state (order-confirmation flow) ──
  it('derives product_name as first item title, "& N more" appended for multi-item orders', () => {
    expect(resolveShopifyOrderVariables(order as never, null).product_name).toBe('Silver Ring & 1 more');
    expect(resolveShopifyOrderVariables({ line_items: [{ title: 'Solo Item' }] } as never, null).product_name).toBe('Solo Item');
    expect(resolveShopifyOrderVariables({} as never, null).product_name).toBe('');
  });

  it('derives payment_method: COD gateway name wins regardless of financial_status', () => {
    const v = resolveShopifyOrderVariables({ financial_status: 'paid', payment_gateway_names: ['Cash on Delivery (COD)'] } as never, null);
    expect(v.payment_method).toBe('COD');
  });

  it('derives payment_method: Prepaid when financial_status is paid and no COD gateway', () => {
    const v = resolveShopifyOrderVariables({ financial_status: 'paid', payment_gateway_names: ['Razorpay'] } as never, null);
    expect(v.payment_method).toBe('Prepaid');
  });

  it('derives payment_method: defaults to COD when financial_status/gateway are absent or pending', () => {
    expect(resolveShopifyOrderVariables({} as never, null).payment_method).toBe('COD');
    expect(resolveShopifyOrderVariables({ financial_status: 'pending' } as never, null).payment_method).toBe('COD');
  });

  it('surfaces shipping_address.province as shipping_state', () => {
    const v = resolveShopifyOrderVariables({ shipping_address: { city: 'Dehradun', province: 'Uttarakhand' } } as never, null);
    expect(v.shipping_state).toBe('Uttarakhand');
    expect(resolveShopifyOrderVariables({} as never, null).shipping_state).toBe('');
  });
});

describe('resolveShopifyCheckoutVariables', () => {
  it('flattens checkout data for abandoned-cart templates', () => {
    const co = {
      id: 90,
      abandoned_checkout_url: 'https://acme.com/checkouts/abc',
      email: 'x@y.com',
      currency: 'INR',
      total_price: '999',
      line_items: [{ title: 'Silver Ring', quantity: 1 }],
      customer: { first_name: 'Aarav' },
    };
    const v = resolveShopifyCheckoutVariables(co as never, 'acme.myshopify.com');
    expect(v.first_name).toBe('Aarav');
    expect(v.cart_total).toBe('999');
    expect(v.checkout_url).toBe('https://acme.com/checkouts/abc');
    expect(v.cart_items).toContain('Silver Ring');
    expect(v.store_url).toBe('https://acme.myshopify.com');
  });
});

describe('extractCustomerIdentifiers', () => {
  it('extracts phone/email/shopify id and normalises phone', () => {
    const ids = extractCustomerIdentifiers({
      customer: { id: 42, phone: '+91 99999-99999', email: 'AB@x.com' },
    });
    expect(ids.shopify_customer_id).toBe(42);
    expect(ids.email).toBe('ab@x.com');
    expect(ids.phone).toContain('99999');
    expect(ids.phone).not.toContain(' ');
    expect(ids.phone).not.toContain('-');
  });
  it('falls back to top-level phone/email + shipping_address phone', () => {
    const ids = extractCustomerIdentifiers({ phone: '9999999999', shipping_address: { phone: '888' } });
    expect(ids.phone).toBeTruthy();
    expect(ids.shopify_customer_id).toBeNull();
  });
  it('handles empty payload', () => {
    const ids = extractCustomerIdentifiers({});
    expect(ids).toEqual({ phone: null, email: null, shopify_customer_id: null });
  });
});
