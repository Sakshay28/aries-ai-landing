/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/meta/service', async () => {
  class MetaApiError extends Error {
    code?: number;
    constructor(message: string, code?: number) { super(message); this.code = code; }
  }
  return { MetaApiError, sendTemplateMessage: vi.fn() };
});
vi.mock('@/lib/security/keyManager', () => ({ decryptTokenV2: () => 'token' }));
vi.mock('@/lib/alerts/admin', () => ({ notifyAdmin: vi.fn(async () => undefined) }));

const orderRow = { id: 'row-1', lead_id: 'lead-1' };
vi.mock('@/lib/supabase/admin', () => {
  const builder: any = {};
  for (const m of ['select', 'update', 'insert', 'eq', 'is', 'ilike', 'limit']) builder[m] = vi.fn(() => builder);
  builder.single = vi.fn(async () => ({ data: orderRow, error: null }));
  builder.maybeSingle = vi.fn(async () => ({
    data: { id: 'conv-1', is_active: true, wa_access_token: 'enc', wa_phone_number_id: 'pn', shopify_order_confirmation_enabled: true, shopify_store_url: 'shop.com' },
    error: null,
  }));
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve);
  return { supabaseAdmin: { from: vi.fn(() => builder) } };
});

import { sendTemplateMessage, MetaApiError } from '@/lib/meta/service';
import { sendOrderConfirmationRequest } from '@/lib/shopify/notify';

const order = {
  id: 123, name: 'DPJ-1', total_price: '999.00', currency: 'INR', phone: '+919999999999',
  gateway: 'Cash on Delivery (COD)', payment_gateway_names: ['Cash on Delivery (COD)'],
  customer: { first_name: 'Ramesh' },
  shipping_address: { city: 'Shimla', province: 'Himachal Pradesh', phone: '9999999999' },
  line_items: [{ title: '7 Mukhi', quantity: 1 }],
} as any;

describe('order confirmation template selection', () => {
  beforeEach(() => vi.mocked(sendTemplateMessage).mockReset());

  it('sends the UTILITY template when it is approved', async () => {
    vi.mocked(sendTemplateMessage).mockResolvedValueOnce({ messageId: 'wamid.1', status: 'sent' });
    const r = await sendOrderConfirmationRequest('t1', order);
    expect(r.sent).toBe(true);
    expect(vi.mocked(sendTemplateMessage).mock.calls.map((c) => c[3])).toEqual(['shopify_order_confirm_utility']);
  });

  it('falls back to the legacy template while the new one is not approved (132001)', async () => {
    vi.mocked(sendTemplateMessage)
      .mockRejectedValueOnce(new (MetaApiError as any)('template does not exist', 132001))
      .mockResolvedValueOnce({ messageId: 'wamid.2', status: 'sent' });
    const r = await sendOrderConfirmationRequest('t1', order);
    expect(r.sent).toBe(true);
    expect(vi.mocked(sendTemplateMessage).mock.calls.map((c) => c[3])).toEqual(['shopify_order_confirm_utility', 'shopify_order_confirmation_action']);
  });

  it('does not retry on unrelated errors', async () => {
    vi.mocked(sendTemplateMessage).mockRejectedValueOnce(new (MetaApiError as any)('rate limited', 130429));
    const r = await sendOrderConfirmationRequest('t1', order);
    expect(r.sent).toBe(false);
    expect(vi.mocked(sendTemplateMessage)).toHaveBeenCalledTimes(1);
  });
});
