// GET /api/integrations/shiprocket/shipments?status=&limit=&offset=
// LEFT JOIN shopify_orders + shiprocket_shipments so un-shipped orders still
// show up with a "Create shipment" affordance in the dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  const { data: orders, error: ordersErr } = await supabaseAdmin
    .from('shopify_orders')
    .select('id, order_number, phone, email, shipping_address, shopify_created_at')
    .eq('tenant_id', tenantId)
    .order('shopify_created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });

  const orderIds = (orders || []).map((o) => o.id);
  const { data: shipments } = orderIds.length
    ? await supabaseAdmin.from('shiprocket_shipments').select('*').eq('tenant_id', tenantId).in('shopify_order_id', orderIds)
    : { data: [] as Array<Record<string, unknown>> };
  const shipmentByOrder = new Map((shipments || []).map((s) => [s.shopify_order_id as string, s]));

  let rows = (orders || []).map((o) => {
    const shipment = shipmentByOrder.get(o.id) || null;
    return {
      shopify_order_id: o.id,
      order_number: o.order_number,
      customer_name: extractCustomerName(o.shipping_address as Record<string, unknown> | null),
      customer_phone: o.phone,
      shipment: shipment
        ? {
            id: shipment.id,
            status: shipment.status,
            status_raw: shipment.status_raw,
            courier_name: shipment.courier_name,
            awb_code: shipment.awb_code,
            label_url: shipment.label_url,
            last_error: shipment.last_error,
          }
        : null,
    };
  });

  if (statusFilter) {
    rows = rows.filter((r) => (r.shipment?.status || 'unshipped') === statusFilter);
  }

  return NextResponse.json({ rows });
}

function extractCustomerName(address: Record<string, unknown> | null): string | null {
  if (!address) return null;
  if (address.name) return String(address.name);
  const first = address.first_name as string | undefined;
  const last = address.last_name as string | undefined;
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return null;
}
