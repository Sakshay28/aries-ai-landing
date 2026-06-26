import { NextRequest, NextResponse, after } from 'next/server';
import { getTenantId } from '@/lib/auth/getTenantId';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';
import { AuditLogService } from '@/lib/broadcast/services/audit-log.service';
import { ExecutionEventService } from '@/lib/broadcast/services/execution-event.service';
import { checkBroadcastCap, checkLaunchRateLimit } from '@/lib/abuse/prevention';

export const maxDuration = 60;

const LAUNCH_ROLES = new Set(['owner', 'admin', 'manager']);

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getTenantId();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Role gate: launching a broadcast sends real messages and consumes quota.
    // Restrict to owner/admin/manager (getCurrentUser is request-cached, so the
    // later getCurrentUser() calls reuse this result).
    const launchUser = await getCurrentUser();
    if (!launchUser || !LAUNCH_ROLES.has(launchUser.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden: insufficient permissions to launch broadcasts' }, { status: 403 });
    }

    // Rate limit — 5 launches per tenant per 10 min
    const rl = await checkLaunchRateLimit(tenantId);
    if (!rl.allowed) {
      return NextResponse.json({ success: false, error: 'Too many launch attempts. Please wait a few minutes.' }, { status: 429 });
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

    // 2. Guard against re-launching an already active or completed campaign (prevents duplicate sends)
    if (!['draft', 'scheduled', 'launching'].includes(campaign.status)) {
      return NextResponse.json({
        success: false,
        error: `Campaign is already "${campaign.status}" and cannot be re-launched. Duplicate sends prevented.`,
      }, { status: 409 });
    }

    // 3. Verify WhatsApp credentials exist
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('wa_access_token, wa_phone_number_id, plan')
      .eq('id', tenantId)
      .single();

    if (!tenant?.wa_access_token || !tenant?.wa_phone_number_id) {
      return NextResponse.json({
        success: false,
        error: 'WhatsApp is not connected. Go to Settings → link your Meta Business account.',
      }, { status: 400 });
    }

    // 3b. Enforce the plan's broadcast recipient cap at launch time.
    const recipientCount = campaign.audience_count ?? 0;
    const cap = checkBroadcastCap(tenant.plan ?? 'starter', recipientCount);
    if (!cap.allowed) {
      return NextResponse.json({
        success: false,
        error: `This campaign targets ${recipientCount.toLocaleString()} recipients, which exceeds your plan limit of ${cap.cap.toLocaleString()}. Upgrade your plan or reduce the audience.`,
      }, { status: 403 });
    }

    // 4. Handle scheduled campaigns
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

      const schedulingUser = await getCurrentUser();
      await AuditLogService.logChange(tenantId, campaignId, schedulingUser?.id ?? null, 'schedule', 'campaign', { status: 'draft' }, { status: 'scheduled' });
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

    // 5. Set launch metadata — status is already 'sending' (set by BroadcastEngineService).
    //    Only update supplementary fields to avoid a redundant status write.
    await supabaseAdmin
      .from('broadcast_campaigns')
      .update({
        is_ready:         true,
        total_recipients: result.queuedCount,
        launched_at:      new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .eq('id', campaignId)
      .eq('tenant_id', tenantId);

    // 6. Observability logs
    const currentUser = await getCurrentUser();
    const actorId = currentUser?.id ?? null;
    await AuditLogService.logChange(tenantId, campaignId, actorId, 'launch', 'campaign', { status: 'draft' }, { status: 'sending' });
    await ExecutionEventService.logEvent(tenantId, campaignId, 'launch_requested', 'Launch requested', 'Campaign launch initiated.');
    await ExecutionEventService.logEvent(tenantId, campaignId, 'queue_created', 'Queue initialized', `${result.queuedCount} messages queued for dispatch.`);

    // 7. Send a SMALL first batch inline for instant UI feedback (a few sends show
    //    up immediately), then hand off to the persistent worker which drains the
    //    rest in per-tenant parallel lanes. We no longer try to process the whole
    //    campaign in after() — that was over the Vercel time budget for large
    //    audiences and relied on fragile self-chaining. The cron backstop poke
    //    covers the case where the worker is momentarily down.
    after(async () => {
      try {
        await BroadcastEngineService.processQueue(20);
      } catch (err) {
        console.error('[BROADCAST_LAUNCH] inline first-batch failed:', err);
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
      const cronSecret = process.env.CRON_SECRET;
      if (appUrl && cronSecret) {
        fetch(`${appUrl}/api/broadcast/process-queue`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${cronSecret}` },
        }).catch(() => {});
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
