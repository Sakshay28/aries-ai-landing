import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { syncAllLeadsToExcel } from '@/lib/integrations/microsoft-excel';

export async function POST() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await syncAllLeadsToExcel(tenantId);
    return NextResponse.json({ synced: result.synced });
  } catch (err: any) {
    console.error('❌ [EXCEL sync all] error:', err.message);
    return NextResponse.json({ error: err.message || 'Sync failed' }, { status: 500 });
  }
}
