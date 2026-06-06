// ═══════════════════════════════════════════════════════════
// 👤 Meta Ads — Single Lead: profile + attribution timeline
// ═══════════════════════════════════════════════════════════
// GET   → lead + campaign + full attribution timeline
// PATCH → update lead status
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireUser, requireWrite, errorResponse } from '@/lib/meta-ads/guard';
import { leadStatuses } from '@/lib/meta-ads/validation';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;
    const { id } = await params;

    const { data: lead, error } = await supabaseAdmin
      .from('campaign_leads')
      .select('*, meta_campaigns(name, objective, status)')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

    const { data: timeline } = await supabaseAdmin
      .from('lead_attribution')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('campaign_lead_id', id)
      .order('created_at', { ascending: true });

    return NextResponse.json({ lead, timeline: timeline || [] });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireWrite();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;
    const { id } = await params;

    const body = await req.json();
    const status = body.status as string;
    if (!leadStatuses.includes(status as typeof leadStatuses[number])) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('campaign_leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lead: data });
  } catch (err) {
    return errorResponse(err);
  }
}
