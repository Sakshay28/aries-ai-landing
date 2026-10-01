import { describe, it, expect } from 'vitest';
import { buildStatusLine, renderShipmentNotice } from '@/lib/shiprocket/notify';
import type { ShiprocketShipmentRow } from '@/lib/shiprocket/shipments';

function shipment(overrides: Partial<ShiprocketShipmentRow> = {}): ShiprocketShipmentRow {
  return {
    id: 's1',
    tenant_id: 't1',
    shopify_order_id: null,
    shopify_order_number: '#1042',
    shopify_order_shopify_id: null,
    customer_name: 'Aarav',
    customer_phone: '+919999999999',
    customer_email: null,
    shiprocket_order_id: null,
    shiprocket_shipment_id: null,
    courier_id: null,
    courier_name: 'BlueDart',
    awb_code: 'AWB123',
    pickup_scheduled_at: null,
    pickup_token_number: null,
    label_url: null,
    manifest_url: null,
    payment_method: null,
    status: 'in_transit',
    status_raw: null,
    last_error: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('buildStatusLine', () => {
  it('covers every customer-facing status with the order number included', () => {
    const statuses: Array<[ShiprocketShipmentRow['status'], RegExp]> = [
      ['in_transit', /shipped.*BlueDart.*AWB123/],
      ['out_for_delivery', /out for delivery/],
      ['delivered', /delivered/],
      ['rto', /returned/],
      ['cancelled', /cancelled/],
    ];
    for (const [status, pattern] of statuses) {
      const line = buildStatusLine(shipment({ status }), status);
      expect(line).toContain('#1042');
      expect(line).toMatch(pattern);
    }
  });

  it('falls back to a generic line for an unmapped status', () => {
    const line = buildStatusLine(shipment(), 'pending');
    expect(line).toBe('Update on your order #1042.');
  });
});

describe('renderShipmentNotice', () => {
  it('falls back to the platform line when the tenant has no override', () => {
    expect(renderShipmentNotice(null, shipment(), 'in_transit')).toBe(buildStatusLine(shipment(), 'in_transit'));
  });

  it('fills every placeholder in a tenant override, with the COD line only for COD', () => {
    const overrides = { out_for_delivery: '{{customer_name}} Ji, #{{order_id}} is out today{{cod_line}}. Track: {{tracking_url}}' };
    const cod = renderShipmentNotice(overrides, shipment({ payment_method: 'COD', customer_name: 'Naina' }), 'out_for_delivery', { amount: '999.00' });
    expect(cod).toBe('Naina Ji, ##1042 is out today and keep ₹999.00 ready (Cash on Delivery). Track: https://shiprocket.co/tracking/AWB123');
    const prepaid = renderShipmentNotice(overrides, shipment({ payment_method: 'Prepaid', customer_name: 'Naina' }), 'out_for_delivery', { amount: '999.00' });
    expect(prepaid).not.toContain('Cash on Delivery');
  });

  it('has a customer line for a failed delivery attempt', () => {
    expect(buildStatusLine(shipment(), 'ndr')).toMatch(/couldn't deliver.*#1042/);
  });
});
