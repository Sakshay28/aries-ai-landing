import { supabaseAdmin } from '@/lib/supabase/admin';
import { ConfidenceScoreService } from './confidence-score.service';
import { AudienceEngineService } from './audience-engine.service';

export interface ReadinessResult {
  readinessScore: number;
  readinessStatus: 'Excellent' | 'High confidence' | 'Moderate confidence' | 'Needs attention' | 'Unsafe';
  blockers: string[];
  warnings: string[];
  campaignHealth: {
    spamRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    hygieneScore: number;
  };
  compliance: {
    metaApproved: boolean;
    lowSpamRisk: boolean;
    quietHoursEnabled: boolean;
  };
  audience: {
    configured: boolean;
    totalCount: number;
    duplicatesRemoved: number;
    optedOutRemoved: number;
    invalidRemoved: number;
  };
  delivery: {
    configured: boolean;
    mode: 'now' | 'scheduled' | 'recurring';
    scheduledAt: string | null;
    timezone: string;
    rateLimit: number;
    quietHoursEnabled: boolean;
    estimatedDurationMin: number;
  };
  template: {
    selected: boolean;
    name: string | null;
    status: string | null;
  };
  variables: {
    mapped: boolean;
    detectedCount: number;
    mappedCount: number;
    unmappedList: string[];
  };
}

export class BroadcastReadinessService {
  /**
   * Dynamically calculates campaign launch readiness and preflight validation metrics
   * strictly from database state. No mock data, no static placeholders.
   */
  static async calculateBroadcastReadiness(campaignId: string): Promise<ReadinessResult> {
    const blockers: string[] = [];
    const warnings: string[] = [];

    // 1. Fetch Campaign Core
    const { data: campaign } = await supabaseAdmin
      .from('broadcast_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (!campaign) {
      throw new Error(`Campaign with ID ${campaignId} not found`);
    }

    // 2. Fetch Audience Cohort Selection
    const { data: audienceConfig } = await supabaseAdmin
      .from('broadcast_audiences')
      .select('*')
      .eq('campaign_id', campaignId)
      .maybeSingle();

    // 3. Fetch Variables Mapping
    const { data: variablesMapping } = await supabaseAdmin
      .from('broadcast_variable_mapping')
      .select('*')
      .eq('campaign_id', campaignId);

    // 4. Fetch Delivery Settings
    const { data: deliverySettings } = await supabaseAdmin
      .from('broadcast_delivery_settings')
      .select('*')
      .eq('campaign_id', campaignId)
      .maybeSingle();

    // 5. Fetch Template Approved State from DB Cache
    let templateStatus = 'PENDING';
    let templateBody = '';
    if (campaign.template_name) {
      const { data: cachedTemplate } = await supabaseAdmin
        .from('broadcast_templates_cache')
        .select('status, template_json')
        .eq('name', campaign.template_name)
        .eq('tenant_id', campaign.tenant_id)
        .maybeSingle();

      if (cachedTemplate) {
        templateStatus = cachedTemplate.status;
        templateBody = (cachedTemplate.template_json as any)?.body || '';
      } else {
        // Fallback: Check if it's in the templates api or draft_templates
        const { data: draftTemplate } = await supabaseAdmin
          .from('draft_templates')
          .select('status, body')
          .eq('name', campaign.template_name)
          .eq('tenant_id', campaign.tenant_id)
          .maybeSingle();

        if (draftTemplate) {
          templateStatus = draftTemplate.status || 'APPROVED';
          templateBody = draftTemplate.body || '';
        } else {
          templateStatus = 'APPROVED'; // Default to approved if we don't track status
        }
      }
    }

    // ── AUDIENCE RESOLUTION & DEDUPLICATION ──
    let totalCount = 0;
    let duplicatesRemoved = 0;
    let optedOutRemoved = 0;
    let invalidRemoved = 0;
    let spamRisk: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

    if (audienceConfig) {
      const audienceRes = await AudienceEngineService.resolveAudience(campaign.tenant_id, {
        type: audienceConfig.audience_type,
        tags: audienceConfig.tag_ids || [],
        customFilters: audienceConfig.filters?.customFilters || [],
        retargetCampaignId: audienceConfig.csv_upload_id || null,
        retargetCondition: audienceConfig.filters?.retargetCondition || 'unread',
        retargetDelayDays: audienceConfig.filters?.retargetDelayDays || 1,
        manualContactIds: audienceConfig.filters?.manualContactIds || [],
        csvFile: audienceConfig.filters?.csvFile || null,
      } as any);

      totalCount = audienceRes.total;
      duplicatesRemoved = audienceRes.duplicatesRemoved;
      optedOutRemoved = audienceRes.optedOutRemoved;
      invalidRemoved = audienceRes.invalidRemoved;
      spamRisk = audienceRes.spamRisk;
    }

    // ── VARIABLE MAPPING CHECK ──
    const detectedVarIndices: string[] = [];
    if (templateBody) {
      const matches = [...templateBody.matchAll(/{{(\d+)}}/g)];
      detectedVarIndices.push(...[...new Set(matches.map(m => m[1]))].sort());
    } else if (campaign.template_name) {
      // Fallback: check variable mapping entries to guess placeholders
      if (variablesMapping && variablesMapping.length > 0) {
        variablesMapping.forEach(v => {
          if (/^\d+$/.test(v.variable_key || '')) {
            detectedVarIndices.push(v.variable_key);
          }
        });
      }
    }

    const mapped = (variablesMapping || []).reduce((acc, curr) => {
      acc[curr.variable_key] = {
        sourceType: curr.source_type,
        crmField: curr.crm_field,
        staticValue: curr.custom_value || curr.mapping_value
      };
      return acc;
    }, {} as Record<string, any>);

    const unmappedList = detectedVarIndices.filter(idx => {
      const cfg = mapped[idx];
      if (!cfg) return true;
      if (cfg.sourceType === 'static') return !cfg.staticValue?.trim();
      if (cfg.sourceType === 'crm_field') return !cfg.crmField;
      if (cfg.sourceType === 'custom') return !cfg.staticValue?.trim();
      return true;
    });

    const variablesMapped = unmappedList.length === 0;

    // ── DELIVERY MODE VALIDATIONS ──
    const deliveryMode = campaign.delivery_mode || deliverySettings?.send_mode || 'now';
    const quietHoursEnabled = deliverySettings?.quiet_hours !== false;
    const rateLimit = deliverySettings?.throttle_per_minute || campaign.delivery_rate_limit || 300;
    const scheduledAt = campaign.scheduled_for || campaign.delivery_schedule || null;

    let deliveryConfigured = true;
    if (deliveryMode === 'scheduled') {
      if (!scheduledAt) {
        deliveryConfigured = false;
        blockers.push('Scheduled date and time is not set');
      } else {
        const schedTime = new Date(scheduledAt).getTime();
        if (schedTime <= Date.now()) {
          deliveryConfigured = false;
          blockers.push('Scheduled delivery date must be in the future');
        }
      }
    }

    // ── READINESS SCORING & COMPLIANCE (PHASE 2) ──
    let score = 0;

    // 1. Template selected: +20
    const templateSelected = !!campaign.template_name;
    if (templateSelected) {
      score += 20;
    } else {
      blockers.push('Please select a WhatsApp template');
    }

    // 2. Variables mapped: +20
    if (templateSelected && variablesMapped) {
      score += 20;
    } else if (templateSelected) {
      blockers.push(`Unmapped variables: ${unmappedList.join(', ')}`);
    }

    // 3. Audience configured: +20
    const audienceConfigured = !!audienceConfig && totalCount > 0;
    if (audienceConfigured) {
      score += 20;
    } else {
      blockers.push('Please select or configure your campaign audience');
    }

    // 4. Delivery configured: +15
    if (deliveryConfigured) {
      score += 15;
    } else {
      blockers.push('Delivery schedule settings are invalid');
    }

    // 5. Meta template approved: +10
    const metaApproved = templateStatus === 'APPROVED';
    if (metaApproved) {
      score += 10;
    } else {
      warnings.push(`WhatsApp template status is "${templateStatus}". Sending might fail.`);
    }

    // 6. Low spam risk: +10 (Formula: Low spam risk if spamRisk is LOW)
    const lowSpamRisk = spamRisk === 'LOW';
    if (lowSpamRisk) {
      score += 10;
    } else {
      warnings.push(`Audience volume is flagged as ${spamRisk} spam risk.`);
    }

    // 7. Quiet hours configured: +5
    if (quietHoursEnabled) {
      score += 5;
    } else {
      warnings.push('Overnight quiet hours protection is disabled.');
    }

    // Deductions
    if (invalidRemoved > 0) {
      score -= 10;
    }
    if (!variablesMapped) {
      score -= 15;
    }
    if (totalCount === 0) {
      score -= 20;
    }
    if (!deliveryConfigured) {
      score -= 15;
    }

    score = Math.max(0, Math.min(100, score));

    // Resolve structural bands
    let readinessStatus: ReadinessResult['readinessStatus'] = 'Needs attention';
    if (score === 100) {
      readinessStatus = 'Excellent';
    } else if (score >= 80) {
      readinessStatus = 'High confidence';
    } else if (score >= 60) {
      readinessStatus = 'Moderate confidence';
    } else if (score >= 40) {
      readinessStatus = 'Needs attention';
    } else {
      readinessStatus = 'Unsafe';
    }

    const estimatedDurationMin = totalCount > 0 && rateLimit > 0 ? Math.ceil(totalCount / rateLimit) : 0;
    const hygieneScore = totalCount > 0 ? Math.round(((totalCount) / (totalCount + invalidRemoved + duplicatesRemoved)) * 100) : 100;

    return {
      readinessScore: score,
      readinessStatus,
      blockers,
      warnings,
      campaignHealth: {
        spamRisk,
        hygieneScore,
      },
      compliance: {
        metaApproved,
        lowSpamRisk,
        quietHoursEnabled,
      },
      audience: {
        configured: audienceConfigured,
        totalCount,
        duplicatesRemoved,
        optedOutRemoved,
        invalidRemoved,
      },
      delivery: {
        configured: deliveryConfigured,
        mode: deliveryMode as any,
        scheduledAt,
        timezone: deliverySettings?.timezone || 'Asia/Kolkata',
        rateLimit,
        quietHoursEnabled,
        estimatedDurationMin,
      },
      template: {
        selected: templateSelected,
        name: campaign.template_name || null,
        status: templateStatus,
      },
      variables: {
        mapped: variablesMapped,
        detectedCount: detectedVarIndices.length,
        mappedCount: detectedVarIndices.length - unmappedList.length,
        unmappedList,
      },
    };
  }
}
