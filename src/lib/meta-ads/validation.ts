import { z } from 'zod';

export const campaignObjectives = ['MESSAGES', 'LEADS', 'AWARENESS', 'TRAFFIC'] as const;
export const campaignStatuses = ['draft', 'pending_review', 'active', 'paused', 'completed', 'rejected', 'error', 'archived'] as const;
export const budgetTypes = ['daily', 'lifetime'] as const;
export const leadSources = ['ctwa', 'lead_form', 'sponsored_message', 'manual'] as const;
export const leadStatuses = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;

const targetingLocationSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.string(),
});

const targetingInterestSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const campaignTargetingSchema = z.object({
  locations: z.array(targetingLocationSchema).optional(),
  age_min: z.number().min(13).max(65).optional(),
  age_max: z.number().min(13).max(65).optional(),
  genders: z.array(z.number().min(0).max(2)).optional(),
  locales: z.array(z.number()).optional(),
  interests: z.array(targetingInterestSchema).optional(),
  behaviors: z.array(targetingInterestSchema).optional(),
  custom_audiences: z.array(targetingInterestSchema).optional(),
  lookalike_audiences: z.array(targetingInterestSchema).optional(),
});

export const campaignCreativeSchema = z.object({
  primary_text: z.string().min(1).max(2000),
  headline: z.string().min(1).max(255),
  description: z.string().max(1000).optional().default(''),
  cta: z.string().min(1).max(50),
  media_type: z.enum(['image', 'video', 'carousel']),
  media_urls: z.array(z.string().url()).min(1).max(10),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required').max(255),
  objective: z.enum(campaignObjectives).default('MESSAGES'),
  ad_account_id: z.string().uuid(),
  whatsapp_number_id: z.string().uuid().optional(),
  page_id: z.string().uuid().optional(),
  budget_type: z.enum(budgetTypes).default('daily'),
  budget_amount: z.number().positive('Budget must be positive'),
  currency: z.string().default('INR'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  targeting: campaignTargetingSchema.optional().default({}),
  creative: campaignCreativeSchema.optional(),
});

export const updateCampaignSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  status: z.enum(campaignStatuses).optional(),
  budget_amount: z.number().positive().optional(),
  end_date: z.string().optional(),
  targeting: campaignTargetingSchema.optional(),
});

export const campaignListQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(campaignStatuses).optional(),
  search: z.string().optional(),
  sort_by: z.enum(['created_at', 'name', 'status', 'total_spend', 'total_leads']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export const dateFilterSchema = z.object({
  filter: z.enum(['today', 'yesterday', 'last_7_days', 'last_30_days', 'custom']).default('last_7_days'),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export const selectAccountSchema = z.object({
  account_id: z.string().uuid(),
  type: z.enum(['ad_account', 'page', 'whatsapp_number']),
});

export const leadStatusUpdateSchema = z.object({
  lead_id: z.string().uuid(),
  status: z.enum(leadStatuses),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type CampaignListQuery = z.infer<typeof campaignListQuerySchema>;
export type DateFilterInput = z.infer<typeof dateFilterSchema>;
