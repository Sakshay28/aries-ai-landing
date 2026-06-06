// ═══════════════════════════════════════════════════════════
// 📋 Meta Ads — Single Campaign: Get / Update / Delete
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireUser, requireWrite, getConnectionToken, errorResponse } from '@/lib/meta-ads/guard';
import { updateCampaignSchema } from '@/lib/meta-ads/validation';
import { updateMetaCampaignStatus } from '@/lib/meta-ads/api';
import { notifyCampaignStatusChange } from '@/lib/meta-ads/notifications';
import { logAudit } from '@/lib/audit/logger';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireUser();
    if (!guard.ok) return guard.response;
    const { tenantId } = guard;
    const { id } = await params;

    const { data: campaign, error } = await supabaseAdmin
      .from('meta_campaigns')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    const [adsets, ads, leads, analytics] = await Promise.all([
      supabaseAdmin.from('meta_adsets').select('*').eq('campaign_id', id),
      supabaseAdmin.from('meta_ads').select('*').eq('campaign_id', id),
      supabaseAdmin.from('campaign_leads').select('*', { count: 'exact', head: true }).eq('campaign_id', id),
      supabaseAdmin.from('campaign_analytics').select('*').eq('campaign_id', id).order('date', { ascending: true }),
    ]);

    return NextResponse.json({
      campaign,
      adsets: adsets.data || [],
      ads: ads.data || [],
      lead_count: leads.count || 0,
      analytics: analytics.data || [],
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireWrite();
    if (!guard.ok) return guard.response;
    const { tenantId, user } = guard;
    const { id } = await params;

    const body = await req.json();
    const parsed = updateCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('meta_campaigns')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    // If status is changing AND the campaign is live on Meta, propagate to Meta.
    if (parsed.data.status && parsed.data.status !== existing.status && existing.meta_campaign_id) {
      const metaStatus =
        parsed.data.status === 'active' ? 'ACTIVE' :
        parsed.data.status === 'paused' ? 'PAUSED' :
        parsed.data.status === 'archived' ? 'DELETED' : null;
      if (metaStatus) {
        try {
          const { connection } = await getConnectionToken(tenantId);
          await updateMetaCampaignStatus(connection.access_token, existing.meta_campaign_id, metaStatus);
        } catch (e) {
          return NextResponse.json(
            { error: `Failed to update status on Meta: ${e instanceof Error ? e.message : 'unknown'}` },
            { status: 502 }
          );
        }
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from('meta_campaigns')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (parsed.data.status && parsed.data.status !== existing.status) {
      if (parsed.data.status === 'paused' || parsed.data.status === 'rejected') {
        void notifyCampaignStatusChange(tenantId, existing.name, parsed.data.status, id);
      }
      logAudit({
        tenant_id: tenantId,
        actor_id: user.id,
        actor_email: user.email,
        action: parsed.data.status === 'paused' ? 'bot_paused' : 'settings_updated',
        entity: 'meta_campaign',
        entity_id: id,
        old_value: { status: existing.status },
        new_value: { status: parsed.data.status },
      });
    }

    return NextResponse.json({ campaign: updated });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireWrite();
    if (!guard.ok) return guard.response;
    const { tenantId, user } = guard;
    const { id } = await params;

    const { data: existing } = await supabaseAdmin
      .from('meta_campaigns')
      .select('meta_campaign_id, name')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

    // Archive on Meta if it was published (don't hard-delete remote spend history)
    if (existing.meta_campaign_id) {
      try {
        const { connection } = await getConnectionToken(tenantId);
        await updateMetaCampaignStatus(connection.access_token, existing.meta_campaign_id, 'DELETED');
      } catch (e) {
        console.warn('Failed to archive campaign on Meta:', e);
      }
    }

    const { error } = await supabaseAdmin
      .from('meta_campaigns')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    logAudit({
      tenant_id: tenantId,
      actor_id: user.id,
      actor_email: user.email,
      action: 'settings_updated',
      entity: 'meta_campaign',
      entity_id: id,
      meta: { event: 'deleted', name: existing.name },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
