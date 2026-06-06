import { supabaseAdmin } from '@/lib/supabase/admin';
import type { AttributionEvent, LeadSource } from './types';
import { notifyNewAdLead } from './notifications';

interface ReferralData {
  source_type?: string;
  source_id?: string;
  headline?: string;
  body?: string;
  ctwa_clid?: string;
  source_url?: string;
}

export async function processCtwaLead(
  tenantId: string,
  phone: string,
  name: string | null,
  referral: ReferralData
): Promise<{ campaign_lead_id: string; is_new: boolean }> {
  const { data: existingLead } = await supabaseAdmin
    .from('campaign_leads')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .eq('ctwa_clid', referral.ctwa_clid || '')
    .maybeSingle();

  if (existingLead) {
    return { campaign_lead_id: existingLead.id, is_new: false };
  }

  let campaignId: string | null = null;
  let campaignName = 'Unknown Campaign';

  if (referral.source_id) {
    const { data: campaign } = await supabaseAdmin
      .from('meta_campaigns')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('meta_campaign_id', referral.source_id)
      .maybeSingle();

    if (campaign) {
      campaignId = campaign.id;
      campaignName = campaign.name;
    }
  }

  const { data: newLead, error } = await supabaseAdmin
    .from('campaign_leads')
    .insert({
      tenant_id: tenantId,
      campaign_id: campaignId,
      meta_campaign_id: referral.source_id || null,
      phone,
      name: name || 'WhatsApp User',
      source: 'ctwa' as LeadSource,
      ctwa_clid: referral.ctwa_clid || null,
      referral_headline: referral.headline || null,
      referral_body: referral.body || null,
      referral_source_url: referral.source_url || null,
      referral_source_type: referral.source_type || null,
      conversation_started: true,
    })
    .select('id')
    .single();

  if (error || !newLead) {
    console.error('Failed to create campaign lead:', error);
    throw new Error('Failed to create campaign lead');
  }

  await addAttributionEvent(tenantId, newLead.id, 'ad_click', {
    ctwa_clid: referral.ctwa_clid,
    source_url: referral.source_url,
  });

  await addAttributionEvent(tenantId, newLead.id, 'whatsapp_open', {
    phone,
  });

  await addAttributionEvent(tenantId, newLead.id, 'message_sent', {
    first_message: true,
  });

  if (campaignId) {
    await supabaseAdmin.rpc('increment_campaign_analytics', {
      p_tenant_id: tenantId,
      p_campaign_id: campaignId,
      p_date: new Date().toISOString().split('T')[0],
      p_column: 'leads',
      p_amount: 1,
    });

    await supabaseAdmin.rpc('increment_campaign_analytics', {
      p_tenant_id: tenantId,
      p_campaign_id: campaignId,
      p_date: new Date().toISOString().split('T')[0],
      p_column: 'conversations',
      p_amount: 1,
    });

    // Attempt RPC increment; fall back to manual read-modify-write
    const { error: rpcErr } = await supabaseAdmin.rpc('increment_campaign_counter', {
      p_campaign_id: campaignId,
      p_column: 'total_leads',
    });
    if (rpcErr) {
      // Fallback: direct increment
      const { data: currentCampaign } = await supabaseAdmin
        .from('meta_campaigns')
        .select('total_leads')
        .eq('id', campaignId!)
        .single();
      if (currentCampaign) {
        await supabaseAdmin
          .from('meta_campaigns')
          .update({ total_leads: (currentCampaign.total_leads || 0) + 1 })
          .eq('id', campaignId!);
      }
    }
  }

  await notifyNewAdLead(tenantId, name || phone, campaignName, campaignId || undefined);

  // Tag the lead in the CRM leads table
  await tagLeadInCRM(tenantId, phone, {
    source: 'Meta Ads',
    campaign: campaignName,
    headline: referral.headline,
  });

  return { campaign_lead_id: newLead.id, is_new: true };
}

export async function addAttributionEvent(
  tenantId: string,
  campaignLeadId: string,
  eventType: AttributionEvent,
  eventData: Record<string, unknown> = {}
): Promise<void> {
  await supabaseAdmin.from('lead_attribution').insert({
    tenant_id: tenantId,
    campaign_lead_id: campaignLeadId,
    event_type: eventType,
    event_data: eventData,
  });
}

export async function markLeadBooking(
  tenantId: string,
  phone: string,
  bookingData: Record<string, unknown> = {}
): Promise<void> {
  const { data: leads } = await supabaseAdmin
    .from('campaign_leads')
    .select('id, campaign_id')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!leads || leads.length === 0) return;

  const lead = leads[0];

  await supabaseAdmin
    .from('campaign_leads')
    .update({ booking_made: true, status: 'converted' })
    .eq('id', lead.id);

  await addAttributionEvent(tenantId, lead.id, 'booking_confirmed', bookingData);

  if (lead.campaign_id) {
    await supabaseAdmin.rpc('increment_campaign_analytics', {
      p_tenant_id: tenantId,
      p_campaign_id: lead.campaign_id,
      p_date: new Date().toISOString().split('T')[0],
      p_column: 'bookings',
      p_amount: 1,
    });
  }
}

async function tagLeadInCRM(
  tenantId: string,
  phone: string,
  tags: { source: string; campaign?: string; headline?: string | null }
): Promise<void> {
  const { data: crmLead } = await supabaseAdmin
    .from('leads')
    .select('id, tags')
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .maybeSingle();

  if (!crmLead) return;

  const existingTags = (crmLead.tags as string[] | null) || [];
  const newTags = new Set(existingTags);
  newTags.add(tags.source);
  if (tags.campaign) newTags.add(tags.campaign);

  await supabaseAdmin
    .from('leads')
    .update({
      tags: Array.from(newTags),
      source_detail: `Meta Ads: ${tags.campaign || 'Click-to-WhatsApp'}`,
      meta_campaign_id: tags.campaign || null,
    })
    .eq('id', crmLead.id);
}

export function getCampaignContextForAI(referral: ReferralData | undefined): string {
  if (!referral) return '';

  const parts: string[] = [];
  parts.push('This customer came from a Meta/Facebook ad (Click-to-WhatsApp).');

  if (referral.headline) {
    parts.push(`Ad headline: "${referral.headline}"`);
  }
  if (referral.body) {
    parts.push(`Ad offer/details: "${referral.body}"`);
  }

  parts.push('Greet them warmly, acknowledge the ad they clicked, and continue the conversation based on the ad content.');

  return parts.join(' ');
}
