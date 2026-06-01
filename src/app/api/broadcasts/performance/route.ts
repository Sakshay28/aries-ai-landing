import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { PerformanceIntelligenceService } from '@/lib/broadcast/services/performance-intelligence.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const stats = await PerformanceIntelligenceService.getPerformanceStats(tenantId);

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('Performance stats fetch error:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
