import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';

// GET /api/dashboard/automations/executions
// Returns the execution history (automation_queue) for the current tenant,
// joined with the automation name + lead contact. This IS the execution log:
// every trigger that produced a queue row appears here with its real status.
export async function GET(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const automationId = searchParams.get('automation_id');
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 200);

  let query = supabaseAdmin
    .from('automation_queue')
    .select(`
      id, status, scheduled_at, sent_at, error_message, wa_message_id, created_at,
      automations ( id, name, trigger_event, delay_value, delay_unit ),
      leads ( name, phone )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (automationId) query = query.eq('automation_id', automationId);

  const { data, error } = await query;
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
      created_at: row.created_at,
    };
  });

  return NextResponse.json({ executions });
}
