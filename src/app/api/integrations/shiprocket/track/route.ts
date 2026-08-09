import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { refreshTrackingForShipment } from '@/lib/shiprocket/shipments';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.shipment_id) return NextResponse.json({ error: 'shipment_id required' }, { status: 400 });

  const result = await refreshTrackingForShipment(tenantId, body.shipment_id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
