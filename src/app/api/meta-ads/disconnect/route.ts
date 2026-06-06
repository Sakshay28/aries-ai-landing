// ═══════════════════════════════════════════════════════════
// 🔌 Meta Ads — Disconnect
// ═══════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireConnect, errorResponse } from '@/lib/meta-ads/guard';
import { logAudit } from '@/lib/audit/logger';

export async function POST() {
  try {
    const guard = await requireConnect();
    if (!guard.ok) return guard.response;
    const { tenantId, user } = guard;

    // Cascades to ad_accounts, pages, wa_numbers via FK ON DELETE CASCADE.
    // Campaigns/leads are retained (connection_id not required on them) so
    // historical attribution data survives a disconnect.
    const { error } = await supabaseAdmin
      .from('meta_connections')
      .delete()
      .eq('tenant_id', tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logAudit({
      tenant_id: tenantId,
      actor_id: user.id,
      actor_email: user.email,
      action: 'settings_updated',
      entity: 'meta_connection',
      meta: { event: 'disconnected' },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
