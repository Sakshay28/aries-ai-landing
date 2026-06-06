// ═══════════════════════════════════════════════════════════
// 🔄 Meta Ads — Manual Asset Re-sync
// ═══════════════════════════════════════════════════════════
// Re-discovers ad accounts, pages, IG, and WhatsApp numbers from
// the Graph API using the stored connection token.
// ═══════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { requireConnect, getConnectionToken, errorResponse } from '@/lib/meta-ads/guard';
import { syncMetaAssets } from '@/lib/meta-ads/sync';

export async function POST() {
  try {
    const guard = await requireConnect();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    const { connection, token } = await getConnectionToken(tenantId);
    const result = await syncMetaAssets(tenantId, connection.id, token, connection.business_id);

    return NextResponse.json({ success: true, synced: result });
  } catch (err) {
    return errorResponse(err);
  }
}
