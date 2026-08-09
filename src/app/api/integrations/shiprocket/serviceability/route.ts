import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { getServiceabilityForShipment } from '@/lib/shiprocket/shipments';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const shipmentId = req.nextUrl.searchParams.get('shipment_id');
  if (!shipmentId) return NextResponse.json({ error: 'shipment_id required' }, { status: 400 });

  const result = await getServiceabilityForShipment(tenantId, shipmentId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
