// Dispatches one stored Shiprocket webhook payload: resolves the shipment,
// normalizes status, records a tracking event (raw payload always kept),
// updates the shipment row, and triggers the WhatsApp notification.
//
// [UNVERIFIED against live account] — the exact payload shape isn't
// confirmed. Field extraction is defensive (checks several plausible key
// names) specifically so the first real webhook received in production can
// correct this without any data loss — shiprocket_tracking_events.payload
// always stores the full raw body regardless of whether extraction succeeds.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { normalizeShiprocketStatus } from './statusMap';
import { sendShipmentStatusUpdate } from './notify';
import type { ShiprocketShipmentRow } from './shipments';

export interface DispatchResult {
  handled: boolean;
  note?: string;
}

function extractAwb(payload: Record<string, unknown>): string | null {
  return (payload.awb as string) || (payload.awb_code as string) || null;
}

function extractOrderId(payload: Record<string, unknown>): number | null {
  const raw = payload.order_id ?? payload.sr_order_id ?? payload.shiprocket_order_id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractStatus(payload: Record<string, unknown>): string | null {
  return (payload.current_status as string) || (payload.status as string) || (payload.shipment_status as string) || null;
}

function extractLocation(payload: Record<string, unknown>): string | null {
  return (payload.location as string) || (payload.current_location as string) || null;
}

export async function dispatchShiprocketWebhook(input: { tenantId: string; payload: unknown }): Promise<DispatchResult> {
  const payload = (input.payload || {}) as Record<string, unknown>;
  const awb = extractAwb(payload);
  const orderId = extractOrderId(payload);
  const rawStatus = extractStatus(payload);

  if (!awb && !orderId) {
    return { handled: false, note: 'payload had no recognizable awb or order id field' };
  }

  let query = supabaseAdmin.from('shiprocket_shipments').select('*').eq('tenant_id', input.tenantId);
  query = awb ? query.eq('awb_code', awb) : query.eq('shiprocket_order_id', orderId as number);
  const { data: shipment } = await query.maybeSingle();

  if (!shipment) {
    return { handled: false, note: `no shipment found for awb=${awb || ''} order_id=${orderId || ''}` };
  }

  const row = shipment as ShiprocketShipmentRow;
  const normalized = normalizeShiprocketStatus(rawStatus);
  const nextStatus = normalized || row.status;

  await supabaseAdmin.from('shiprocket_tracking_events').insert({
    tenant_id: input.tenantId,
    shipment_id: row.id,
    awb_code: awb || row.awb_code,
    raw_status: rawStatus,
    normalized_status: nextStatus,
    status_location: extractLocation(payload),
    event_time: new Date().toISOString(),
    payload,
  });

  const statusChanged = nextStatus !== row.status;
  if (statusChanged) {
    await supabaseAdmin.from('shiprocket_shipments').update({
      status: nextStatus,
      status_raw: rawStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id);

    await sendShipmentStatusUpdate(input.tenantId, { ...row, status: nextStatus, status_raw: rawStatus }, nextStatus).catch((err) => {
      console.error('[shiprocket:webhook] notify failed', (err as Error).message);
    });
  } else {
    await supabaseAdmin.from('shiprocket_shipments').update({
      status_raw: rawStatus, updated_at: new Date().toISOString(),
    }).eq('id', row.id);
  }

  return { handled: true };
}
