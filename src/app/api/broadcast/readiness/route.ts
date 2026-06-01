import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { BroadcastReadinessService } from '@/lib/broadcast/services/broadcast-readiness.service';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId is required' }, { status: 400 });
    }

    const readiness = await BroadcastReadinessService.calculateBroadcastReadiness(campaignId);
    return NextResponse.json({ success: true, ...readiness });
  } catch (error) {
    console.error('API Readiness GET Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message || 'Failed to calculate readiness' }, { status: 500 });
  }
}
