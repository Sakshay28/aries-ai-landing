// ═══════════════════════════════════════════════════════════
// 📊 Client Dashboard API — Tenant-Scoped
// ═══════════════════════════════════════════════════════════
// All routes require authentication and return only data
// belonging to the authenticated user's tenant.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ApiResponse, DashboardStats } from '@/lib/types';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { getTenantId } from '@/lib/auth/getTenantId';

// Helper: Get tenant_id from authenticated user
export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const rateLimit = await checkRedisRateLimit(`stats:${tenantId}`, 60, 60); // 60 requests per minute
  if (!rateLimit.allowed) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  try {
    // Parallel queries for speed
    const [
      totalLeadsResult,
      newTodayResult,
      activeConvResult,
      confirmedBookingsResult,
      messagesResult,
      leadsByStatusResult,
      leadsByChannelResult,
      tenantResult,
      leadsDataResult,
      messagesDataResult,
    ] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', weekAgo),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', todayStart),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'confirmed'),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', weekAgo),
      supabase.from('leads').select('lead_status').eq('tenant_id', tenantId),
      supabase.from('leads').select('channel').eq('tenant_id', tenantId).gte('created_at', weekAgo),
      supabase.from('tenants').select('messages_used_this_month, message_limit').eq('id', tenantId).single(),
      supabase.from('leads').select('created_at').eq('tenant_id', tenantId).gte('created_at', weekAgo),
      supabase.from('messages').select('created_at').eq('tenant_id', tenantId).gte('created_at', weekAgo),
    ]);

    // Aggregate leads by status
    const statusCounts: Record<string, number> = {};
    (leadsByStatusResult.data || []).forEach((l) => {
      statusCounts[l.lead_status] = (statusCounts[l.lead_status] || 0) + 1;
    });

    // Aggregate leads by channel
    const channelCounts: Record<string, number> = {};
    (leadsByChannelResult.data || []).forEach((l) => {
      channelCounts[l.channel] = (channelCounts[l.channel] || 0) + 1;
    });

    // Compute Daily Leads
    const dailyLeadsMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dailyLeadsMap[d.toISOString().split('T')[0]] = 0;
    }
    (leadsDataResult.data || []).forEach((l) => {
      const date = l.created_at.split('T')[0];
      if (dailyLeadsMap[date] !== undefined) dailyLeadsMap[date]++;
    });
    const dailyLeads = Object.entries(dailyLeadsMap).map(([date, count]) => ({ date, count }));

    // Compute Peak Hour
    const hourCounts: Record<number, number> = {};
    (messagesDataResult.data || []).forEach((m) => {
      const h = new Date(m.created_at).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    let peakHour = 'N/A';
    if (Object.keys(hourCounts).length > 0) {
      const topHour = parseInt(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0]);
      peakHour = `${topHour}:00 - ${topHour + 1}:00`;
    }

    const stats: DashboardStats = {
      totalLeads: totalLeadsResult.count || 0,
      newLeadsToday: newTodayResult.count || 0,
      activeConversations: activeConvResult.count || 0,
      confirmedBookings: confirmedBookingsResult.count || 0,
      conversionRate: totalLeadsResult.count
        ? `${(((confirmedBookingsResult.count || 0) / totalLeadsResult.count) * 100).toFixed(1)}%`
        : '0%',
      messagesThisMonth: tenantResult.data?.messages_used_this_month || 0,
      messageLimit: tenantResult.data?.message_limit || 1000,
      topChannel: Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A',
      peakHour,
      leadsByStatus: Object.entries(statusCounts).map(([status, count]) => ({ status, count })),
      leadsByChannel: Object.entries(channelCounts).map(([channel, count]) => ({ channel, count })),
      dailyLeads,
    };

    return NextResponse.json({ success: true, data: stats } as ApiResponse<DashboardStats>);
  } catch (err) {
    console.error('❌ Stats error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}
