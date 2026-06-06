// ═══════════════════════════════════════════════════════════
// 📊 Insights Sync
// ═══════════════════════════════════════════════════════════
// Pulls spend/impressions/clicks/actions from Meta for each
// active campaign and upserts daily rows into campaign_analytics.
// Also rolls up campaign totals onto meta_campaigns.
// ═══════════════════════════════════════════════════════════

import { supabaseAdmin } from '@/lib/supabase/admin';
import { fetchCampaignInsights, type MetaInsight } from './api';
import { notifyHighSpend } from './notifications';

// Map Meta action types → our metric columns
function extractActions(insight: MetaInsight): { conversations: number; leads: number } {
  let conversations = 0;
  let leads = 0;
  for (const a of insight.actions || []) {
    if (
      a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
      a.action_type === 'onsite_conversion.total_messaging_connection'
    ) {
      conversations += Number(a.value) || 0;
    }
    if (a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped') {
      leads += Number(a.value) || 0;
    }
  }
  return { conversations, leads };
}

export async function syncCampaignInsights(
  tenantId: string,
  encryptedToken: string,
  dateFrom: string,
  dateTo: string
): Promise<{ campaigns_synced: number }> {
  // Active / pending / recently-completed campaigns that are live on Meta
  const { data: campaigns } = await supabaseAdmin
    .from('meta_campaigns')
    .select('id, name, meta_campaign_id, budget_amount, budget_type, total_spend')
    .eq('tenant_id', tenantId)
    .not('meta_campaign_id', 'is', null)
    .in('status', ['active', 'pending_review', 'paused', 'completed']);

  if (!campaigns || campaigns.length === 0) return { campaigns_synced: 0 };

  let synced = 0;

  for (const campaign of campaigns) {
    if (!campaign.meta_campaign_id) continue;
    try {
      const insights = await fetchCampaignInsights(
        encryptedToken,
        campaign.meta_campaign_id,
        dateFrom,
        dateTo,
        'campaign'
      );

      let campaignSpend = 0;
      let campaignImpressions = 0;
      let campaignClicks = 0;
      let campaignConversations = 0;
      let campaignLeads = 0;

      for (const insight of insights) {
        const { conversations, leads } = extractActions(insight);
        const spend = Number(insight.spend) || 0;
        const impressions = Number(insight.impressions) || 0;
        const clicks = Number(insight.clicks) || 0;

        campaignSpend += spend;
        campaignImpressions += impressions;
        campaignClicks += clicks;
        campaignConversations += conversations;
        campaignLeads += leads;

        // Upsert the daily analytics row. We overwrite the ad-sourced
        // metrics (impressions/clicks/spend) but preserve organically
        // tracked leads/conversations/bookings already counted by the webhook.
        const { data: existing } = await supabaseAdmin
          .from('campaign_analytics')
          .select('leads, conversations, bookings, revenue')
          .eq('tenant_id', tenantId)
          .eq('campaign_id', campaign.id)
          .eq('date', insight.date_start)
          .maybeSingle();

        await supabaseAdmin.from('campaign_analytics').upsert(
          {
            tenant_id: tenantId,
            campaign_id: campaign.id,
            date: insight.date_start,
            impressions,
            clicks,
            spend,
            // Prefer the higher of webhook-tracked vs Meta-reported
            leads: Math.max(existing?.leads || 0, leads),
            conversations: Math.max(existing?.conversations || 0, conversations),
            bookings: existing?.bookings || 0,
            revenue: existing?.revenue || 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'tenant_id,campaign_id,date' }
        );
      }

      // Roll up totals onto the campaign
      await supabaseAdmin
        .from('meta_campaigns')
        .update({
          total_spend: Math.round(campaignSpend * 100) / 100,
          total_impressions: campaignImpressions,
          total_clicks: campaignClicks,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id);

      // High-spend alert: crossed 80% of budget (daily budgets only)
      if (campaign.budget_type === 'daily' && campaign.budget_amount > 0) {
        const ratio = campaignSpend / Number(campaign.budget_amount);
        if (ratio >= 0.8) {
          await notifyHighSpend(tenantId, campaign.name, campaignSpend, Number(campaign.budget_amount), campaign.id);
        }
      }

      synced++;
    } catch (e) {
      console.warn(`Insights sync failed for campaign ${campaign.id}:`, e);
    }
  }

  return { campaigns_synced: synced };
}
