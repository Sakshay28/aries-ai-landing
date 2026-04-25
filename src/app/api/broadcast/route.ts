// ═══════════════════════════════════════════════════════════
// 📢 Broadcast API — Send bulk messages with rate limiting
// ═══════════════════════════════════════════════════════════
// Sends template messages to filtered lead segments.
// Rate-limited to comply with WhatsApp's throughput limits.
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isWhatsAppConfigured } from '@/lib/whatsapp/service';
import { getTenantById } from '@/lib/tenant/manager';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { enqueueBroadcast } from '@/lib/broadcast/queue';
import { getTenantId } from '@/lib/auth/getTenantId';

export async function POST(req: NextRequest) {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit: max 5 broadcasts per hour per tenant
  const rateCheck = await checkRedisRateLimit(`broadcast:${tenantId}`, 5, 3600);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: 'Broadcast rate limit reached. Try again later.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const {
      template_name,
      language = 'en',
      filter_status,
      filter_channel,
      components = [],
    } = body;

    if (!template_name) {
      return NextResponse.json({ success: false, error: 'template_name is required' }, { status: 400 });
    }

    // Get tenant and validate readiness
    const tenant = await getTenantById(tenantId);
    if (!tenant || !isWhatsAppConfigured(tenant)) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp not connected. Connect first.' },
        { status: 400 }
      );
    }

    // Guard: reject broadcasts for deactivated tenants
    if (!tenant.is_active) {
      return NextResponse.json(
        { success: false, error: 'Account is deactivated. Contact support.' },
        { status: 403 }
      );
    }

    // Guard: reject broadcasts if token is known expired
    if (tenant.wa_token_expired) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp token expired. Please reconnect in Settings.' },
        { status: 400 }
      );
    }

    // Guard: pre-check message quota before querying leads
    const { checkUsageLimits } = await import('@/lib/tenant/manager');
    const usage = await checkUsageLimits(tenant);
    if (!usage.withinLimits) {
      return NextResponse.json(
        { success: false, error: `Message limit reached (${tenant.message_limit} per month). Upgrade your plan to send more.` },
        { status: 429 }
      );
    }

    // Build lead query
    let query = supabaseAdmin
      .from('leads')
      .select('id, name, phone')
      .eq('tenant_id', tenantId)
      .not('phone', 'is', null);

    if (filter_status) {
      if (Array.isArray(filter_status)) {
        query = query.in('lead_status', filter_status);
      } else {
        query = query.eq('lead_status', filter_status);
      }
    }

    if (filter_channel) {
      query = query.eq('channel', filter_channel);
    }

    const { data: leads, error: leadErr } = await query.limit(1000);

    if (leadErr) throw new Error(leadErr.message);
    if (!leads || leads.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No leads match the selected filters.' },
        { status: 400 }
      );
    }

    // Warn if broadcast would exceed remaining quota (partial send)
    const quotaWarning = leads.length > usage.messagesRemaining
      ? `Only ${usage.messagesRemaining} of ${leads.length} leads will receive this broadcast (quota limit).`
      : null;

    // Create broadcast record
    const broadcastId = crypto.randomUUID();
    await supabaseAdmin.from('analytics_events').insert({
      tenant_id: tenantId,
      event_type: 'broadcast_started',
      channel: 'whatsapp',
      metadata: {
        broadcast_id: broadcastId,
        template_name,
        total_recipients: leads.length,
        quota_warning: quotaWarning,
        filter_status,
        filter_channel,
      },
    });

    // Send messages via BullMQ queue to avoid Vercel timeouts
    await enqueueBroadcast({
      tenantId,
      templateName: template_name,
      language,
      broadcastId,
      leads: leads as { id: string; name: string; phone: string }[],
      components,
    });

    return NextResponse.json({
      success: true,
      data: {
        broadcast_id: broadcastId,
        template_name: template_name,
        total: leads.length,
        status: 'enqueued',
        quota_warning: quotaWarning,
      },
    });
  } catch (error) {
    console.error('❌ Broadcast error:', error);
    return NextResponse.json(
      { success: false, error: 'Broadcast failed. Please try again.' },
      { status: 500 }
    );
  }
}

// ═══════════════════════════════════════
// GET: Get broadcast-eligible lead counts
// ═══════════════════════════════════════
export async function GET() {
  const tenantId = await getTenantId();
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [allLeads, byStatus, byChannel] = await Promise.all([
      supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .not('phone', 'is', null),
      supabaseAdmin
        .from('leads')
        .select('lead_status')
        .eq('tenant_id', tenantId)
        .not('phone', 'is', null),
      supabaseAdmin
        .from('leads')
        .select('channel')
        .eq('tenant_id', tenantId)
        .not('phone', 'is', null),
    ]);

    // Count by status
    const statusCounts: Record<string, number> = {};
    (byStatus.data || []).forEach((l) => {
      statusCounts[l.lead_status] = (statusCounts[l.lead_status] || 0) + 1;
    });

    // Count by channel
    const channelCounts: Record<string, number> = {};
    (byChannel.data || []).forEach((l) => {
      channelCounts[l.channel] = (channelCounts[l.channel] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      data: {
        total: allLeads.count || 0,
        byStatus: statusCounts,
        byChannel: channelCounts,
      },
    });
  } catch (error) {
    console.error('❌ Broadcast stats error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch stats' }, { status: 500 });
  }
}
