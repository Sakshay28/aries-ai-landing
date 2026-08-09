import { describe, it, expect } from 'vitest';
import { normalizeShiprocketStatus } from '@/lib/shiprocket/statusMap';

describe('normalizeShiprocketStatus', () => {
  const cases: Array<[string, string]> = [
    ['PICKUP SCHEDULED', 'pickup_scheduled'],
    ['Pickup Generated', 'pickup_scheduled'],
    ['SHIPPED', 'in_transit'],
    ['IN TRANSIT', 'in_transit'],
    ['Picked Up', 'in_transit'],
    ['OUT FOR DELIVERY', 'out_for_delivery'],
    ['DELIVERED', 'delivered'],
    ['RTO INITIATED', 'rto'],
    ['RTO DELIVERED', 'rto'],
    ['CANCELLED', 'cancelled'],
    ['Courier Assigned', 'awb_assigned'],
    ['AWB Assigned', 'awb_assigned'],
  ];

  it.each(cases)('maps %s -> %s', (raw, expected) => {
    expect(normalizeShiprocketStatus(raw)).toBe(expected);
  });

  it('returns null for an unrecognized status rather than misclassifying', () => {
    expect(normalizeShiprocketStatus('SOME NEW STATUS WE HAVE NEVER SEEN')).toBeNull();
  });

  it('returns null for empty/missing input', () => {
    expect(normalizeShiprocketStatus('')).toBeNull();
    expect(normalizeShiprocketStatus(null)).toBeNull();
    expect(normalizeShiprocketStatus(undefined)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(normalizeShiprocketStatus('delivered')).toBe('delivered');
    expect(normalizeShiprocketStatus('DeLiVeReD')).toBe('delivered');
  });
});
