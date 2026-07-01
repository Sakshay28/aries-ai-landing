import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({
      success: true,
      data: {
        totalMessages: 0, messagesThisWeek: 0,
        totalConversations: 0, conversationsToday: 0,
        avgResponseTimeSec: null,
        hoursSaved: 0, automationPct: 0,
        tenantId: null,
      },
    });
  }

  const rateLimit = await checkRedisRateLimit(`kpi-stats:${tenantId}`, 60, 60);
  if (!rateLimit.allowed) {
    return NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 });
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const [
      totalMsgsResult,
      weekMsgsResult,
      totalConvsResult,
      todayConvsResult,
      latencyResult,
      aiHandledResult,
    ] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', weekAgo),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('created_at', todayStart),
      supabase.from('messages').select('ai_latency_ms').eq('tenant_id', tenantId).eq('ai_generated', true).not('ai_latency_ms', 'is', null).gte('created_at', last24h).limit(500),
      supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('escalated', false),
    ]);

    const totalMessages = totalMsgsResult.count ?? 0;
    const messagesThisWeek = weekMsgsResult.count ?? 0;
    const totalConversations = totalConvsResult.count ?? 0;
    const conversationsToday = todayConvsResult.count ?? 0;
    const aiHandledConversations = aiHandledResult.count ?? 0;

    const latencies = (latencyResult.data ?? []).map(r => r.ai_latency_ms as number).filter(v => v > 0);
    const avgResponseTimeSec = latencies.length >= 1
      ? Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) / 100) / 10
      : null;

    const AVG_MANUAL_MINUTES = 4;
    const hoursSaved = Math.round(aiHandledConversations * AVG_MANUAL_MINUTES / 60);
    const automationPct = totalConversations > 0
      ? Math.round((aiHandledConversations / totalConversations) * 100)
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        totalMessages, messagesThisWeek,
        totalConversations, conversationsToday,
        avgResponseTimeSec,
        hoursSaved, automationPct,
        tenantId,
      },
    });
  } catch (err) {
    console.error('❌ KPI stats error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch KPI stats' }, { status: 500 });
  }
}
