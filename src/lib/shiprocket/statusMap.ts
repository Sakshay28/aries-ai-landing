// Normalizes Shiprocket's raw status strings into the internal enum used by
// shiprocket_shipments.status. Pure, unit-testable, no I/O.
//
// [UNVERIFIED against live account] — the exact raw strings Shiprocket sends
// (both via webhook and GET /courier/track) aren't confirmed from a real
// account yet. Matching is case-insensitive substring matching against the
// documented status vocabulary so near-miss casing/wording still resolves
// correctly; status_raw is always preserved separately regardless of whether
// normalization succeeds, so nothing is lost if a guess is wrong.

export type ShipmentStatus =
  | 'pending' | 'creating' | 'created' | 'awb_assigned' | 'pickup_scheduled'
  | 'label_generated' | 'in_transit' | 'out_for_delivery' | 'delivered'
  | 'cancelled' | 'failed' | 'rto';

const RULES: Array<{ pattern: RegExp; status: ShipmentStatus }> = [
  // RTO must be checked before "delivered"/"out for delivery" — Shiprocket's
  // RTO statuses ("RTO Initiated", "RTO Delivered", "RTO Out For Delivery")
  // otherwise match those broader patterns first and get misclassified as a
  // normal forward delivery.
  { pattern: /rto/i, status: 'rto' },
  { pattern: /out for delivery/i, status: 'out_for_delivery' },
  { pattern: /delivered/i, status: 'delivered' },
  { pattern: /pickup.*scheduled|pickup.*generated/i, status: 'pickup_scheduled' },
  { pattern: /picked up|shipped|in transit|in-transit/i, status: 'in_transit' },
  { pattern: /awb.*assign|courier.*assign/i, status: 'awb_assigned' },
  { pattern: /cancel/i, status: 'cancelled' },
];

/**
 * Maps a raw Shiprocket status string to the internal enum. Never
 * misclassifies silently: an unrecognized string returns null so the caller
 * can choose to keep the shipment's previous known status rather than
 * regress it to something wrong.
 */
export function normalizeShiprocketStatus(rawStatus: string | null | undefined): ShipmentStatus | null {
  if (!rawStatus) return null;
  const trimmed = rawStatus.trim();
  if (!trimmed) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(trimmed)) return rule.status;
  }
  return null;
}
