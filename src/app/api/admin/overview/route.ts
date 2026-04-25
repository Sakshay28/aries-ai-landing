// ═══════════════════════════════════════════════════════════
// 🛡️ Admin API — Platform Owner Dashboard
// ═══════════════════════════════════════════════════════════
// Only accessible by platform admins (is_platform_admin=true).
// Shows all clients, revenue, usage, and health metrics.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AdminStats } from '@/lib/types';

// ── Auth guard: platform admin only ──
async function requireAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { authorized: false, error: 'Unauthorized' };

  const { data } = await supabaseAdmin
    .from('users')
    .select('is_platform_admin, email')
    .eq('auth_id', user.id)
    .single();

  if (!data?.is_platform_admin) return { authorized: false, error: 'Admin access required' };
  if (data.email !== process.env.PLATFORM_ADMIN_EMAIL) return { authorized: false, error: 'Admin access blocked by ENV' };
  return { authorized: true };
}

// ═══════════════════════════════════════
// GET /api/admin/overview — Global stats
// ═══════════════════════════════════════
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 });
  }

  try {
    const [
      totalTenantsResult,
      activeTenantsResult,
      totalLeadsResult,
      totalMessagesResult,
      planAggResult,
      recentTenantsResult,
    ] = await Promise.all([
      supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('tenants').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('plan_status', 'active'),
      supabaseAdmin.from('leads').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('messages').select('id', { count: 'exact', head: true }),
      // DB-side aggregate — O(1) regardless of tenant count, no full table scan
      supabaseAdmin.rpc('get_plan_counts'),
      supabaseAdmin.from('tenants').select('id, business_name, business_type, plan, plan_status, messages_used_this_month, message_limit, is_active, created_at, wa_phone_number_id').order('created_at', { ascending: false }).limit(100),
    ]);

    // planAggResult.data is [{plan: 'starter', count: 42}, ...]
    const planRows = (planAggResult.data || []) as { plan: string; count: number }[];

    // Count tenants by plan
    const planCounts: Record<string, number> = {};
    planRows.forEach((row) => {
      planCounts[row.plan] = row.count;
    });

    // Calculate MRR from aggregate — no N rows in memory
    const PLAN_PRICES: Record<string, number> = { starter: 2499, growth: 4999, pro: 9999, enterprise: 25000 };
    const mrr = planRows.reduce((sum, row) => sum + (PLAN_PRICES[row.plan] || 0) * row.count, 0);

    const stats: AdminStats = {
      totalTenants: totalTenantsResult.count || 0,
      activeTenants: activeTenantsResult.count || 0,
      totalLeads: totalLeadsResult.count || 0,
      totalMessages: totalMessagesResult.count || 0,
      mrr,
      trialConversions: 0,
      churnRate: '0%',
      tenantsByPlan: Object.entries(planCounts).map(([plan, count]) => ({ plan, count })),
      revenueByMonth: [],
    };

    return NextResponse.json({
      success: true,
      data: { stats, tenants: recentTenantsResult.data || [] },
    });
  } catch (err) {
    console.error('❌ Admin stats error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch admin stats' }, { status: 500 });
  }
}

// ═══════════════════════════════════════
// POST /api/admin/overview — Create tenant manually
// ═══════════════════════════════════════
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { business_name, business_type, business_email, plan, bot_name } = body;

    if (!business_name) {
      return NextResponse.json({ success: false, error: 'business_name required' }, { status: 400 });
    }

    const { data: tenant, error } = await supabaseAdmin
      .from('tenants')
      .insert({
        business_name,
        business_type: business_type || 'Restaurant',
        business_email,
        plan: plan || 'starter',
        bot_name: bot_name || 'Assistant',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: tenant });
  } catch (err) {
    console.error('❌ Create tenant error:', err);
    return NextResponse.json({ success: false, error: 'Failed to create tenant' }, { status: 500 });
  }
}

// ═══════════════════════════════════════
// PATCH /api/admin/overview — Update tenant
// ═══════════════════════════════════════
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'tenantId required' }, { status: 400 });
    }

    const allowedFields = [
      'business_name', 'business_type', 'business_email', 'business_phone',
      'business_address', 'business_website', 'bot_name', 'bot_personality', 'is_active'
    ];
    
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No allowed fields provided for update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('❌ Update tenant error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update tenant' }, { status: 500 });
  }
}
