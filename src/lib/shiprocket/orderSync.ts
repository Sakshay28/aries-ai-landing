// Pull-based Shiprocket status sync.
//
// Most merchants don't ship through Aries' createShipmentFromOrder — they let
// Shiprocket import orders from its own Shopify channel and ship from the
// Shiprocket panel. Those shipments never had a shiprocket_shipments row, so
// webhooks (keyed by our rows) matched nothing, no customer ever got a
// shipped/out-for-delivery/delivered message, and the daily report's delivery
// section was empty. Found live on Devprayagjal 2026-10-01: 70 Shiprocket
// orders, 0 rows here, 0 webhooks ever received.
//
// This job lists the account's orders, matches each to a shopify_orders row by
// Shopify order name (Shiprocket's channel_order_id), upserts the shipment,
// and fires the customer notification when a status actually moved. It does
// not depend on the merchant configuring Shiprocket's webhook at all.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { selectInBatches } from '@/lib/supabase/select-in-batches';
import { normalizePhoneNumber } from '@/lib/whatsapp/phone';
import { notifyAdmin } from '@/lib/alerts/admin';
import { getValidShiprocketToken, shiprocketClientForTenant } from './service';
import { snapshotShiprocketOrder, statusEventTime, type ShiprocketOrderSnapshot } from './orderSnapshot';
import { sendShipmentStatusUpdate, type ShipmentNotice } from './notify';
import type { ShiprocketShipmentRow } from './shipments';
import type { ShipmentStatus } from './statusMap';
import type { ShiprocketOrder } from './client';

const DEFAULT_LOOKBACK_DAYS = 45;
const MAX_PAGES = 10;
const PER_PAGE = 100;
/** A status older than this is history, not news — never message the customer about it. */
const NOTIFY_FRESHNESS_MS = 36 * 60 * 60 * 1000;

const FORWARD_RANK: Partial<Record<ShipmentStatus, number>> = {
  pending: 0, creating: 0, created: 0, failed: 0,
  awb_assigned: 1, label_generated: 1, pickup_scheduled: 2,
  in_transit: 3, out_for_delivery: 4, delivered: 5,
};

/**
 * 21:00–08:00 IST: no customer shipment messages. Couriers post scans (RTO,
 * late deliveries) at any hour; a "your order was delivered" ping at 23:40 is
 * not premium service. Pure.
 */
export function isCustomerQuietHours(now: Date = new Date()): boolean {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 21 * 60 || minutes < 8 * 60;
}

/**
 * Which customer message (if any) a status move deserves. Pure.
 *
 *  - Only forward progress notifies: an NDR shows up as out_for_delivery →
 *    in_transit, which must NOT re-send "your order has shipped" — it sends
 *    the NDR "we missed you" message instead.
 *  - Nothing older than NOTIFY_FRESHNESS_MS is sent, so a sync that was down
 *    for days (or the first import) can't spam customers with stale news.
 */
export function noticeForTransition(
  prev: ShipmentStatus | null,
  snap: ShiprocketOrderSnapshot,
  now: Date = new Date(),
): ShipmentNotice | null {
  const next = snap.status;
  if (!next || next === prev) return null;

  const at = statusEventTime(snap);
  if (!at || now.getTime() - at.getTime() > NOTIFY_FRESHNESS_MS) return null;

  const prevRank = prev ? (FORWARD_RANK[prev] ?? 0) : 0;
  switch (next) {
    case 'in_transit':
      if (snap.inNdr && prev === 'out_for_delivery') return 'ndr';
      return prevRank < 3 ? 'in_transit' : null;
    case 'out_for_delivery':
      return 'out_for_delivery';
    case 'delivered':
      return 'delivered';
    case 'rto':
      return prev === 'cancelled' ? null : 'rto';
    default:
      return null; // created/awb/pickup/cancelled — internal, nothing to tell the customer
  }
}

interface OrderRow {
  id: string;
  order_number: string | null;
  shopify_id: number | null;
  phone: string | null;
  email: string | null;
  total_price: number | string | null;
  shipping_address: Record<string, unknown> | null;
}

export interface ShiprocketSyncResult {
  ok: boolean;
  error?: string;
  fetched: number;
  matched: number;
  inserted: number;
  updated: number;
  notified: number;
  /** Notifiable moves deferred until morning (quiet hours). */
  held?: number;
  backfill: boolean;
  snapshots: ShiprocketOrderSnapshot[];
}

/** Fetches the account's recent orders (newest first) as parsed snapshots. */
export async function fetchShiprocketSnapshots(
  tenantId: string,
  opts: { lookbackDays?: number } = {},
): Promise<{ ok: true; snapshots: ShiprocketOrderSnapshot[] } | { ok: false; error: string }> {
  const token = await getValidShiprocketToken(tenantId);
  if (!token) return { ok: false, error: 'Shiprocket is not connected or login failed' };
  const client = shiprocketClientForTenant(token);
  const cutoff = Date.now() - (opts.lookbackDays ?? DEFAULT_LOOKBACK_DAYS) * 24 * 60 * 60 * 1000;

  const snapshots: ShiprocketOrderSnapshot[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { orders, totalPages } = await client.listOrders(page, PER_PAGE);
      let reachedCutoff = false;
      for (const o of orders as ShiprocketOrder[]) {
        const snap = snapshotShiprocketOrder(o);
        if (snap.createdAt && snap.createdAt.getTime() < cutoff) { reachedCutoff = true; continue; }
        snapshots.push(snap);
      }
      if (reachedCutoff || page >= totalPages || orders.length === 0) break;
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  return { ok: true, snapshots };
}

function customerName(order: OrderRow, snap: ShiprocketOrderSnapshot): string | null {
  const addr = order.shipping_address || {};
  const first = typeof addr.first_name === 'string' ? addr.first_name.trim() : '';
  const full = typeof addr.name === 'string' ? addr.name.trim() : '';
  return first || full || snap.customerName || null;
}

function customerPhone(order: OrderRow, snap: ShiprocketOrderSnapshot): string | null {
  const addrPhone = typeof order.shipping_address?.phone === 'string' ? order.shipping_address.phone : null;
  for (const raw of [order.phone, addrPhone, snap.customerPhone]) {
    if (!raw) continue;
    const n = normalizePhoneNumber(raw);
    // Shiprocket masks phones on some plans ("XXXXXX5813") — those normalise
    // to a short digit string and must not be used.
    if (n.length >= 11) return n;
  }
  return null;
}

/**
 * One sync pass for a tenant. `notify: false` makes it a silent import. The
 * first pass for a tenant with no shipment rows is always silent — everything
 * it finds is history.
 */
export async function syncShiprocketShipments(
  tenantId: string,
  opts: { notify?: boolean; lookbackDays?: number; now?: Date } = {},
): Promise<ShiprocketSyncResult> {
  const result: ShiprocketSyncResult = { ok: true, fetched: 0, matched: 0, inserted: 0, updated: 0, notified: 0, backfill: false, snapshots: [] };

  const fetched = await fetchShiprocketSnapshots(tenantId, { lookbackDays: opts.lookbackDays });
  if (!fetched.ok) return { ...result, ok: false, error: fetched.error };
  result.snapshots = fetched.snapshots;
  result.fetched = fetched.snapshots.length;

  const names = Array.from(new Set(fetched.snapshots.map((s) => s.channelOrderId).filter(Boolean)));
  if (names.length === 0) return result;

  const orders = await selectInBatches<OrderRow>(names, (batch) =>
    supabaseAdmin.from('shopify_orders')
      .select('id, order_number, shopify_id, phone, email, total_price, shipping_address')
      .eq('tenant_id', tenantId)
      .in('order_number', batch),
  );
  const orderByName = new Map(orders.map((o) => [o.order_number || '', o]));
  const orderIds = orders.map((o) => o.id);

  const { count: existingCount } = await supabaseAdmin
    .from('shiprocket_shipments').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  result.backfill = (existingCount ?? 0) === 0;
  const notify = (opts.notify ?? true) && !result.backfill;

  const existing = orderIds.length
    ? await selectInBatches<ShiprocketShipmentRow>(orderIds, (batch) =>
      supabaseAdmin.from('shiprocket_shipments').select('*').eq('tenant_id', tenantId).in('shopify_order_id', batch))
    : [];
  const shipmentByOrderId = new Map(existing.map((s) => [s.shopify_order_id || '', s]));

  const now = opts.now ?? new Date();
  for (const snap of fetched.snapshots) {
    const order = orderByName.get(snap.channelOrderId);
    if (!order) continue; // not a Shopify order we know (manual/custom-channel shipment)
    result.matched++;

    const prev = shipmentByOrderId.get(order.id) || null;
    const nextStatus: ShipmentStatus = snap.status ?? prev?.status ?? 'created';

    // Hold a move that would message the customer during quiet hours: leave
    // the row untouched so the first pass after 08:00 IST sees the same
    // transition and sends it then (well inside the 36h freshness window).
    // The daily report reads Shiprocket live, so its numbers aren't affected.
    if (notify && isCustomerQuietHours(now) && noticeForTransition(prev?.status ?? null, snap, now)) {
      result.held = (result.held ?? 0) + 1;
      continue;
    }
    const fields = {
      shopify_order_number: order.order_number,
      shopify_order_shopify_id: order.shopify_id,
      customer_name: customerName(order, snap),
      customer_phone: customerPhone(order, snap),
      customer_email: order.email,
      shiprocket_order_id: snap.shiprocketOrderId,
      shiprocket_shipment_id: snap.shiprocketShipmentId,
      courier_id: snap.courierId,
      courier_name: snap.courierName,
      awb_code: snap.awb,
      payment_method: snap.paymentMethod,
      status: nextStatus,
      status_raw: snap.statusRaw,
      shiprocket_created_at: snap.createdAt?.toISOString() ?? null,
    };

    let row: ShiprocketShipmentRow;
    if (!prev) {
      const { data, error } = await supabaseAdmin.from('shiprocket_shipments')
        .insert({ tenant_id: tenantId, shopify_order_id: order.id, ...fields })
        .select('*').single();
      if (error) {
        if (error.code !== '23505') console.error('[shiprocket:sync] insert failed', snap.channelOrderId, error.message);
        continue; // 23505: a concurrent pass inserted it — next pass picks it up
      }
      row = data as ShiprocketShipmentRow;
      result.inserted++;
    } else {
      const changed = prev.status !== nextStatus || prev.status_raw !== snap.statusRaw
        || prev.awb_code !== snap.awb || prev.courier_name !== snap.courierName
        || prev.customer_phone !== fields.customer_phone;
      if (!changed) continue;
      // Optimistic lock on updated_at: when two passes overlap (pg_cron +
      // GitHub Actions + a webhook), only the one whose write lands gets to
      // notify, so a customer never gets the same message twice.
      const { data, error } = await supabaseAdmin.from('shiprocket_shipments')
        .update({ ...fields, updated_at: now.toISOString() })
        .eq('id', prev.id).eq('updated_at', prev.updated_at).select('*').maybeSingle();
      if (error) { console.error('[shiprocket:sync] update failed', snap.channelOrderId, error.message); continue; }
      if (!data) continue; // another pass already applied this change
      row = data as ShiprocketShipmentRow;
      result.updated++;
    }

    if ((prev?.status ?? null) === nextStatus && prev?.status_raw === snap.statusRaw) continue;

    await supabaseAdmin.from('shiprocket_tracking_events').insert({
      tenant_id: tenantId,
      shipment_id: row.id,
      awb_code: snap.awb,
      raw_status: snap.statusRaw,
      normalized_status: nextStatus,
      event_time: (statusEventTime(snap) ?? now).toISOString(),
      payload: { source: 'order_sync', shiprocket_order_id: snap.shiprocketOrderId, ndr_attempts: snap.ndrAttempts },
    });

    if (!notify) continue;
    const notice = noticeForTransition(prev?.status ?? null, snap, now);
    if (!notice) continue;
    await sendShipmentStatusUpdate(tenantId, row, notice, { amount: order.total_price != null ? String(order.total_price) : null })
      .then(() => { result.notified++; })
      .catch((err) => console.error('[shiprocket:sync] notify failed', snap.channelOrderId, (err as Error).message));
  }

  return result;
}

/**
 * Every tenant with a Shiprocket connection — including ones in 'error'.
 * getValidShiprocketToken() flips a connection to 'error' on ANY failed
 * login, a network blip included; selecting only 'connected' meant one bad
 * minute stopped that tenant's status sync forever, silently. Retrying
 * 'error' rows lets a transient failure heal itself (a successful login sets
 * 'connected' again); a real one (changed password) alerts once, on the flip.
 */
export async function syncAllShiprocketTenants(deadlineMs: number): Promise<Array<{ tenantId: string } & Omit<ShiprocketSyncResult, 'snapshots'>>> {
  const { data: conns } = await supabaseAdmin.from('shiprocket_connections')
    .select('tenant_id, status').in('status', ['connected', 'error']);
  const out: Array<{ tenantId: string } & Omit<ShiprocketSyncResult, 'snapshots'>> = [];
  for (const c of conns || []) {
    if (Date.now() > deadlineMs) break;
    const r = await syncShiprocketShipments(c.tenant_id as string);
    if (!r.ok && c.status === 'connected') {
      const { data: after } = await supabaseAdmin.from('shiprocket_connections')
        .select('status, last_auth_error').eq('tenant_id', c.tenant_id).maybeSingle();
      if (after?.status === 'error') {
        const { data: t } = await supabaseAdmin.from('tenants').select('business_name').eq('id', c.tenant_id).maybeSingle();
        await notifyAdmin({
          dedupeKey: `shiprocket-login-failed:${c.tenant_id}`,
          subject: `Shiprocket login failing — ${t?.business_name || c.tenant_id}`,
          summary: `Shipment status sync (and customer shipped/delivered messages) is stopped until Shiprocket login works again. Shiprocket said: ${after.last_auth_error || r.error}. If the merchant changed their Shiprocket password, reconnect Shiprocket in the dashboard.`,
          context: { tenant_id: c.tenant_id, error: r.error },
        }).catch(() => undefined);
      }
    }
    out.push({
      tenantId: c.tenant_id as string, ok: r.ok, error: r.error, fetched: r.fetched, matched: r.matched,
      inserted: r.inserted, updated: r.updated, notified: r.notified, held: r.held, backfill: r.backfill,
    });
  }
  return out;
}
