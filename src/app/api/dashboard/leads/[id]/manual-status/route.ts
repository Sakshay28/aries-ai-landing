// PATCH /api/dashboard/leads/[id]/manual-status
// Set a manual status override so the engine never overwrites the sales team's CRM judgement.
//
// DELETE /api/dashboard/leads/[id]/manual-status
// Clear the manual override and let the engine resume automatic scoring.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { logStatusChange } from '@/lib/scoring/event-logger';

const VALID_MANUAL_STATUSES = new Set([
  'cold', 'warm', 'hot', 'qualified', 'converted', 'lost',
]);

// Set manual status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: leadId } = await params;
  const body = await req.json().catch(() => ({}));
  const { status, reason } = body as { status: string; reason?: string };

  if (!status || !VALID_MANUAL_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${[...VALID_MANUAL_STATUSES].join(', ')}` },
      { status: 400 },
    );
  }

  // Verify lead belongs to tenant
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, lead_status, auto_status, manual_status')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const prevStatus = lead.manual_status ?? lead.lead_status;

  const { error } = await supabaseAdmin
    .from('leads')
    .update({
      manual_status:    status,
      manual_status_at: new Date().toISOString(),
      lead_status:      status, // effective_status = manual
    })
    .eq('id', leadId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log the manual override to status history
  logStatusChange({
    tenantId,
    leadId,
    fromStatus: prevStatus,
    toStatus:   status,
    trigger:    'manual',
    reason:     reason ?? 'Manual override by team member',
  }).catch(console.error);

  return NextResponse.json({ success: true, lead_status: status, manual_status: status });
}

// Clear manual override
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tenantId = await getTenantId();
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: leadId } = await params;

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, lead_status, auto_status, manual_status')
    .eq('id', leadId)
    .eq('tenant_id', tenantId)
    .single();

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  // Restore auto_status as the effective status
  const restoreStatus = (lead.auto_status ?? lead.lead_status) as string;

  const { error } = await supabaseAdmin
    .from('leads')
    .update({
      manual_status:    null,
      manual_status_at: null,
      lead_status:      restoreStatus,
    })
    .eq('id', leadId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logStatusChange({
    tenantId,
    leadId,
    fromStatus: lead.manual_status,
    toStatus:   restoreStatus,
    trigger:    'manual',
    reason:     'Manual override cleared — reverting to engine score',
  }).catch(console.error);

  return NextResponse.json({ success: true, lead_status: restoreStatus, manual_status: null });
}
