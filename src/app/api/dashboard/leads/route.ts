// ═══════════════════════════════════════════════════════════
// 👤 Leads API — Tenant-Scoped CRUD
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { cancelLeadFollowUps } from '@/lib/followup/engine';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: true, data: [], total: 0, page: 1, limit: 50, hasMore: false });
  }

  const supabase = await createServerSupabaseClient();
  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') || '50');
  const page = parseInt(searchParams.get('page') || '1');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('leads')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('lead_status', status);

  const { data, error, count } = await query;

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    data,
    total: count || 0,
    page,
    limit,
    hasMore: (count || 0) > offset + limit,
  });
}

// PATCH /api/dashboard/leads — Update lead status
export async function PATCH(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { leadId, status, notes, staff_assigned } = body;

  if (!leadId) return NextResponse.json({ success: false, error: 'leadId required' }, { status: 400 });

  const supabase = await createServerSupabaseClient();
  const updates: Record<string, unknown> = {};

  if (status) {
    const validStatuses = ['new', 'hot', 'warm', 'cold', 'converted', 'lost'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
    }
    updates.lead_status = status;

    // Cancel follow-ups if converted or lost
    if (status === 'converted' || status === 'lost') {
      await cancelLeadFollowUps(leadId);
      if (status === 'converted') updates.converted_at = new Date().toISOString();
    }
  }

  if (notes !== undefined) updates.notes = notes;
  if (staff_assigned !== undefined) updates.staff_assigned = staff_assigned;

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', leadId)
    .eq('tenant_id', tenantId) // Ensure tenant isolation
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
