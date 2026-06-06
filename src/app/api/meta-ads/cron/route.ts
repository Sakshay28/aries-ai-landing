// ═══════════════════════════════════════════════════════════
// ⏰ Meta Ads Insights Sync Cron
// ═══════════════════════════════════════════════════════════
// Runs daily via vercel.json cron (or manual trigger).
// Iterates every connected tenant and pulls yesterday's
// campaign insights from Meta into campaign_analytics.
// Authorization: Bearer CRON_SECRET
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { syncCampaignInsights } from '@/lib/meta-ads/insights';
import { validateTokenHealth } from '@/lib/meta-ads/oauth';

function yesterday(): { from: string; to: string } {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const s = d.toISOString().split('T')[0];
  return { from: s, to: s };
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { from, to } = yesterday();
  const results: { tenant_id: string; status: string; campaigns_synced?: number; error?: string }[] = [];

  // Load all connected tenants
  const { data: connections } = await supabaseAdmin
    .from('meta_connections')
    .select('tenant_id, access_token, status')
    .eq('status', 'connected');

  for (const conn of connections || []) {
    try {
      // Quick health check — skip if token invalid
      const health = await validateTokenHealth(conn.access_token).catch(() => ({ valid: false }));
      if (!health.valid) {
        await supabaseAdmin
          .from('meta_connections')
          .update({ status: 'needs_reauth', updated_at: new Date().toISOString() })
          .eq('tenant_id', conn.tenant_id);
        results.push({ tenant_id: conn.tenant_id, status: 'skipped_invalid_token' });
        continue;
      }

      const { campaigns_synced } = await syncCampaignInsights(conn.tenant_id, conn.access_token, from, to);
      results.push({ tenant_id: conn.tenant_id, status: 'ok', campaigns_synced });
    } catch (err) {
      results.push({
        tenant_id: conn.tenant_id,
        status: 'error',
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  return NextResponse.json({ date: from, results });
}

// Allow manual trigger from dashboard (same auth)
export { POST as GET };
