import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

const PLAN_PRICES: Record<string, number> = {
  starter: 999,
  growth: 2499,
  pro: 4999,
  enterprise: 9999,
};

export async function GET() {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const [tenantsRes, leadsRes, messagesRes] = await Promise.all([
    supabaseAdmin
      .from('tenants')
      .select('id, business_name, business_type, plan, plan_status, messages_used_this_month, message_limit, is_active, created_at, wa_phone_number_id, monthly_price, parent_tenant_id')
      .is('parent_tenant_id', null)
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('messages').select('id', { count: 'exact', head: true }),
  ]);

  const tenants = tenantsRes.data || [];
  const totalLeads = leadsRes.count || 0;
  const totalMessages = messagesRes.count || 0;

  const activeTenants = tenants.filter(t => t.is_active && t.plan_status === 'active');
  const mrr = activeTenants.reduce((sum, t) => sum + (t.monthly_price ?? PLAN_PRICES[t.plan] ?? 0), 0);

  const planCounts: Record<string, number> = {};
  for (const t of tenants) {
    planCounts[t.plan] = (planCounts[t.plan] || 0) + 1;
  }

  return NextResponse.json({
    success: true,
    data: {
      stats: {
        totalTenants: tenants.length,
        activeTenants: activeTenants.length,
        totalLeads,
        totalMessages,
        mrr,
        tenantsByPlan: Object.entries(planCounts).map(([plan, count]) => ({ plan, count })),
      },
      tenants,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { tenant_id, monthly_price, plan, plan_status } = body;
  if (!tenant_id) {
    return NextResponse.json({ success: false, error: 'tenant_id required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (monthly_price !== undefined) updates.monthly_price = monthly_price;
  if (plan) updates.plan = plan;
  if (plan_status) updates.plan_status = plan_status;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('tenants')
    .update(updates)
    .eq('id', tenant_id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
