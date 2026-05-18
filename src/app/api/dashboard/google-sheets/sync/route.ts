// POST /api/dashboard/google-sheets/sync
// Triggers a full re-sync of all tenant leads to their connected Google Sheet.

import { NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { syncAllLeads } from '@/lib/integrations/google-sheets';

export async function POST() {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await syncAllLeads(tenantId);
    return NextResponse.json({ success: true, synced: result.synced });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('not connected')) {
      return NextResponse.json({ error: 'Google Sheets not connected' }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
