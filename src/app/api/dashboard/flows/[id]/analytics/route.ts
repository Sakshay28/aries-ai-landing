import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const flowId = params.id;
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') ?? '30', 10);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    // ── 1. Overall flow execution stats ────────────────────────────────────
    const { data: execLogs } = await supabaseAdmin
      .from('flow_execution_logs')
      .select('outcome, duration_ms, created_at')
      .eq('tenant_id', tenantId)
      .eq('flow_id', flowId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000);

    const logs = execLogs ?? [];
    const totalRuns   = logs.length;
    const completed   = logs.filter(l => l.outcome === 'completed').length;
    const handoff     = logs.filter(l => l.outcome === 'handoff').length;
    const errors      = logs.filter(l => l.outcome === 'error').length;
    const waiting     = logs.filter(l => l.outcome === 'wait').length;
    const completionRate = totalRuns > 0 ? Math.round((completed / totalRuns) * 100) : 0;
    const avgDuration = totalRuns > 0
      ? Math.round(logs.reduce((s, l) => s + (l.duration_ms ?? 0), 0) / totalRuns)
      : 0;

    // Daily run counts (last N days)
    const dailyMap: Record<string, number> = {};
    for (const log of logs) {
      const day = log.created_at?.slice(0, 10) ?? '';
      if (day) dailyMap[day] = (dailyMap[day] ?? 0) + 1;
    }
    const dailyRuns = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // ── 2. Per-node entry counts (funnel) ──────────────────────────────────
    const { data: traceRows } = await supabaseAdmin
      .from('conversation_traces')
      .select('node_id, node_type, action')
      .eq('tenant_id', tenantId)
      .eq('flow_id', flowId)
      .eq('action', 'node_executed')
      .gte('created_at', since)
      .limit(50000);

    const nodeCountMap: Record<string, { count: number; nodeType: string }> = {};
    for (const row of traceRows ?? []) {
      if (!row.node_id) continue;
      if (!nodeCountMap[row.node_id]) {
        nodeCountMap[row.node_id] = { count: 0, nodeType: row.node_type ?? '' };
      }
      nodeCountMap[row.node_id].count++;
    }
    const maxCount = Math.max(...Object.values(nodeCountMap).map(v => v.count), 1);
    const nodeStats = Object.entries(nodeCountMap).map(([nodeId, v]) => ({
      nodeId,
      nodeType: v.nodeType,
      count: v.count,
      pct: Math.round((v.count / maxCount) * 100),
    })).sort((a, b) => b.count - a.count);

    // ── 3. Most-failed node (from 'node_error' action) ─────────────────────
    const { data: errorRows } = await supabaseAdmin
      .from('conversation_traces')
      .select('node_id, node_type')
      .eq('tenant_id', tenantId)
      .eq('flow_id', flowId)
      .eq('action', 'node_error')
      .gte('created_at', since)
      .limit(5000);

    const errorMap: Record<string, number> = {};
    for (const row of errorRows ?? []) {
      if (row.node_id) errorMap[row.node_id] = (errorMap[row.node_id] ?? 0) + 1;
    }
    const mostFailedNodeId = Object.entries(errorMap).sort(([,a],[,b]) => b - a)[0]?.[0] ?? null;

    return NextResponse.json({
      success: true,
      data: {
        totalRuns,
        completionRate,
        avgDuration,
        outcomes: { completed, handoff, errors, waiting },
        dailyRuns,
        nodeStats,
        mostFailedNodeId,
      },
    });
  } catch (err) {
    console.error('analytics route error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
