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
    const convId = url.searchParams.get('conversation_id');

    if (convId) {
      // ── Detailed replay for one conversation ──────────────────────────────
      const { data: traces } = await supabaseAdmin
        .from('conversation_traces')
        .select('node_id, node_type, action, payload, latency_ms, created_at')
        .eq('tenant_id', tenantId)
        .eq('flow_id', flowId)
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(500);

      return NextResponse.json({ success: true, data: { traces: traces ?? [] } });
    }

    // ── List recent executions ──────────────────────────────────────────────
    const { data: logs } = await supabaseAdmin
      .from('flow_execution_logs')
      .select('id, conversation_id, outcome, duration_ms, total_nodes, node_path, created_at')
      .eq('tenant_id', tenantId)
      .eq('flow_id', flowId)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({ success: true, data: { executions: logs ?? [] } });
  } catch (err) {
    console.error('executions route error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
