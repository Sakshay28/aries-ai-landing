// Shiprocket integration admin API.
//
//   GET    /api/integrations/shiprocket   → status summary for the caller's tenant
//   POST   /api/integrations/shiprocket   → { action: 'connect' | 'test_connection' | 'set_pickup_location' | 'set_defaults' }
//   DELETE /api/integrations/shiprocket   → disconnect

import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { connectTenant, disconnectTenant, getStatus, testConnection, setPickupLocation, setDefaults } from '@/lib/shiprocket/service';

export const runtime = 'nodejs';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = await getStatus(tenantId);
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as string;

  if (action === 'connect') {
    if (!body.email || !body.password) {
      return NextResponse.json({ error: 'email and password required' }, { status: 400 });
    }
    const res = await connectTenant({ tenantId, email: body.email, password: body.password });
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }

  if (action === 'test_connection') {
    const res = await testConnection(tenantId);
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }

  if (action === 'set_pickup_location') {
    if (!body.pickup_location) return NextResponse.json({ error: 'pickup_location required' }, { status: 400 });
    await setPickupLocation(tenantId, body.pickup_location);
    return NextResponse.json({ ok: true });
  }

  if (action === 'set_defaults') {
    await setDefaults(tenantId, {
      default_item_weight_kg: body.default_item_weight_kg,
      default_package_length_cm: body.default_package_length_cm,
      default_package_breadth_cm: body.default_package_breadth_cm,
      default_package_height_cm: body.default_package_height_cm,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}

export async function DELETE() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await disconnectTenant(tenantId);
  return NextResponse.json({ ok: true });
}
