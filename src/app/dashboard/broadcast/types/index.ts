export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'retrying' | 'completed' | 'failed' | 'archived' | 'cancelled';

export interface Template {
  name: string;
  category: string;
  language: string;
  status: string;
  body: string;
  headerType?: string; // 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'NONE'
  headerText?: string;
  headerMediaUrl?: string;
  footer?: string;
  buttons?: ParsedButton[];
  components?: TemplateComponent[];
  updatedAt?: string;
}

export interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: MetaButton[];
  example?: { header_handle?: string[] };
}

export interface MetaButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface ParsedButton {
  type: string;
  text: string;
  url?: string;
  phoneNumber?: string;
}

export interface AudienceState {
  type: 'all' | 'tags' | 'custom' | 'retarget' | 'csv' | 'manual' | 'recent' | 'shopify_segment';
  tags: string[];
  customFilters: CustomFilter[];
  retargetCampaignId: string | null;
  retargetCondition: 'unread' | 'no_reply' | 'clicked_cta' | 'not_clicked';
  retargetDelayDays: number;
  recentCount?: number;
  manualContactIds?: string[];
  excludedContactIds?: string[];
  // Shopify segment (audience.type === 'shopify_segment')
  shopifySegment?: {
    // Ordered in last N days (any status)
    orderedWithinDays?: number | null;
    // Minimum lifetime spend (in the shop's currency)
    minTotalSpent?: number | null;
    // Minimum number of orders
    minOrdersCount?: number | null;
    // 'ordered' → has any order; 'no_order' → has 0 orders (browsers)
    orderStatus?: 'any' | 'ordered' | 'no_order';
    // Shopify customer tag (single, exact match) — optional
    customerTag?: string | null;
  };
  csvFile?: {
    name: string;
    size: string;
    rows: number;
    duplicates: number;
    invalid: number;
    valid: number;
    contacts: Array<{ id: string; name: string; phone: string; email?: string }>;
  } | null;
}

export interface CustomFilter {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export interface VariableConfig {
  index: string;
  sourceType: 'crm_field' | 'static' | 'custom';
  crmField?: string;
  staticValue?: string;
}

export interface DeliveryConfig {
  mode: 'now' | 'scheduled' | 'recurring';
  scheduledAt: string | null;
  timezone: string;
  quietHoursEnabled: boolean;
  throttleRate: number;
  advancedOpen: boolean;
}

export interface AutomationRule {
  id: string;
  trigger: 'replied' | 'no_reply' | 'cta_clicked' | 'stop_received' | 'failed';
  action: 'assign_human' | 'trigger_flow' | 'send_followup' | 'notify_email' | 'auto_optout' | 'retry';
  delay?: number;
  enabled: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  template_name: string;
  status: CampaignStatus;
  audience_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  scheduled_at: string | null;
  created_at: string;
}

export interface EstimateResult {
  total: number;
  excluded: number;
  duplicates: number;
  invalid: number;
  noConsent: number;
  spamRisk: 'LOW' | 'MEDIUM' | 'HIGH';
}
