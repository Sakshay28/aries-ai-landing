// ═══════════════════════════════════════════════════════════
// 🚀 Meta Ads — Publish Campaign
// ═══════════════════════════════════════════════════════════
// One-click publish: pushes the draft campaign graph to Meta.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { requireWrite, getConnectionToken, errorResponse } from '@/lib/meta-ads/guard';
import { publishCampaign } from '@/lib/meta-ads/publish';
import { logAudit } from '@/lib/audit/logger';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireWrite();
    if (!guard.ok) return guard.response;
    const { tenantId, user } = guard;
    const { id } = await params;

    const { connection } = await getConnectionToken(tenantId);
    const campaign = await publishCampaign(tenantId, id, connection.access_token);

    logAudit({
      tenant_id: tenantId,
      actor_id: user.id,
      actor_email: user.email,
      action: 'broadcast_sent',
      entity: 'meta_campaign',
      entity_id: id,
      meta: { event: 'published', meta_campaign_id: campaign.meta_campaign_id },
    });

    return NextResponse.json({ campaign });
  } catch (err) {
    return errorResponse(err);
  }
}
