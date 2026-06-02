import { NextRequest, NextResponse, after } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BroadcastReadinessService } from '@/lib/broadcast/services/broadcast-readiness.service';
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
    console.log('[launch api] body', { campaignId });
    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId is required' }, { status: 400 });
    }

    // 1. Fetch Readiness
    const readiness = await BroadcastReadinessService.calculateBroadcastReadiness(campaignId);
    if (readiness.blockers.length > 0) {
      return NextResponse.json({ 
        success: false, 
        error: `Cannot launch campaign: ${readiness.blockers.join(', ')}` 
      }, { status: 400 });
    }

    // 2. Fetch Campaign Core
    const { data: campaign, error: campErr } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('tenant_id', tenantId)
      .single();

    console.log('[launch api] campaign fetch', { campaign, error: campErr });

    if (campErr || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    const deliveryMode = readiness.delivery.mode;
    const scheduledAt = readiness.delivery.scheduledAt;

    if (deliveryMode === 'scheduled') {
      // Transition campaign status to scheduled
      await supabaseAdmin
        .from('broadcast_campaigns')
        .update({ 
          status: 'scheduled', 
          is_ready: true,
          updated_at: new Date().toISOString() 
        })
        .eq('id', campaignId)
        .eq('tenant_id', tenantId);

      await AuditLogService.logChange(tenantId, campaignId, null, 'schedule', 'campaign', { status: 'draft' }, { status: 'scheduled' });
      await ExecutionEventService.logEvent(tenantId, campaignId, 'campaign_scheduled', 'Campaign scheduled', `Campaign scheduled to execute at ${new Date(scheduledAt!).toLocaleString()}`);

      console.log('[launch api] success', { status: 'scheduled' });
      return NextResponse.json({ success: true, status: 'scheduled', scheduledAt });
    }

    // 3. Check WhatsApp integration
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_phone_number_id')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) {
      return NextResponse.json({ 
        success: false, 
        error: 'WhatsApp is not yet active for your account. Please link your Meta business phone.' 
      }, { status: 400 });
    }

    // 4. Launch immediate dispatch via engine
    const res = await BroadcastEngineService.launchCampaign(tenantId, campaignId);
    console.log('[launch api] audience resolved', { totalCount: res.queuedCount, error: res.error });
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error || 'Failed to queue campaign' }, { status: 500 });
    }

    console.log('[launch api] recipient insert', { totalCount: res.queuedCount });

    // Transition campaign status to sending/running
    await supabaseAdmin
      .from('broadcast_campaigns')
      .update({
        status: 'sending',
        is_ready: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId)
      .eq('tenant_id', tenantId);

    console.log('[launch api] enqueue', { campaignId });

    // Logging & Observability
    await AuditLogService.logChange(tenantId, campaignId, null, 'launch', 'campaign', { status: 'draft' }, { status: 'sending' });
    await ExecutionEventService.logEvent(tenantId, campaignId, 'launch_requested', 'Launch requested', 'Campaign launch process initiated.');
    await ExecutionEventService.logEvent(tenantId, campaignId, 'queue_created', 'Queue initialized', `${res.queuedCount} recipient messages enqueued for dispatch.`);

    // Process the first queue chunk asynchronously
    after(() => {
      BroadcastEngineService.processQueue(50).catch(err => {
        console.error('❌ Async queue tick failed:', err);
      });
    });

    console.log('[launch api] success', { status: 'sending', totalRecipients: res.queuedCount });
    return NextResponse.json({ success: true, status: 'sending', totalRecipients: res.queuedCount, queuedCount: res.queuedCount });
  } catch (error) {
    console.error('API Launch POST Error:', error);
    return NextResponse.json({ success: false, error: (error as Error).message || 'Failed to launch campaign' }, { status: 500 });
  }
}
