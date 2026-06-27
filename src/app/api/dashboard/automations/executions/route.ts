import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

// GET /api/dashboard/automations/executions
// Execution history (automation_queue) for the tenant, joined with the
// automation name + lead contact. Supports pagination (M3) and status filtering
// so busy tenants can page past the first screen instead of losing old history.
export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const automationId = searchParams.get('automation_id');
  const status = searchParams.get('status');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);

  let query = supabaseAdmin
    .from('automation_queue')
    .select(`
      id, status, scheduled_at, sent_at, error_message, wa_message_id, variables, variant, created_at,
      automations ( id, name, trigger_event, delay_value, delay_unit ),
      leads ( name, phone )
    `, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (automationId) query = query.eq('automation_id', automationId);
  if (status && ['pending', 'processing', 'sent', 'cancelled', 'failed'].includes(status)) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const executions = (data || []).map((row: any) => {
    const a = row.automations;
    const l = row.leads;
    return {
      id: row.id,
      contact_name: l?.name || null,
      contact_phone: l?.phone || null,
      automation_name: a?.name || '(deleted)',
      trigger_event: a?.trigger_event || null,
      delay: a ? `${a.delay_value} ${a.delay_unit}` : null,
      status: row.status,                  // pending | processing | sent | cancelled | failed
      scheduled_at: row.scheduled_at,
      sent_at: row.sent_at,
      error: row.error_message,
      wa_message_id: row.wa_message_id,
      variant: row.variant,
      variables: row.variables,
      created_at: row.created_at,
    };
  });

  const total = count ?? executions.length;
  return NextResponse.json({
    executions,
    total,
    offset,
    limit,
    hasMore: offset + executions.length < total,
  });
}
