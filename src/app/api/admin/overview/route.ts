import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export async function GET() {
  const me = await getCurrentUser();
  if (!me?.is_platform_admin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const [tenantsRes, leadsRes, messagesRes] = await Promise.all([
    supabaseAdmin
      .from('tenants')
      .select('id, business_name, business_type, plan, plan_status, messages_used_this_month, message_limit, is_active, created_at, wa_phone_number_id')
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('messages').select('id', { count: 'exact', head: true }),
  ]);

  const tenants = tenantsRes.data || [];
  const totalLeads = leadsRes.count || 0;
  const totalMessages = messagesRes.count || 0;

  const PLAN_PRICES: Record<string, number> = {
    starter: 999,
    growth: 2499,
    pro: 4999,
    enterprise: 9999,
  };

  const activeTenants = tenants.filter(t => t.is_active && t.plan_status === 'active');
  const mrr = activeTenants.reduce((sum, t) => sum + (PLAN_PRICES[t.plan] || 0), 0);

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
