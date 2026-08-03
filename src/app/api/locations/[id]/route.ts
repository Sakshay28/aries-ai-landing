import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { getSavedLocationById, updateSavedLocation, deleteSavedLocation } from '@/lib/location/service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/locations/[id]
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const location = await getSavedLocationById(tenantId, id);
    if (!location) {
      return NextResponse.json({ success: false, error: 'Location not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: location });
  } catch (err: any) {
    console.error('[locations-id-api] GET error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/locations/[id]
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const payload = await req.json();
    
    const location = await updateSavedLocation(tenantId, id, payload);
    return NextResponse.json({ success: true, data: location });
  } catch (err: any) {
    console.error('[locations-id-api] PUT error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Bad request' }, { status: 400 });
  }
}

/**
 * DELETE /api/locations/[id]
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await deleteSavedLocation(tenantId, id);
    return NextResponse.json({ success: true, message: 'Location deleted successfully' });
  } catch (err: any) {
    console.error('[locations-id-api] DELETE error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}
