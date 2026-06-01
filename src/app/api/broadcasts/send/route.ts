import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantId } from '@/lib/auth/getTenantId';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';
import { AuditLogService } from '@/lib/broadcast/services/audit-log.service';
import { ExecutionEventService } from '@/lib/broadcast/services/execution-event.service';
import { TelemetryService } from '@/lib/broadcast/services/telemetry.service';

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId } = await req.json();
    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId required' }, { status: 400 });
    }

    // Get the campaign
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    if (campErr || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status !== 'draft') {
      return NextResponse.json({ success: false, error: 'Campaign is not in draft status' }, { status: 400 });
    }

    // Get tenant config
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_phone_number_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) {
      return NextResponse.json({ success: false, error: 'WhatsApp is not yet active for your account. Contact support.' }, { status: 400 });
    }

    // Launch campaign enqueuing pipeline enwrapped in a telemetry benchmark
    const res = await TelemetryService.benchmarkAsync(tenantId, 'launch_duration', async () => {
      return await BroadcastEngineService.launchCampaign(tenantId, campaignId);
    }, { campaignId });

    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error || 'Failed to initialize campaign enqueuing' }, { status: 500 });
    }

    // Enterprise Logging (Phase 1 & Phase 2)
    const actorId = null; // System user or platform default
    await AuditLogService.logChange(tenantId, campaignId, actorId, 'launch', 'campaign', { status: 'draft' }, { status: 'sending' });
    await ExecutionEventService.logEvent(tenantId, campaignId, 'launch_requested', 'Launch requested', 'Campaign launch process initiated.');
    await ExecutionEventService.logEvent(tenantId, campaignId, 'queue_created', 'Queue initialized', `${res.queuedCount} recipient messages enqueued for dispatch.`);
    await ExecutionEventService.logEvent(tenantId, campaignId, 'sending_started', 'Sending started', 'Rate: 300 messages per minute (5/sec).');

    // Process the first enqueued batch in the background
    after(() => {
      BroadcastEngineService.processQueue(50).catch(err => {
        console.error('❌ Async queue tick failed:', err);
      });
    });

    return NextResponse.json({ success: true, queuedCount: res.queuedCount });
  } catch (error) {
    console.error('Broadcast send error:', error);
    return NextResponse.json({ success: false, error: 'Failed to start sending campaign' }, { status: 500 });
  }
}
