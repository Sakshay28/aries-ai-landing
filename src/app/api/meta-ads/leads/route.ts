// ═══════════════════════════════════════════════════════════
// 👥 Meta Ads — Campaign Leads: List
// ═══════════════════════════════════════════════════════════
// Paginated list of leads acquired through Meta ads, with their
// campaign attribution joined in.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireUser, errorResponse } from '@/lib/meta-ads/guard';

export async function GET(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const campaignId = searchParams.get('campaign_id');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    let query = supabaseAdmin
      .from('campaign_leads')
      .select('*, meta_campaigns(name, objective)', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (campaignId) query = query.eq('campaign_id', campaignId);
    if (status) query = query.eq('status', status);
    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);

    query = query
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      leads: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
