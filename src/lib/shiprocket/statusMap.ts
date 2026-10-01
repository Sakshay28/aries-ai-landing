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
  // normal forward delivery. "REACHED BACK AT SELLER CITY" is the leg after
  // RTO Initiated on a live account (seen 2026-10-01) and has no "rto" in it.
  { pattern: /rto|reached back at seller|return(ed)? to (origin|seller)/i, status: 'rto' },
  // "UNDELIVERED" (an NDR attempt) also contains "delivered" — it's still a
  // forward shipment in the courier network, so it must win over /delivered/.
  { pattern: /undelivered|\bndr\b/i, status: 'in_transit' },
  { pattern: /out for delivery/i, status: 'out_for_delivery' },
  { pattern: /delivered/i, status: 'delivered' },
  { pattern: /cancel/i, status: 'cancelled' },
  // "PICKUP BOOKED" / "OUT FOR PICKUP" / "PICKUP EXCEPTION" are what a live
  // account actually returns between AWB assignment and pickup.
  { pattern: /pickup.*(scheduled|generated|booked|exception|rescheduled|error)|out for pickup/i, status: 'pickup_scheduled' },
  { pattern: /picked up|shipped|in transit|in-transit|reached at destination|destination hub|misrouted/i, status: 'in_transit' },
  { pattern: /awb.*assign|courier.*assign|ready to ship|invoiced|label generated/i, status: 'awb_assigned' },
  // A Shopify-channel order lands in Shiprocket as "NEW" until the merchant
  // assigns a courier.
  { pattern: /^new$/i, status: 'created' },
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
