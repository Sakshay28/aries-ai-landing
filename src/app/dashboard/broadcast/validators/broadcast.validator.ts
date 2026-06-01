import { z } from 'zod';

// ── Shared Types ─────────────────────────────────────────────────────────────

export const variableConfigSchema = z.object({
  index: z.string(),
  sourceType: z.enum(['crm_field', 'static', 'custom']),
  crmField: z.string().optional(),
  staticValue: z.string().optional(),
});

export const audienceStateSchema = z.object({
  type: z.enum(['all', 'tags', 'custom', 'retarget', 'csv']),
  tags: z.array(z.string()).default([]),
  customFilters: z.array(
    z.object({
      id: z.string(),
      field: z.string(),
      operator: z.string(),
      value: z.string(),
    })
  ).default([]),
  retargetCampaignId: z.string().nullable().default(null),
  retargetCondition: z.enum(['unread', 'no_reply', 'clicked_cta', 'not_clicked']).default('unread'),
  retargetDelayDays: z.number().min(1).default(1),
});

export const deliveryConfigSchema = z.object({
  mode: z.enum(['now', 'scheduled', 'recurring']),
  scheduledAt: z.string().nullable().default(null),
  timezone: z.string().default('Asia/Kolkata'),
  quietHoursEnabled: z.boolean().default(true),
  throttleRate: z.number().min(1).max(5000).default(300),
  advancedOpen: z.boolean().default(false),
});

export const automationRuleSchema = z.object({
  id: z.string(),
  trigger: z.enum(['replied', 'no_reply', 'cta_clicked', 'stop_received', 'failed']),
  action: z.enum(['assign_human', 'trigger_flow', 'send_followup', 'notify_email', 'auto_optout', 'retry']),
  delay: z.number().optional(),
  enabled: z.boolean().default(true),
});

// ── Campaign Validator Schema ──────────────────────────────────────────────────

export const campaignValidatorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, { message: 'Campaign name must be at least 3 characters' })
    .max(100, { message: 'Campaign name must be under 100 characters' }),
  template_name: z
    .string()
    .min(1, { message: 'Please select a WhatsApp template' }),
  variables: z.record(z.string(), variableConfigSchema).default({}),
  audience: audienceStateSchema,
  delivery: deliveryConfigSchema,
  automationRules: z.array(automationRuleSchema).default([]),
});

export type CampaignFormValues = z.infer<typeof campaignValidatorSchema>;

// ── Pre-flight Readiness Logic ──────────────────────────────────────────────────

export interface ValidationCheckResult {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
}

export function validateCampaignPreflight(
  values: Partial<CampaignFormValues>,
  detectedVarIndices: string[],
  netRecipients: number
): ValidationCheckResult[] {
  const checks: ValidationCheckResult[] = [];

  // 1. Campaign Name Check
  const nameValid = values.name && values.name.trim().length >= 3;
  checks.push({
    id: 'name',
    label: 'Campaign name set',
    status: nameValid ? 'pass' : 'fail',
    message: nameValid ? undefined : 'Name must be at least 3 characters',
  });

  // 2. Template Selection Check
  const templateValid = !!values.template_name;
  checks.push({
    id: 'template',
    label: 'Template selected',
    status: templateValid ? 'pass' : 'fail',
    message: templateValid ? undefined : 'Please select a message template',
  });

  // 3. Variable Mapping Check
  let varsValid = true;
  let varsMessage: string | undefined;
  
  if (detectedVarIndices.length > 0) {
    const mapped = values.variables ?? {};
    const unmapped = detectedVarIndices.filter(idx => {
      const cfg = mapped[idx];
      if (!cfg) return true;
      if (cfg.sourceType === 'static') return !cfg.staticValue?.trim();
      if (cfg.sourceType === 'crm_field') return !cfg.crmField;
      if (cfg.sourceType === 'custom') return !cfg.staticValue?.trim();
      return true;
    });
    
    if (unmapped.length > 0) {
      varsValid = false;
      varsMessage = `${unmapped.length} variable${unmapped.length > 1 ? 's' : ''} unmapped`;
    }
  }

  checks.push({
    id: 'variables',
    label: 'All variables mapped',
    status: varsValid ? 'pass' : 'fail',
    message: varsMessage,
  });

  // 4. Audience Cohort Check
  let audienceStatus: 'pass' | 'warn' | 'fail' = 'pass';
  let audienceMessage: string | undefined;
  
  if (!values.audience) {
    audienceStatus = 'fail';
    audienceMessage = 'Audience targeting options missing';
  } else {
    const aud = values.audience;
    if (aud.type === 'tags' && aud.tags.length === 0) {
      audienceStatus = 'fail';
      audienceMessage = 'Please select at least one contact tag';
    } else if (aud.type === 'custom' && aud.customFilters.length === 0) {
      audienceStatus = 'fail';
      audienceMessage = 'Please add at least one segment rule';
    } else if (aud.type === 'retarget' && !aud.retargetCampaignId) {
      audienceStatus = 'fail';
      audienceMessage = 'Please select a past completed campaign';
    } else if (netRecipients === 0) {
      audienceStatus = 'warn';
      audienceMessage = 'No active opted-in contacts qualify';
    }
  }

  checks.push({
    id: 'audience',
    label: 'Audience selected',
    status: audienceStatus,
    message: audienceMessage,
  });

  // 5. Quiet Hours Protection
  const quietHours = !!values.delivery?.quietHoursEnabled;
  checks.push({
    id: 'quiet_hours',
    label: 'Quiet hours protection',
    status: quietHours ? 'pass' : 'warn',
    message: quietHours ? undefined : 'Disabling quiet hours may impact compliance',
  });

  // 6. Delivery Scheduling Validation
  let scheduleStatus: 'pass' | 'fail' = 'pass';
  let scheduleMessage: string | undefined;

  if (values.delivery?.mode === 'scheduled') {
    if (!values.delivery.scheduledAt) {
      scheduleStatus = 'fail';
      scheduleMessage = 'Set a scheduled date and time';
    } else {
      const date = new Date(values.delivery.scheduledAt);
      if (date.getTime() <= Date.now()) {
        scheduleStatus = 'fail';
        scheduleMessage = 'Scheduled date must be in the future';
      }
    }
  }

  checks.push({
    id: 'schedule',
    label: values.delivery?.mode === 'scheduled' ? 'Scheduled time set' : 'Delivery mode set',
    status: scheduleStatus,
    message: scheduleMessage,
  });

  return checks;
}
