export type ConnectionStatus = 'connected' | 'disconnected' | 'needs_reauth' | 'error';

export type CampaignObjective = 'MESSAGES' | 'LEADS' | 'AWARENESS' | 'TRAFFIC';

export type CampaignStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'completed' | 'rejected' | 'error' | 'archived';

export type LeadSource = 'ctwa' | 'lead_form' | 'sponsored_message' | 'manual';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';

export type NotificationType = 'new_lead' | 'new_booking' | 'high_spend' | 'campaign_paused' | 'campaign_rejected' | 'budget_alert' | 'token_expiring' | 'general';

export type AttributionEvent =
  | 'ad_impression' | 'ad_click' | 'whatsapp_open'
  | 'message_sent' | 'message_received' | 'ai_response'
  | 'booking_started' | 'booking_confirmed' | 'payment_made'
  | 'lead_qualified' | 'lead_converted' | 'custom';

export interface MetaConnection {
  id: string;
  tenant_id: string;
  fb_user_id: string;
  fb_user_name: string | null;
  business_id: string | null;
  business_name: string | null;
  access_token: string;
  token_expires_at: string | null;
  scopes: string[];
  status: ConnectionStatus;
  last_refreshed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaAdAccount {
  id: string;
  tenant_id: string;
  connection_id: string;
  account_id: string;
  account_name: string | null;
  currency: string;
  timezone: string;
  account_status: number;
  is_selected: boolean;
  created_at: string;
}

export interface MetaPage {
  id: string;
  tenant_id: string;
  connection_id: string;
  page_id: string;
  page_name: string | null;
  page_token: string | null;
  instagram_id: string | null;
  is_selected: boolean;
  created_at: string;
}

export interface MetaWhatsAppNumber {
  id: string;
  tenant_id: string;
  connection_id: string;
  waba_id: string;
  phone_number_id: string;
  display_phone: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  is_selected: boolean;
  created_at: string;
}

export interface MetaCampaign {
  id: string;
  tenant_id: string;
  ad_account_id: string;
  meta_campaign_id: string | null;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  budget_type: 'daily' | 'lifetime';
  budget_amount: number;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  whatsapp_number_id: string | null;
  page_id: string | null;
  targeting: CampaignTargeting;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_leads: number;
  total_conversations: number;
  total_bookings: number;
  meta_error: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignTargeting {
  locations?: { key: string; name: string; type: string }[];
  age_min?: number;
  age_max?: number;
  genders?: number[];  // 0=all, 1=male, 2=female
  locales?: number[];
  interests?: { id: string; name: string }[];
  behaviors?: { id: string; name: string }[];
  custom_audiences?: { id: string; name: string }[];
  lookalike_audiences?: { id: string; name: string }[];
}

export interface CampaignCreative {
  primary_text: string;
  headline: string;
  description: string;
  cta: string;
  media_type: 'image' | 'video' | 'carousel';
  media_urls: string[];
}

export interface MetaAdSet {
  id: string;
  tenant_id: string;
  campaign_id: string;
  meta_adset_id: string | null;
  name: string;
  status: string;
  targeting: CampaignTargeting;
  budget_amount: number;
  bid_strategy: string;
  optimization_goal: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  created_at: string;
}

export interface MetaAd {
  id: string;
  tenant_id: string;
  adset_id: string;
  campaign_id: string;
  meta_ad_id: string | null;
  name: string;
  status: string;
  creative: CampaignCreative;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  created_at: string;
}

export interface CampaignLead {
  id: string;
  tenant_id: string;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  phone: string;
  name: string | null;
  email: string | null;
  source: LeadSource;
  ctwa_clid: string | null;
  referral_headline: string | null;
  referral_body: string | null;
  conversation_started: boolean;
  booking_made: boolean;
  revenue: number;
  status: LeadStatus;
  created_at: string;
}

export interface LeadAttribution {
  id: string;
  tenant_id: string;
  campaign_lead_id: string;
  event_type: AttributionEvent;
  event_data: Record<string, unknown>;
  created_at: string;
}

export interface CampaignAnalytics {
  id: string;
  campaign_id: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  conversations: number;
  bookings: number;
  revenue: number;
}

export interface MetaAdsNotification {
  id: string;
  tenant_id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  campaign_id: string | null;
  is_read: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ConnectionStatusSummary {
  facebook: ConnectionStatus | 'not_connected';
  business_manager: ConnectionStatus | 'not_connected';
  ad_accounts: { count: number; selected: number };
  pages: { count: number; selected: number };
  whatsapp_numbers: { count: number; selected: number };
  instagram: { count: number };
  connection: MetaConnection | null;
}

export interface ROIDashboard {
  total_spend: number;
  total_leads: number;
  total_conversations: number;
  total_bookings: number;
  cost_per_lead: number;
  cost_per_booking: number;
  roas: number;
  daily_metrics: CampaignAnalytics[];
  funnel: {
    impressions: number;
    clicks: number;
    whatsapp_opens: number;
    conversations: number;
    bookings: number;
  };
}

export type DateFilter = 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'custom';
