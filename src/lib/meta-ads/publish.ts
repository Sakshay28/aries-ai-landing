// ═══════════════════════════════════════════════════════════
// 🚀 Campaign Publishing Orchestrator
// ═══════════════════════════════════════════════════════════
// Takes a draft meta_campaigns row and publishes the full object
// graph to Meta: Campaign → AdSet → Creative → Ad.
// Persists Meta IDs back to our tables at each step so a partial
// failure is recoverable. Returns the published campaign.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  createMetaCampaign,
  createMetaAdSet,
  createMetaAdCreative,
  createMetaAd,
} from './api';
import type { MetaCampaign, CampaignTargeting, CampaignCreative } from './types';

const OBJECTIVE_MAP: Record<string, string> = {
  MESSAGES: 'OUTCOME_ENGAGEMENT',
  LEADS: 'OUTCOME_LEADS',
  AWARENESS: 'OUTCOME_AWARENESS',
  TRAFFIC: 'OUTCOME_TRAFFIC',
};

const OPTIMIZATION_GOAL_MAP: Record<string, string> = {
  MESSAGES: 'CONVERSATIONS',
  LEADS: 'LEAD_GENERATION',
  AWARENESS: 'REACH',
  TRAFFIC: 'LINK_CLICKS',
};

function buildMetaTargeting(targeting: CampaignTargeting): Record<string, unknown> {
  const t: Record<string, unknown> = {};

  const geoLocations: Record<string, unknown> = {};
  if (targeting.locations && targeting.locations.length > 0) {
    const cities = targeting.locations.filter((l) => l.type === 'city').map((l) => ({ key: l.key }));
    const regions = targeting.locations.filter((l) => l.type === 'region').map((l) => ({ key: l.key }));
    const countries = targeting.locations.filter((l) => l.type === 'country').map((l) => l.key);
    if (cities.length) geoLocations.cities = cities;
    if (regions.length) geoLocations.regions = regions;
    if (countries.length) geoLocations.countries = countries;
  }
  if (Object.keys(geoLocations).length === 0) {
    geoLocations.countries = ['IN']; // sensible default for Indian businesses
  }
  t.geo_locations = geoLocations;

  if (targeting.age_min) t.age_min = targeting.age_min;
  if (targeting.age_max) t.age_max = targeting.age_max;
  if (targeting.genders && targeting.genders.length && !targeting.genders.includes(0)) {
    t.genders = targeting.genders;
  }
  if (targeting.locales && targeting.locales.length) t.locales = targeting.locales;

  const flexibleSpec: Record<string, unknown>[] = [];
  const interestsAndBehaviors: Record<string, unknown> = {};
  if (targeting.interests && targeting.interests.length) {
    interestsAndBehaviors.interests = targeting.interests.map((i) => ({ id: i.id, name: i.name }));
  }
  if (targeting.behaviors && targeting.behaviors.length) {
    interestsAndBehaviors.behaviors = targeting.behaviors.map((b) => ({ id: b.id, name: b.name }));
  }
  if (Object.keys(interestsAndBehaviors).length) flexibleSpec.push(interestsAndBehaviors);
  if (flexibleSpec.length) t.flexible_spec = flexibleSpec;

  const customAudiences = [
    ...(targeting.custom_audiences || []),
    ...(targeting.lookalike_audiences || []),
  ].map((a) => ({ id: a.id }));
  if (customAudiences.length) t.custom_audiences = customAudiences;

  return t;
}

export async function publishCampaign(
  tenantId: string,
  campaignId: string,
  encryptedToken: string
): Promise<MetaCampaign> {
  // ── Load campaign + its draft adset/ad + selected assets ──
  const { data: campaign } = await supabaseAdmin
    .from('meta_campaigns')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', campaignId)
    .single();

  if (!campaign) throw new Error('Campaign not found');
  if (campaign.status === 'active') throw new Error('Campaign is already active');

  const { data: account } = await supabaseAdmin
    .from('meta_ad_accounts')
    .select('account_id')
    .eq('id', campaign.ad_account_id)
    .single();
  if (!account) throw new Error('Ad account not found');
  const actId = account.account_id.startsWith('act_') ? account.account_id : `act_${account.account_id}`;

  // WhatsApp number + page for the CTWA creative
  let waNumber = '';
  if (campaign.whatsapp_number_id) {
    const { data: wa } = await supabaseAdmin
      .from('meta_whatsapp_numbers')
      .select('display_phone')
      .eq('id', campaign.whatsapp_number_id)
      .single();
    waNumber = (wa?.display_phone || '').replace(/[\s+\-()]/g, '');
  }

  let pageId = '';
  if (campaign.page_id) {
    const { data: page } = await supabaseAdmin
      .from('meta_pages')
      .select('page_id')
      .eq('id', campaign.page_id)
      .single();
    pageId = page?.page_id || '';
  } else {
    // Fall back to the selected page
    const { data: page } = await supabaseAdmin
      .from('meta_pages')
      .select('page_id')
      .eq('tenant_id', tenantId)
      .eq('is_selected', true)
      .maybeSingle();
    pageId = page?.page_id || '';
  }

  if (!pageId) throw new Error('A connected Facebook Page is required to publish a Click-to-WhatsApp campaign');

  const { data: adset } = await supabaseAdmin
    .from('meta_adsets')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: ad } = await supabaseAdmin
    .from('meta_ads')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const creative = (ad?.creative || {}) as CampaignCreative;
  const targeting = (campaign.targeting || {}) as CampaignTargeting;

  try {
    // ── 1. Campaign ──
    let metaCampaignId = campaign.meta_campaign_id;
    if (!metaCampaignId) {
      const created = await createMetaCampaign(encryptedToken, actId, {
        name: campaign.name,
        objective: OBJECTIVE_MAP[campaign.objective] || 'OUTCOME_ENGAGEMENT',
        status: 'PAUSED',
      });
      metaCampaignId = created.id;
      await supabaseAdmin
        .from('meta_campaigns')
        .update({ meta_campaign_id: metaCampaignId })
        .eq('id', campaignId);
    }

    // ── 2. AdSet ──
    const metaTargeting = buildMetaTargeting(targeting);
    const budgetField =
      campaign.budget_type === 'lifetime'
        ? { lifetime_budget: Number(campaign.budget_amount) }
        : { daily_budget: Number(campaign.budget_amount) };

    const createdAdSet = await createMetaAdSet(encryptedToken, actId, {
      name: adset?.name || `${campaign.name} — Ad Set`,
      campaign_id: metaCampaignId,
      optimization_goal: OPTIMIZATION_GOAL_MAP[campaign.objective] || 'CONVERSATIONS',
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      ...budgetField,
      start_time: campaign.start_date ? new Date(campaign.start_date).toISOString() : undefined,
      end_time: campaign.end_date ? new Date(campaign.end_date).toISOString() : undefined,
      targeting: metaTargeting,
      destination_type: campaign.objective === 'MESSAGES' ? 'WHATSAPP' : undefined,
      promoted_object:
        campaign.objective === 'MESSAGES' && pageId
          ? { page_id: pageId }
          : undefined,
      status: 'PAUSED',
    });

    if (adset) {
      await supabaseAdmin
        .from('meta_adsets')
        .update({ meta_adset_id: createdAdSet.id, status: 'paused' })
        .eq('id', adset.id);
    }

    // ── 3. Creative ──
    const createdCreative = await createMetaAdCreative(encryptedToken, actId, {
      name: `${campaign.name} — Creative`,
      page_id: pageId,
      primary_text: creative.primary_text || campaign.name,
      headline: creative.headline || campaign.name,
      description: creative.description || '',
      cta: 'WHATSAPP_MESSAGE',
      image_url: creative.media_urls?.[0],
      whatsapp_number: waNumber,
    });

    // ── 4. Ad ──
    const createdAd = await createMetaAd(encryptedToken, actId, {
      name: ad?.name || `${campaign.name} — Ad`,
      adset_id: createdAdSet.id,
      creative_id: createdCreative.id,
      status: 'PAUSED',
    });

    if (ad) {
      await supabaseAdmin
        .from('meta_ads')
        .update({ meta_ad_id: createdAd.id, status: 'paused' })
        .eq('id', ad.id);
    }

    // ── 5. Mark campaign as pending review (Meta will review the ad) ──
    const { data: updated } = await supabaseAdmin
      .from('meta_campaigns')
      .update({
        status: 'pending_review',
        published_at: new Date().toISOString(),
        meta_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId)
      .select('*')
      .single();

    return updated as MetaCampaign;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    await supabaseAdmin
      .from('meta_campaigns')
      .update({ status: 'error', meta_error: message.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', campaignId);
    throw err;
  }
}
