import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSavedLocations, createSavedLocation } from '@/lib/location/service';

/**
 * GET /api/locations
 * Fetch all saved locations for the authenticated tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const locations = await getSavedLocations(tenantId);
    return NextResponse.json({ success: true, data: locations });
  } catch (err: any) {
    console.error('[locations-api] GET error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/locations
 * Create a new saved location for the tenant.
 */
export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const supabase = await createServerSupabaseClient();
    
    // Get current authenticated user ID for auditing
    const { data: { user } } = await supabase.auth.getUser();

    const location = await createSavedLocation(tenantId, payload, user?.id);
    return NextResponse.json({ success: true, data: location }, { status: 201 });
  } catch (err: any) {
    console.error('[locations-api] POST error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Bad request' }, { status: 400 });
  }
}
