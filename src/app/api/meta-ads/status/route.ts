// ═══════════════════════════════════════════════════════════
// 📊 Meta Ads — Connection Status
// ═══════════════════════════════════════════════════════════
// Returns the full connection summary for the settings UI:
// FB account, business manager, ad accounts, pages, IG, WA numbers,
// plus live token health (and auto-flags needs_reauth).
// ═══════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireUser, errorResponse } from '@/lib/meta-ads/guard';
import { validateTokenHealth } from '@/lib/meta-ads/oauth';
import type { ConnectionStatusSummary } from '@/lib/meta-ads/types';

export async function GET() {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    const { data: connection } = await supabaseAdmin
      .from('meta_connections')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!connection) {
      const empty: ConnectionStatusSummary = {
        facebook: 'not_connected',
        business_manager: 'not_connected',
        ad_accounts: { count: 0, selected: 0 },
        pages: { count: 0, selected: 0 },
        whatsapp_numbers: { count: 0, selected: 0 },
        instagram: { count: 0 },
        connection: null,
      };
      return NextResponse.json(empty);
    }

    // Live token health check — update status if expiring/invalid
    let status = connection.status;
    try {
      const health = await validateTokenHealth(connection.access_token, tenantId);
      if (!health.valid) {
        status = 'needs_reauth';
      } else if (health.needs_refresh) {
        status = 'needs_reauth';
      }
      if (status !== connection.status) {
        await supabaseAdmin
          .from('meta_connections')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', connection.id);
      }
    } catch {
      // Network hiccup — keep stored status
    }

    const [adAccounts, pages, waNumbers] = await Promise.all([
      supabaseAdmin.from('meta_ad_accounts').select('id, is_selected, instagram_id', { count: 'exact' }).eq('tenant_id', tenantId),
      supabaseAdmin.from('meta_pages').select('id, is_selected, instagram_id', { count: 'exact' }).eq('tenant_id', tenantId),
      supabaseAdmin.from('meta_whatsapp_numbers').select('id, is_selected', { count: 'exact' }).eq('tenant_id', tenantId),
    ]);

    const igCount = (pages.data || []).filter((p) => p.instagram_id).length;

    const summary: ConnectionStatusSummary = {
      facebook: status === 'connected' ? 'connected' : status,
      business_manager: connection.business_id ? (status === 'connected' ? 'connected' : status) : 'not_connected',
      ad_accounts: {
        count: adAccounts.count || 0,
        selected: (adAccounts.data || []).filter((a) => a.is_selected).length,
      },
      pages: {
        count: pages.count || 0,
        selected: (pages.data || []).filter((p) => p.is_selected).length,
      },
      whatsapp_numbers: {
        count: waNumbers.count || 0,
        selected: (waNumbers.data || []).filter((w) => w.is_selected).length,
      },
      instagram: { count: igCount },
      connection: {
        ...connection,
        status,
        access_token: '••••••••', // never leak token to client
      },
    };

    return NextResponse.json(summary);
  } catch (err) {
    return errorResponse(err);
  }
}
