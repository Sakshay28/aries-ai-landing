// Pure parsing of one GET /v1/external/orders row into the fields the rest
// of the app needs — status, the dates each leg happened, NDR attempts, and
// payment mode. No I/O, so the order-sync job and the daily report share one
// interpretation of Shiprocket's data and it stays unit-testable.
//
// Every shape here was checked against a live account (Devprayagjal,
// 2026-10-01). Shiprocket is inconsistent about dates — the same order mixes
// "16-09-2026 14:33:00", "2026-09-16 14:33:00", "1 Oct 2026, 12:25 PM" and the
// "0000-00-00 00:00:00" null sentinel — and every one of them is IST wall time.

import { normalizeShiprocketStatus, type ShipmentStatus } from './statusMap';
import type { ShiprocketOrder } from './client';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function istToDate(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date | null {
  if (!y || y < 2000) return null;
  const ms = Date.UTC(y, mo, d, h, mi, s) - IST_OFFSET_MS;
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** Parses any of Shiprocket's IST date formats into a real instant, or null. */
export function parseShiprocketDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || s.startsWith('0000')) return null;

  // 2026-09-16 14:33:00
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return istToDate(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));

  // 16-09-2026 14:33:00
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return istToDate(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));

  // 1 Oct 2026, 12:25 PM
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4}),?\s*(?:(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (mo === undefined) return null;
    let h = +(m[4] || 0);
    const ampm = (m[6] || '').toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return istToDate(+m[3], mo, +m[1], h, +(m[5] || 0));
  }
  return null;
}

export interface ShiprocketOrderSnapshot {
  shiprocketOrderId: number;
  shiprocketShipmentId: number | null;
  channelOrderId: string;
  status: ShipmentStatus | null;   // null = a raw status we don't recognise yet
  statusRaw: string;
  awb: string | null;
  courierName: string | null;
  courierId: number | null;
  paymentMethod: 'COD' | 'Prepaid' | null;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: Date | null;
  pickedUpAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
  rtoInitiatedAt: Date | null;
  rtoDeliveredAt: Date | null;
  updatedAt: Date | null;
  /** Highest ORDER_UNDELIVERED_<n> seen — how many delivery attempts failed. */
  ndrAttempts: number;
  /** Currently sitting in NDR: a delivery attempt failed and nothing has happened since but re-attempts. */
  inNdr: boolean;
  products: Array<{ title: string; quantity: number }>;
}

const UNDELIVERED = /^ORDER_UNDELIVERED(?:_(\d+))?$/i;

/** Shiprocket sends "" for ids that aren't assigned yet (a NEW order has courier_id ""). */
function toId(v: unknown): number | null {
  const n = Number(v);
  return v === '' || v == null || !Number.isFinite(n) || n <= 0 ? null : n;
}

export function snapshotShiprocketOrder(o: ShiprocketOrder): ShiprocketOrderSnapshot {
  const ship = o.shipments?.[0] || {};
  const statusRaw = (o.status || '').trim();
  const status = normalizeShiprocketStatus(statusRaw);

  const activities = o.activities || [];
  let ndrAttempts = 0;
  let lastNdrIdx = -1;
  activities.forEach((a, i) => {
    const m = String(a).match(UNDELIVERED);
    if (m) {
      ndrAttempts = Math.max(ndrAttempts, m[1] ? Number(m[1]) : ndrAttempts + 1);
      lastNdrIdx = i;
    }
  });
  // After a failed attempt the only events that keep it "in NDR" are the
  // courier going back out for another try. Anything else (delivered, RTO,
  // back in transit to a hub) means it has left NDR.
  const tail = lastNdrIdx >= 0 ? activities.slice(lastNdrIdx + 1) : [];
  const inNdr = lastNdrIdx >= 0
    && status !== 'delivered' && status !== 'rto' && status !== 'cancelled'
    && tail.every((a) => /OUT_FOR_DELIVERY|UNDELIVERED/i.test(String(a)));

  const pm = (o.payment_method || '').toLowerCase();
  const paymentMethod = pm === 'cod' ? 'COD' : pm === 'prepaid' ? 'Prepaid' : null;

  let rtoDeliveredAt = parseShiprocketDate(ship.rto_delivered_date);
  if (!rtoDeliveredAt && /^RTO DELIVERED$/i.test(statusRaw)) rtoDeliveredAt = parseShiprocketDate(o.updated_at);

  return {
    shiprocketOrderId: o.id,
    shiprocketShipmentId: toId(ship.id),
    channelOrderId: String(o.channel_order_id || ''),
    status,
    statusRaw,
    awb: ship.awb || null,
    courierName: ship.courier || null,
    courierId: toId(ship.courier_id),
    paymentMethod,
    customerName: o.customer_name || null,
    customerPhone: o.customer_phone || null,
    createdAt: parseShiprocketDate(o.created_at),
    pickedUpAt: parseShiprocketDate(o.picked_up_date) || parseShiprocketDate(ship.shipped_date),
    outForDeliveryAt: parseShiprocketDate(o.out_for_delivery_date),
    deliveredAt: parseShiprocketDate(ship.delivered_date) || parseShiprocketDate(o.delivered_date),
    rtoInitiatedAt: parseShiprocketDate(ship.rto_initiated_date),
    rtoDeliveredAt,
    updatedAt: parseShiprocketDate(o.updated_at),
    ndrAttempts,
    inNdr,
    products: (o.products || []).map((p) => ({ title: p.name || 'Unknown item', quantity: Number(p.quantity) || 1 })),
  };
}

/** When the snapshot's current status actually happened — gates stale customer notifications. */
export function statusEventTime(s: ShiprocketOrderSnapshot): Date | null {
  switch (s.status) {
    case 'delivered': return s.deliveredAt || s.updatedAt;
    case 'out_for_delivery': return s.outForDeliveryAt || s.updatedAt;
    case 'in_transit': return s.inNdr ? s.updatedAt : (s.pickedUpAt || s.updatedAt);
    case 'rto': return s.rtoInitiatedAt || s.updatedAt;
    default: return s.updatedAt;
  }
}
