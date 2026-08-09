/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '@/lib/supabase/admin';
import { createShipmentFromOrder } from '@/lib/shiprocket/shipments';

/** A minimal chainable + thenable mock matching supabase-js's query builder shape. */
function thenable(result: { data: unknown; error: unknown }) {
  const builder: any = {};
  const chainMethods = ['select', 'eq', 'in', 'order', 'limit', 'range', 'insert', 'update', 'delete'];
  for (const m of chainMethods) builder[m] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe('createShipmentFromOrder idempotency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the existing shipment when a concurrent insert races (23505), instead of erroring or double-creating', async () => {
    const order = {
      id: 'order-1', order_number: '#1001', shopify_id: 555,
      shipping_address: { name: 'Test Customer' }, phone: '+919999999999', email: 'test@example.com',
    };
    const existingShipment = { id: 'shipment-1', tenant_id: 'tenant-1', shopify_order_id: 'order-1', status: 'created' };

    let shiprocketShipmentsCalls = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shopify_orders') return thenable({ data: order, error: null });
      if (table === 'shiprocket_shipments') {
        shiprocketShipmentsCalls++;
        if (shiprocketShipmentsCalls === 1) {
          // The idempotency-guard INSERT races with a concurrent request and loses.
          return thenable({ data: null, error: { code: '23505' } });
        }
        // Second call: fetch the row the winning concurrent request created.
        return thenable({ data: existingShipment, error: null });
      }
      return thenable({ data: null, error: null });
    });

    const result = await createShipmentFromOrder('tenant-1', 'order-1');

    expect(result.ok).toBe(true);
    expect(result.shipment).toEqual(existingShipment);
    // Exactly insert-attempt + existing-row lookup — never a third call, i.e.
    // never a second INSERT and never a call out to Shiprocket for this order.
    expect(shiprocketShipmentsCalls).toBe(2);
  });

  it('does not touch shiprocket_shipments at all when the order cannot be found', async () => {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shopify_orders') return thenable({ data: null, error: null });
      throw new Error(`unexpected table access: ${table}`);
    });

    const result = await createShipmentFromOrder('tenant-1', 'missing-order');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('surfaces a non-duplicate insert error directly without a second lookup', async () => {
    const order = { id: 'order-1', order_number: '#1001', shopify_id: 555, shipping_address: {}, phone: null, email: null };
    let shiprocketShipmentsCalls = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shopify_orders') return thenable({ data: order, error: null });
      if (table === 'shiprocket_shipments') {
        shiprocketShipmentsCalls++;
        return thenable({ data: null, error: { code: '23503', message: 'foreign key violation' } });
      }
      return thenable({ data: null, error: null });
    });

    const result = await createShipmentFromOrder('tenant-1', 'order-1');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('foreign key violation');
    expect(shiprocketShipmentsCalls).toBe(1); // no existing-row lookup for a non-duplicate error
  });
});
