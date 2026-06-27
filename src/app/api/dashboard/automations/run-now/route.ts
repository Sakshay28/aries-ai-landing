import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { processPendingAutomations } from '@/lib/automations/engine';

// POST /api/dashboard/automations/run-now
// Force a scheduled (pending) queue item to fire immediately (L3): pull its
// scheduled_at forward to now and kick a drain. Tenant-scoped — you can only
// fast-forward your own pending items.
export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { queue_id } = await req.json().catch(() => ({}));
  if (!queue_id) return NextResponse.json({ error: 'queue_id is required' }, { status: 400 });

  // Only a pending item belonging to this tenant can be fast-forwarded.
  const { data, error } = await supabaseAdmin
    .from('automation_queue')
    .update({ scheduled_at: new Date().toISOString(), claimed_at: null, error_message: null })
    .eq('id', queue_id)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .select('id')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'No pending item with that id (already sent, cancelled, or not yours)' }, { status: 404 });
  }

  // Drain immediately so the item goes out now instead of waiting for the tick.
  const sent = await processPendingAutomations();
  return NextResponse.json({ success: true, drained: sent });
}
