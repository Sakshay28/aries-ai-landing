import { NextRequest, NextResponse, after } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';
import { AuditLogService } from '@/lib/broadcast/services/audit-log.service';
import { ExecutionEventService } from '@/lib/broadcast/services/execution-event.service';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId } = await req.json();
    console.log('[BROADCAST_LAUNCH] Received launch request for campaignId:', campaignId);

    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId is required' }, { status: 400 });
    }

    // 1. Fetch campaign — verify it belongs to this tenant
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (campErr || !campaign) {
      console.error('[BROADCAST_LAUNCH] Campaign not found:', campErr?.message);
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    console.log('[BROADCAST_LAUNCH] Campaign:', campaign.name, 'status:', campaign.status);

    // 2. Verify WhatsApp credentials exist
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_phone_number_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp is not connected. Go to Settings → link your Meta Business account.',
      }, { status: 400 });
    }

    // 3. Handle scheduled campaigns
    const deliveryMode = campaign.delivery_mode || 'now';
    const scheduledAt  = campaign.scheduled_for || null;

    if (deliveryMode === 'scheduled') {
      if (!scheduledAt) {
        return NextResponse.json({ success: false, error: 'Scheduled time is not set' }, { status: 400 });
      }
      if (new Date(scheduledAt).getTime() <= Date.now()) {
        return NextResponse.json({ success: false, error: 'Scheduled time must be in the future' }, { status: 400 });
      }

      await supabaseAdmin
        .from('broadcast_campaigns')
        .update({
          status:            'scheduled',
          is_ready:          true,
          total_recipients:  campaign.audience_count || 0,
          launched_at:       new Date().toISOString(),
          updated_at:        new Date().toISOString(),
        })
        .eq('id', campaignId)
        .eq('tenant_id', tenantId);

      await AuditLogService.logChange(tenantId, campaignId, null, 'schedule', 'campaign', { status: 'draft' }, { status: 'scheduled' });
      await ExecutionEventService.logEvent(tenantId, campaignId, 'campaign_scheduled', 'Campaign scheduled', `Scheduled for ${new Date(scheduledAt).toLocaleString()}`);

      console.log('[BROADCAST_LAUNCH] Scheduled for:', scheduledAt);
      return NextResponse.json({ success: true, status: 'scheduled', scheduledAt, totalRecipients: 0 });
    }

    // 4. Immediate send — resolve audience & populate queue
    const result = await BroadcastEngineService.launchCampaign(tenantId, campaignId);
    console.log('[BROADCAST_LAUNCH] Queue result:', result);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'Failed to queue campaign' }, { status: 500 });
    }

    // 5. Transition campaign to sending
    await supabaseAdmin
      .from('broadcast_campaigns')
      .update({
        status:           'sending',
        is_ready:         true,
        total_recipients: result.queuedCount,
        launched_at:      new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .eq('id', campaignId)
      .eq('tenant_id', tenantId);

    // 6. Observability logs
    await AuditLogService.logChange(tenantId, campaignId, null, 'launch', 'campaign', { status: 'draft' }, { status: 'sending' });
    await ExecutionEventService.logEvent(tenantId, campaignId, 'launch_requested', 'Launch requested', 'Campaign launch initiated.');
    await ExecutionEventService.logEvent(tenantId, campaignId, 'queue_created', 'Queue initialized', `${result.queuedCount} messages queued for dispatch.`);

    // 7. Process queue immediately in background (processes ALL pending, not just 50)
    after(async () => {
      try {
        let remaining = result.queuedCount || 0;
        let iterations = 0;
        const maxIterations = Math.ceil(remaining / 50) + 1;

        while (remaining > 0 && iterations < maxIterations) {
          const processed = await BroadcastEngineService.processQueue(50);
          remaining -= processed;
          iterations++;
          if (processed === 0) break; // nothing left to process
        }

        console.log('[BROADCAST_LAUNCH] Background queue processed all items');
      } catch (err) {
        console.error('[BROADCAST_LAUNCH] Background queue failed:', err);
      }
    });

    console.log('[BROADCAST_LAUNCH] Success — totalRecipients:', result.queuedCount);
    return NextResponse.json({
      success: true,
      status: 'sending',
      totalRecipients: result.queuedCount,
      queuedCount: result.queuedCount,
    });

  } catch (error: any) {
    console.error('[BROADCAST_LAUNCH] Unhandled error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to launch campaign',
    }, { status: 500 });
  }
}
