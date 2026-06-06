import { supabaseAdmin } from '@/lib/supabase/admin';
import type { NotificationType } from './types';

export async function createNotification(
  tenantId: string,
  type: NotificationType,
  title: string,
  message?: string,
  campaignId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await supabaseAdmin.from('meta_ads_notifications').insert({
    tenant_id: tenantId,
    type,
    title,
    message: message || null,
    campaign_id: campaignId || null,
    metadata: metadata || {},
  });
}

export async function notifyNewAdLead(
  tenantId: string,
  leadName: string,
  campaignName: string,
  campaignId?: string
): Promise<void> {
  await createNotification(
    tenantId,
    'new_lead',
    `New lead from Meta Ads: ${leadName}`,
    `A new lead arrived from campaign "${campaignName}"`,
    campaignId
  );
}

export async function notifyHighSpend(
  tenantId: string,
  campaignName: string,
  spend: number,
  budget: number,
  campaignId?: string
): Promise<void> {
  const pct = Math.round((spend / budget) * 100);
  await createNotification(
    tenantId,
    'high_spend',
    `Budget alert: ${campaignName} at ${pct}%`,
    `Campaign "${campaignName}" has spent ${spend} of ${budget} budget`,
    campaignId,
    { spend, budget, percentage: pct }
  );
}

export async function notifyCampaignStatusChange(
  tenantId: string,
  campaignName: string,
  newStatus: string,
  campaignId?: string
): Promise<void> {
  const type: NotificationType = newStatus === 'rejected' ? 'campaign_rejected' : 'campaign_paused';
  await createNotification(
    tenantId,
    type,
    `Campaign ${newStatus}: ${campaignName}`,
    `Your campaign "${campaignName}" has been ${newStatus}`,
    campaignId
  );
}

export async function notifyTokenExpiring(
  tenantId: string,
  daysLeft: number
): Promise<void> {
  await createNotification(
    tenantId,
    'token_expiring',
    `Meta connection expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
    'Reconnect your Meta account to keep your ads running'
  );
}
