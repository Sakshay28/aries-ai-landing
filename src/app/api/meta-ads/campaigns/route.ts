// ═══════════════════════════════════════════════════════════
// 📋 Meta Ads — Campaigns: List + Create
// ═══════════════════════════════════════════════════════════
// GET  → paginated, filterable, sortable, searchable list with
//        derived metrics (CPL, CPC, ROAS).
// POST → create a draft campaign (+ draft adset & ad) from the wizard.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireUser, requireWrite, errorResponse } from '@/lib/meta-ads/guard';
import { createCampaignSchema, campaignListQuerySchema } from '@/lib/meta-ads/validation';
import { logAudit } from '@/lib/audit/logger';

interface CampaignWithMetrics {
  cost_per_lead: number;
  cost_per_conversation: number;
  roas: number;
  [key: string]: unknown;
}

function deriveMetrics(c: Record<string, any>): CampaignWithMetrics {
  const spend = Number(c.total_spend) || 0;
  const leads = Number(c.total_leads) || 0;
  const conversations = Number(c.total_conversations) || 0;
  const revenue = Number(c.revenue) || 0;
  return {
    ...c,
    cost_per_lead: leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0,
    cost_per_conversation: conversations > 0 ? Math.round((spend / conversations) * 100) / 100 : 0,
    roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
  };
}

export async function GET(req: NextRequest) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;

    const { searchParams } = new URL(req.url);
    const parsed = campaignListQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query', details: parsed.error.flatten() }, { status: 400 });
    }
    const { page, limit, status, search, sort_by, sort_order, date_from, date_to } = parsed.data;

    let query = supabaseAdmin
      .from('meta_campaigns')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId);

    if (status) query = query.eq('status', status);
    if (search) query = query.ilike('name', `%${search}%`);
    if (date_from) query = query.gte('created_at', date_from);
    if (date_to) query = query.lte('created_at', `${date_to}T23:59:59`);

    query = query.order(sort_by, { ascending: sort_order === 'asc' });
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      campaigns: (data || []).map(deriveMetrics),
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

export async function POST(req: NextRequest) {
  try {
    const guard = await requireWrite();
    if (!guard.ok) return guard.response;
    const { tenantId, user } = guard;

    const body = await req.json();
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    // Verify the ad account belongs to this tenant
    const { data: account } = await supabaseAdmin
      .from('meta_ad_accounts')
      .select('id, currency')
      .eq('tenant_id', tenantId)
      .eq('id', input.ad_account_id)
      .maybeSingle();
    if (!account) {
      return NextResponse.json({ error: 'Ad account not found or not owned by tenant' }, { status: 404 });
    }

    // ── Create campaign (draft) ──
    const { data: campaign, error: campaignErr } = await supabaseAdmin
      .from('meta_campaigns')
      .insert({
        tenant_id: tenantId,
        ad_account_id: input.ad_account_id,
        name: input.name,
        objective: input.objective,
        status: 'draft',
        budget_type: input.budget_type,
        budget_amount: input.budget_amount,
        currency: input.currency || account.currency || 'INR',
        start_date: input.start_date || null,
        end_date: input.end_date || null,
        whatsapp_number_id: input.whatsapp_number_id || null,
        page_id: input.page_id || null,
        targeting: input.targeting || {},
      })
      .select('*')
      .single();

    if (campaignErr || !campaign) {
      return NextResponse.json({ error: campaignErr?.message || 'Failed to create campaign' }, { status: 500 });
    }

    // ── Create draft adset ──
    const { data: adset } = await supabaseAdmin
      .from('meta_adsets')
      .insert({
        tenant_id: tenantId,
        campaign_id: campaign.id,
        name: `${input.name} — Ad Set`,
        status: 'draft',
        targeting: input.targeting || {},
        budget_amount: input.budget_amount,
        optimization_goal: input.objective === 'MESSAGES' ? 'CONVERSATIONS' : 'LINK_CLICKS',
      })
      .select('id')
      .single();

    // ── Create draft ad (with creative) if provided ──
    if (input.creative && adset) {
      await supabaseAdmin.from('meta_ads').insert({
        tenant_id: tenantId,
        adset_id: adset.id,
        campaign_id: campaign.id,
        name: `${input.name} — Ad`,
        status: 'draft',
        creative: input.creative,
      });
    }

    logAudit({
      tenant_id: tenantId,
      actor_id: user.id,
      actor_email: user.email,
      action: 'settings_updated',
      entity: 'meta_campaign',
      entity_id: campaign.id,
      new_value: { name: input.name, objective: input.objective },
    });

    return NextResponse.json({ campaign: deriveMetrics(campaign) }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
