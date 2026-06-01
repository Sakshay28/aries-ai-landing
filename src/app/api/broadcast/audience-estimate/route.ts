import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { AudienceEstimatorService } from '@/lib/broadcast/services/audience-estimator.service';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { audience } = await req.json();
    if (!audience) {
      return NextResponse.json({ success: false, error: 'Audience config is required' }, { status: 400 });
    }

    const estimate = await AudienceEstimatorService.estimateAudience(tenantId, audience);
    return NextResponse.json({ success: true, estimate });
  } catch (error) {
    console.error('API Audience Estimate Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message || 'Failed to estimate audience' }, { status: 500 });
  }
}
