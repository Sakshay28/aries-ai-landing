// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Feature Flags (REQ 13)
//
// 5-scope hierarchy: Global → Tenant → Industry → Conversation → Lead
// Each scope overrides the previous. Most-specific scope wins.
// This enables safe rollouts without any code changes.
// ═══════════════════════════════════════════════════════════════════════════

export interface LeadIntelligenceFlags {
  // AI capabilities
  enable_ai:                          boolean;
  enable_conversation_intelligence:   boolean;
  enable_confidence_gate:             boolean;
  enable_incremental_analysis:        boolean;

  // Signal detection
  enable_negotiation_detection:       boolean;
  enable_commitment_detection:        boolean;
  enable_group_booking_detection:     boolean;
  enable_urgency_detection:           boolean;
  enable_comparison_detection:        boolean;

  // Memory and intelligence
  enable_conversation_memory:         boolean;
  enable_cross_conversation_analysis: boolean;
  enable_momentum_tracking:           boolean;

  // Actions and quality
  enable_automation:                  boolean;
  enable_ai_recommendations:          boolean;
  enable_human_feedback:              boolean;

  // Platform capabilities
  enable_replay_engine:               boolean;
  enable_cost_tracking:               boolean;

  // Industry routing
  industry_module:                    string;
}

export const DEFAULT_FLAGS: LeadIntelligenceFlags = {
  enable_ai:                          true,
  enable_conversation_intelligence:   true,
  enable_confidence_gate:             true,
  enable_incremental_analysis:        true,
  enable_negotiation_detection:       true,
  enable_commitment_detection:        true,
  enable_group_booking_detection:     true,
  enable_urgency_detection:           true,
  enable_comparison_detection:        true,
  enable_conversation_memory:         true,
  enable_cross_conversation_analysis: false,
  enable_momentum_tracking:           true,
  enable_automation:                  true,
  enable_ai_recommendations:          true,
  enable_human_feedback:              true,
  enable_replay_engine:               false,
  enable_cost_tracking:               true,
  industry_module:                    'auto',
};

// ── REQ 13: 5-Scope Resolution Context ───────────────────────────────────

export interface FlagResolutionContext {
  /** Platform-wide defaults — bottom of the stack */
  global?:       Partial<LeadIntelligenceFlags>;
  /** Tenant overrides — applied on top of global */
  tenant?:       Partial<LeadIntelligenceFlags>;
  /** Industry-specific overrides */
  industry?:     Partial<LeadIntelligenceFlags>;
  /** Conversation-level overrides */
  conversation?: Partial<LeadIntelligenceFlags>;
  /** Lead-level overrides — highest specificity, applied last */
  lead?:         Partial<LeadIntelligenceFlags>;
}

/**
 * Resolves feature flags by merging 5 scopes, most-specific wins.
 * Order applied: Global → Tenant → Industry → Conversation → Lead
 */
export function resolveFlags(
  ctx: FlagResolutionContext | Partial<LeadIntelligenceFlags> | null | undefined,
): LeadIntelligenceFlags {
  if (ctx === null || ctx === undefined) return { ...DEFAULT_FLAGS };
  // Backward-compat: flat Partial<LeadIntelligenceFlags> from old callers
  if (isFlatFlags(ctx)) return { ...DEFAULT_FLAGS, ...ctx };

  const c = ctx as FlagResolutionContext;
  return {
    ...DEFAULT_FLAGS,
    ...(c.global       ?? {}),
    ...(c.tenant       ?? {}),
    ...(c.industry     ?? {}),
    ...(c.conversation ?? {}),
    ...(c.lead         ?? {}),
  };
}

/**
 * Builds a FlagResolutionContext from the DB columns that store flags.
 * tenantFlags    — tenants.lead_intelligence_flags
 * industryKey    — resolved industry (e.g. 'travel')
 * industryOverrides — tenants.industry_flag_overrides
 * leadFlags      — leads.feature_flag_overrides
 */
export function buildFlagContext(
  tenantFlags:       Partial<LeadIntelligenceFlags> | null | undefined,
  industryKey:       string | null | undefined,
  industryOverrides: Record<string, Partial<LeadIntelligenceFlags>> | null | undefined,
  leadFlags:         Partial<LeadIntelligenceFlags> | null | undefined,
): FlagResolutionContext {
  const industryOverride: Partial<LeadIntelligenceFlags> =
    (industryKey ? industryOverrides?.[industryKey] : undefined) ?? {};
  return {
    tenant:   tenantFlags ?? {},
    industry: industryOverride,
    lead:     leadFlags   ?? {},
  };
}

function isFlatFlags(obj: object): obj is Partial<LeadIntelligenceFlags> {
  return !('global' in obj || 'tenant' in obj || 'industry' in obj || 'conversation' in obj || 'lead' in obj);
}
