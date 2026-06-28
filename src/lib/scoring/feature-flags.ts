// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Feature Flags
//
// Every major capability is per-tenant toggleable.
// Flags are stored in tenants.lead_intelligence_flags JSONB (Phase B migration).
// Until the column exists, DEFAULT_FLAGS apply universally.
// ═══════════════════════════════════════════════════════════════════════════

export interface LeadIntelligenceFlags {
  // Core AI analysis
  enable_ai: boolean;
  enable_conversation_intelligence: boolean; // Tier 2 Gemini full-conversation analysis
  enable_confidence_gate: boolean;           // ignore low-confidence AI

  // Signal detection
  enable_negotiation_detection: boolean;     // discount/negotiate patterns
  enable_commitment_detection: boolean;      // preparation/logistics patterns
  enable_group_booking_detection: boolean;   // group size patterns
  enable_urgency_detection: boolean;         // urgency/time-pressure patterns
  enable_comparison_detection: boolean;      // competitor comparison patterns

  // Advanced intelligence
  enable_conversation_memory: boolean;       // living conversation profile JSONB
  enable_cross_conversation_analysis: boolean; // lead-level analysis across all convs
  enable_momentum_tracking: boolean;         // score velocity tracking

  // Actions
  enable_automation: boolean;               // fire automations on status upgrades
  enable_ai_recommendations: boolean;       // show AI next-step recommendations
  enable_human_feedback: boolean;           // let sales team mark AI correct/wrong

  // Industry
  industry_module: string;                  // override auto-detected industry
}

export const DEFAULT_FLAGS: LeadIntelligenceFlags = {
  enable_ai:                        true,
  enable_conversation_intelligence: true,
  enable_confidence_gate:           true,

  enable_negotiation_detection:  true,
  enable_commitment_detection:   true,
  enable_group_booking_detection: true,
  enable_urgency_detection:      true,
  enable_comparison_detection:   true,

  enable_conversation_memory:         true,
  enable_cross_conversation_analysis: false, // enabled only when multi-conv data exists
  enable_momentum_tracking:           true,

  enable_automation:        true,
  enable_ai_recommendations: true,
  enable_human_feedback:    true,

  industry_module: 'auto',
};

// Merge tenant overrides with defaults — unknown keys are ignored.
export function resolveFlags(tenantFlags: Partial<LeadIntelligenceFlags> | null | undefined): LeadIntelligenceFlags {
  if (!tenantFlags) return DEFAULT_FLAGS;
  return { ...DEFAULT_FLAGS, ...tenantFlags };
}
