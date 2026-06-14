import { NextRequest, NextResponse } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { AuditLogService } from '@/lib/broadcast/services/audit-log.service';
import { ExecutionEventService } from '@/lib/broadcast/services/execution-event.service';

const CANCEL_ROLES = new Set(['owner', 'admin', 'manager']);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getCurrentUser();
    if (!user || !CANCEL_ROLES.has(user.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden: insufficient permissions' }, { status: 403 });
    }

    const { id: campaignId } = await params;

    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('id, status, name')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (campErr || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    if (['completed', 'cancelled', 'failed'].includes(campaign.status)) {
      return NextResponse.json({
        success: false,
        error: `Campaign is already "${campaign.status}" and cannot be cancelled.`,
      }, { status: 409 });
    }

    const previousStatus = campaign.status;
    const now = new Date().toISOString();

    // 1. Stop the sends FIRST — cancel all pending/retrying/processing queue items.
    //    This is the safety-critical action and must happen even if the status
    //    write below fails for any reason.
    const { data: cancelledRows } = await supabaseAdmin
      .from('broadcast_queue')
      .update({ status: 'cancelled', locked_at: null, processed_at: now })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'retrying', 'processing'])
      .select('id');
    const cancelledCount = cancelledRows?.length ?? 0;

    // 2. Transition campaign to cancelled. Error-check this write: a swallowed
    //    error here (e.g. a status CHECK-constraint rejection) used to leave the
    //    campaign stuck on 'sending' while still returning success to the client.
    const { error: statusErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', campaignId)
      .eq('tenant_id', tenantId);

    if (statusErr) {
      console.error(`[BROADCAST_CANCEL] Queue aborted (${cancelledCount} items) but status write failed:`, statusErr.message);
      return NextResponse.json({
        success: false,
        cancelledMessages: cancelledCount,
        error: `Sends were stopped (${cancelledCount} queued messages aborted), but the campaign status could not be updated: ${statusErr.message}`,
      }, { status: 500 });
    }

    // 3. Audit trail
    await AuditLogService.logChange(
      tenantId, campaignId, user.id, 'cancel', 'campaign',
      { status: previousStatus },
      { status: 'cancelled' }
    );
    await ExecutionEventService.logEvent(
      tenantId, campaignId, 'campaign_cancelled', 'Campaign cancelled',
      `Cancelled by ${user.role}. ${cancelledCount ?? 0} queued messages aborted.`,
      'warning'
    );

    console.log(`[BROADCAST_CANCEL] Campaign ${campaignId} cancelled. ${cancelledCount ?? 0} queue items aborted.`);

    return NextResponse.json({
      success: true,
      status: 'cancelled',
      cancelledMessages: cancelledCount ?? 0,
    });

  } catch (error: any) {
    console.error('[BROADCAST_CANCEL] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to cancel campaign',
    }, { status: 500 });
  }
}
