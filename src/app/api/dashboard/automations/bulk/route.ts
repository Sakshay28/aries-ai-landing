import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

// POST /api/dashboard/automations/bulk
// Bulk enable / disable / delete (L4). Tenant-scoped. Disable and delete also
// cancel any pending queue items so nothing fires for paused/removed rules.
const ACTIONS = ['enable', 'disable', 'delete'] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenantId = user.tenant_id;

  const { action, ids } = await req.json().catch(() => ({}));
  if (!ACTIONS.includes(action as Action)) {
    return NextResponse.json({ error: `action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
  }
  // Cap to keep a single request bounded.
  const targetIds = ids.slice(0, 200).filter((x) => typeof x === 'string');
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { updated_at: now, updated_by: user.id };
  if (action === 'enable') patch.status = 'active';
  if (action === 'disable') patch.status = 'paused';
  if (action === 'delete') { patch.status = 'paused'; patch.deleted_at = now; }

  const { data, error } = await supabaseAdmin
    .from('automations')
    .update(patch)
    .in('id', targetIds)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const affectedIds = (data || []).map((r) => r.id);

  // Cancel pending queue items for disabled/deleted automations.
  if ((action === 'disable' || action === 'delete') && affectedIds.length > 0) {
    await supabaseAdmin
      .from('automation_queue')
      .update({ status: 'cancelled', error_message: action === 'delete' ? 'Automation deleted' : 'Automation paused' })
      .in('automation_id', affectedIds)
      .eq('status', 'pending');
  }

  return NextResponse.json({ success: true, affected: affectedIds.length });
}
