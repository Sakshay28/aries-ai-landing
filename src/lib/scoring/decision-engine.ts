// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Decision Engine (Phase C, Point 6)
//
// The Decision Engine is the SOLE authority on final lead status.
// AI provides intelligence. Rule engine provides the floor.
// This engine determines the composite score and final status.
//
// Status tiers: cold → warm → hot → qualified → vip
// VIP = qualified + repeat customer + score ≥ 95
//
// Confidence-based AI blending:
//   < 60%:  rule_only     (aiWeight = 0)
//   60-80%: blended       (aiWeight = 0.30)
//   80-95%: blended       (aiWeight = 0.55)
//   ≥ 95%:  ai_led        (aiWeight = 0.70)
// ═══════════════════════════════════════════════════════════════════════════

import type { GeminiConversationAnalysis, GeminiConversationAnalysisV2, Momentum } from './types';
import type { IndustryProfile }                      from './industry-profiles';
import { resolveQualificationGates }                 from './lead-scoring-engine';
import type { LeadStatus }                           from '@/lib/types';

// ── Input ─────────────────────────────────────────────────────────────────

export interface DecisionEngineInput {
  // From Tier 1 Rule Engine
  ruleScore:        number;        // 0-100, deterministic
  ruleStatus:       LeadStatus;    // rule engine's own status recommendation
  allBuyingSignals: string[];      // all accumulated signals for this lead
  prevFinalStatus:  string | null; // current status in DB (before this run)

  // From AI Analysis (null when no AI ran or AI failed)
  aiAnalysis:       GeminiConversationAnalysis | GeminiConversationAnalysisV2 | null;
  aiConfidence:     number;        // 0-100 (overall confidence, from multi-dim)

  // Lead context
  industryProfile:  IndustryProfile;
  isRepeatCustomer: boolean;
  messageCount:     number;
}

// ── Output ────────────────────────────────────────────────────────────────

export type CompositeMethod = 'rule_only' | 'blended' | 'ai_led';

export interface DecisionEngineResult {
  finalScore:        number;         // 0-100 composite score
  finalStatus:       LeadStatus;     // authoritative status
  compositeMethod:   CompositeMethod;
  aiWeightApplied:   number;         // 0.0-1.0
  aiConfidence:      number;
  qualificationMet:  boolean;
  gateSignal:        string | null;  // which signal triggered qualification
  reasoning:         string;         // human-readable
}

// ── Constants ─────────────────────────────────────────────────────────────

const THRESHOLDS = {
  COLD:      0,
  WARM:      30,
  HOT:       70,
  QUALIFIED: 90,
  VIP:       95,
} as const;

// Stage bonus: AI-confirmed stage adds points to composite
const STAGE_BONUS: Record<string, number> = {
  Negotiation: 5,
  Decision:    10,
  Booked:      15,
  'Post-Purchase': 20,
  Advocate:    20,
};

// Momentum adjustment
const MOMENTUM_ADJUSTMENT: Record<Momentum, number> = {
  Spiking:    5,
  Increasing: 2,
  Stable:     0,
  Declining: -5,
  Dormant:  -10,
};

// ── AI Weight Resolver ────────────────────────────────────────────────────

function resolveAIWeight(confidence: number): { weight: number; method: CompositeMethod } {
  if (confidence < 60) return { weight: 0,    method: 'rule_only' };
  if (confidence < 80) return { weight: 0.30, method: 'blended'   };
  if (confidence < 95) return { weight: 0.55, method: 'blended'   };
  return               { weight: 0.70, method: 'ai_led'    };
}

// ── Main Engine ───────────────────────────────────────────────────────────

export function runDecisionEngine(input: DecisionEngineInput): DecisionEngineResult {
  const {
    ruleScore, allBuyingSignals, prevFinalStatus,
    aiAnalysis, aiConfidence, industryProfile,
    isRepeatCustomer,
  } = input;

  // ── Step 1: V2 analysis — score-first, gate-enforced ────────────────────
  // The AI supplies a score/reason; it does NOT get to pick the pipeline stage.
  // Status is derived deterministically from the (floored) score + the
  // qualification gate — same rules as the V1 path — so Gemini can never stamp a
  // lead 'qualified' just by saying so, and can never drop it below the rule floor.
  if (aiAnalysis && 'stage' in aiAnalysis) {
    const v2 = aiAnalysis as GeminiConversationAnalysisV2;

    // AI-as-floor: the model's score can lift the rule score but never lower it.
    const aiScore        = Math.max(0, Math.min(100, v2.score ?? ruleScore));
    const compositeScore = Math.max(ruleScore, aiScore);

    // Qualification requires an explicit closing signal — not the AI's word.
    const qualGates  = resolveQualificationGates(industryProfile);
    const gateSignal = allBuyingSignals.find(s => qualGates.has(s)) ?? null;
    const qualMet    = gateSignal !== null && compositeScore >= THRESHOLDS.QUALIFIED;

    const finalStatus = deriveStatus(compositeScore, qualMet, isRepeatCustomer, prevFinalStatus);
    const aiLifted    = aiScore > ruleScore;

    return {
      finalScore:       compositeScore,
      finalStatus,
      compositeMethod:  aiLifted ? 'ai_led' : 'rule_only',
      aiWeightApplied:  aiLifted ? 1.0 : 0,
      aiConfidence:     v2.confidence ?? 0,
      qualificationMet: qualMet,
      gateSignal,
      reasoning:
        `V2: rule=${ruleScore}, ai=${aiScore} → composite=${compositeScore} (rule-floored). ` +
        `Gemini stage='${v2.stage}' ignored for status; score-derived → ${finalStatus}. ` +
        `Gate=${gateSignal ?? 'none'}. ${(v2.reason || v2.explanation || '').trim()}`.trim(),
    };
  }

  // ── Step 1: Determine blending weight (V1 fallback) ────────────────────
  const { weight: aiWeight, method: compositeMethod } = resolveAIWeight(aiConfidence);

  // ── Step 2: Compute composite base score ────────────────────────────────
  let compositeScore = ruleScore;
  if (aiAnalysis && aiWeight > 0) {
    // AI-as-floor: AI can never bring score below the rule engine floor
    const aiBuyingIntent = Math.max(0, Math.min(100, (aiAnalysis as GeminiConversationAnalysis).buyingIntent));
    const blended = ruleScore * (1 - aiWeight) + aiBuyingIntent * aiWeight;
    // Honor the floor: composite is always >= ruleScore
    compositeScore = Math.max(ruleScore, Math.round(blended));
  }


  // ── Step 3: Stage bonus (only when AI confident about stage) ────────────
  if (aiAnalysis && aiConfidence >= 70) {
    const stageBonus = STAGE_BONUS[aiAnalysis.salesStage ?? ''] ?? 0;
    compositeScore = Math.min(100, compositeScore + stageBonus);
  }

  // ── Step 4: Momentum adjustment ─────────────────────────────────────────
  if (aiAnalysis) {
    const momentumAdj = MOMENTUM_ADJUSTMENT[aiAnalysis.momentum ?? 'Stable'] ?? 0;
    compositeScore = Math.min(100, Math.max(0, compositeScore + momentumAdj));
  }

  // ── Step 5: Qualification gate check ────────────────────────────────────
  const qualGates   = resolveQualificationGates(industryProfile);
  const gateSignal  = allBuyingSignals.find(s => qualGates.has(s)) ?? null;
  const qualMet     = gateSignal !== null && compositeScore >= THRESHOLDS.QUALIFIED;

  // ── Step 6: Determine final status ──────────────────────────────────────
  const finalStatus: LeadStatus = deriveStatus(compositeScore, qualMet, isRepeatCustomer, prevFinalStatus);

  // ── Step 7: Build reasoning string ──────────────────────────────────────
  const aiPart = aiAnalysis
    ? `AI(${aiAnalysis.salesStage} stage, intent=${aiAnalysis.buyingIntent}, conf=${aiConfidence}%) weight=${Math.round(aiWeight * 100)}%`
    : 'AI not available';
  const reasoning = `Rule=${ruleScore} → Composite=${compositeScore} via ${compositeMethod}. ${aiPart}. Stage=${aiAnalysis?.salesStage ?? 'N/A'} bonus=${STAGE_BONUS[aiAnalysis?.salesStage ?? ''] ?? 0}. Gate=${gateSignal ?? 'none'}. → ${finalStatus}`;

  return {
    finalScore:       compositeScore,
    finalStatus,
    compositeMethod,
    aiWeightApplied:  aiWeight,
    aiConfidence,
    qualificationMet: qualMet,
    gateSignal,
    reasoning,
  };
}

// ── Status Derivation ─────────────────────────────────────────────────────

function deriveStatus(
  score:          number,
  qualMet:        boolean,
  isRepeat:       boolean,
  prevStatus:     string | null,
): LeadStatus {
  // Terminal states
  if (prevStatus === 'converted') return 'converted';
  if (prevStatus === 'lost')      return 'lost';

  if (qualMet && isRepeat && score >= THRESHOLDS.VIP) return 'qualified'; // VIP mapped to qualified for DB enum
  if (qualMet && score >= THRESHOLDS.QUALIFIED)       return 'qualified';
  if (score >= THRESHOLDS.HOT)                        return 'hot';
  if (score >= THRESHOLDS.WARM)                       return 'warm';
  return 'cold';
}

// ── Explainability context for decision ───────────────────────────────────

export interface DecisionContext {
  final_score:       number;
  composite_method:  CompositeMethod;
  ai_confidence:     number;
  ai_weight_applied: number;
  qualification_met: boolean;
  gate_signal:       string | null;
}

export function toDecisionContext(result: DecisionEngineResult): DecisionContext {
  return {
    final_score:       result.finalScore,
    composite_method:  result.compositeMethod,
    ai_confidence:     result.aiConfidence,
    ai_weight_applied: result.aiWeightApplied,
    qualification_met: result.qualificationMet,
    gate_signal:       result.gateSignal,
  };
}
