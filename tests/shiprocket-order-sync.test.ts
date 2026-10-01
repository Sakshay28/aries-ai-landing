import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/shiprocket/service', () => ({ getValidShiprocketToken: vi.fn(), shiprocketClientForTenant: vi.fn() }));
vi.mock('@/lib/shiprocket/notify', () => ({ sendShipmentStatusUpdate: vi.fn() }));

import { parseShiprocketDate, snapshotShiprocketOrder } from '@/lib/shiprocket/orderSnapshot';
import { noticeForTransition, isCustomerQuietHours } from '@/lib/shiprocket/orderSync';
import type { ShiprocketOrder } from '@/lib/shiprocket/client';

// Trimmed from real GET /v1/external/orders rows (Devprayagjal, 2026-10-01).
const RTO_AFTER_3_ATTEMPTS: ShiprocketOrder = {
  id: 1574623504, channel_order_id: 'DPJ-4492', status: 'RTO IN TRANSIT', payment_method: 'cod',
  created_at: '11 Sep 2026, 10:04 AM', updated_at: '23 Sep 2026, 05:59 PM',
  picked_up_date: '2026-09-11 20:45:00', out_for_delivery_date: '16-09-2026 09:42:47',
  activities: ['ORDER_SHIPPED', 'ORDER_IN_TRANSIT', 'ORDER_OUT_FOR_DELIVERY', 'ORDER_UNDELIVERED_1', 'ORDER_OUT_FOR_DELIVERY',
    'ORDER_UNDELIVERED_2', 'ORDER_UNDELIVERED_3', 'ORDER_RTO_INIT_BATCH', 'REACHED_BACK_AT_SELLER_CITY'],
  products: [{ name: '7 Mukhi Nepali Rudraksha', quantity: 1 }],
  shipments: [{ id: 99, awb: '77951449881', courier: 'Blue Dart Surface', courier_id: 55,
    delivered_date: null, rto_initiated_date: '2026-09-23 09:29:00', rto_delivered_date: '0000-00-00 00:00:00' }],
};

describe('parseShiprocketDate', () => {
  it('reads all three IST formats Shiprocket mixes in one payload', () => {
    expect(parseShiprocketDate('2026-09-16 14:33:00')?.toISOString()).toBe('2026-09-16T09:03:00.000Z');
    expect(parseShiprocketDate('16-09-2026 14:33:00')?.toISOString()).toBe('2026-09-16T09:03:00.000Z');
    expect(parseShiprocketDate('1 Oct 2026, 12:25 PM')?.toISOString()).toBe('2026-10-01T06:55:00.000Z');
    expect(parseShiprocketDate('1 Oct 2026, 12:05 AM')?.toISOString()).toBe('2026-09-30T18:35:00.000Z');
  });

  it('treats the zero-date sentinel and junk as missing', () => {
    expect(parseShiprocketDate('0000-00-00 00:00:00')).toBeNull();
    expect(parseShiprocketDate('')).toBeNull();
    expect(parseShiprocketDate(null)).toBeNull();
    expect(parseShiprocketDate('soon')).toBeNull();
  });
});

describe('snapshotShiprocketOrder', () => {
  it('extracts status, NDR attempts, RTO date and payment mode from a real RTO order', () => {
    const s = snapshotShiprocketOrder(RTO_AFTER_3_ATTEMPTS);
    expect(s.status).toBe('rto');
    expect(s.channelOrderId).toBe('DPJ-4492');
    expect(s.ndrAttempts).toBe(3);
    expect(s.inNdr).toBe(false); // it has moved on to RTO
    expect(s.paymentMethod).toBe('COD');
    expect(s.awb).toBe('77951449881');
    expect(s.rtoInitiatedAt?.toISOString()).toBe('2026-09-23T03:59:00.000Z');
    expect(s.rtoDeliveredAt).toBeNull();
    expect(s.products).toEqual([{ title: '7 Mukhi Nepali Rudraksha', quantity: 1 }]);
  });

  it('marks a shipment as in NDR while it is only waiting for a re-attempt', () => {
    const s = snapshotShiprocketOrder({
      ...RTO_AFTER_3_ATTEMPTS, status: 'UNDELIVERED',
      activities: ['ORDER_OUT_FOR_DELIVERY', 'ORDER_UNDELIVERED_1', 'ORDER_OUT_FOR_DELIVERY', 'ORDER_UNDELIVERED_2'],
      shipments: [{ awb: 'X' }],
    });
    expect(s.status).toBe('in_transit');
    expect(s.inNdr).toBe(true);
    expect(s.ndrAttempts).toBe(2);
  });

  it('maps a not-yet-shipped Shopify order to created, with blank ids as null (bigint columns reject "")', () => {
    const s = snapshotShiprocketOrder({
      ...RTO_AFTER_3_ATTEMPTS, status: 'NEW', activities: [],
      shipments: [{ id: 1574000000, awb: '', courier: '', courier_id: '' as unknown as number }],
    });
    expect(s.status).toBe('created');
    expect(s.courierId).toBeNull();
    expect(s.awb).toBeNull();
    expect(s.courierName).toBeNull();
    expect(s.shiprocketShipmentId).toBe(1574000000);
  });
});

describe('noticeForTransition', () => {
  const now = new Date('2026-10-01T10:00:00Z');
  const recent = new Date('2026-10-01T08:00:00Z');
  const base = snapshotShiprocketOrder({ ...RTO_AFTER_3_ATTEMPTS, activities: [], shipments: [{}] });

  it('sends shipped / out-for-delivery / delivered on forward moves', () => {
    expect(noticeForTransition('pickup_scheduled', { ...base, status: 'in_transit', pickedUpAt: recent }, now)).toBe('in_transit');
    expect(noticeForTransition('in_transit', { ...base, status: 'out_for_delivery', outForDeliveryAt: recent }, now)).toBe('out_for_delivery');
    expect(noticeForTransition('out_for_delivery', { ...base, status: 'delivered', deliveredAt: recent }, now)).toBe('delivered');
    expect(noticeForTransition('in_transit', { ...base, status: 'rto', rtoInitiatedAt: recent }, now)).toBe('rto');
  });

  it('sends the NDR message — not a second "shipped" — when a delivery attempt fails', () => {
    const ndr = { ...base, status: 'in_transit' as const, inNdr: true, ndrAttempts: 1, updatedAt: recent };
    expect(noticeForTransition('out_for_delivery', ndr, now)).toBe('ndr');
  });

  it('never re-sends "shipped" for a backwards move', () => {
    expect(noticeForTransition('out_for_delivery', { ...base, status: 'in_transit', pickedUpAt: recent, updatedAt: recent }, now)).toBeNull();
  });

  it('stays silent about stale events, unchanged status, and internal steps', () => {
    const old = new Date('2026-09-25T00:00:00Z');
    expect(noticeForTransition('in_transit', { ...base, status: 'delivered', deliveredAt: old }, now)).toBeNull();
    expect(noticeForTransition('delivered', { ...base, status: 'delivered', deliveredAt: recent }, now)).toBeNull();
    expect(noticeForTransition('created', { ...base, status: 'pickup_scheduled', updatedAt: recent }, now)).toBeNull();
    expect(noticeForTransition('created', { ...base, status: 'cancelled', updatedAt: recent }, now)).toBeNull();
  });
});

describe('isCustomerQuietHours (IST)', () => {
  it('is quiet from 21:00 to 08:00 IST and open in between', () => {
    expect(isCustomerQuietHours(new Date('2026-10-01T15:29:00Z'))).toBe(false); // 20:59 IST
    expect(isCustomerQuietHours(new Date('2026-10-01T15:30:00Z'))).toBe(true);  // 21:00 IST
    expect(isCustomerQuietHours(new Date('2026-10-01T20:00:00Z'))).toBe(true);  // 01:30 IST
    expect(isCustomerQuietHours(new Date('2026-10-02T02:29:00Z'))).toBe(true);  // 07:59 IST
    expect(isCustomerQuietHours(new Date('2026-10-02T02:30:00Z'))).toBe(false); // 08:00 IST
  });
});
