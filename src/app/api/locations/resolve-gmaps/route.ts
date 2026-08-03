import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { resolveGoogleMapsUrl } from '@/lib/location/service';
import { googleMapsUrlSchema } from '@/lib/types/location';

/**
 * POST /api/locations/resolve-gmaps
 * Resolves a Google Maps link into coordinates, name, and address.
 */
export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ success: false, error: 'URL is required' }, { status: 400 });
    }

    // Validate URL shape
    const validatedUrl = googleMapsUrlSchema.parse(url);

    const resolved = await resolveGoogleMapsUrl(validatedUrl);
    return NextResponse.json({ success: true, data: resolved });
  } catch (err: any) {
    console.error('[resolve-gmaps-api] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to resolve URL' }, { status: 400 });
  }
}
