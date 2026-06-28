// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Replay Engine (REQ 12)
//
// After changing a prompt, schema, weight, or decision algorithm:
// 1. Select historical analyses to replay
// 2. Run them through the new version WITHOUT modifying originals
// 3. Store replay_result and comparison side-by-side
// 4. Sales team validates before deploying the new version
//
// The replay produces a parallel analysis record (is_replay=true).
// Original history is NEVER touched.
// ═══════════════════════════════════════════════════════════════════════════

import type { AIAnalysisRecord } from './types';

// ── Replay Plan ───────────────────────────────────────────────────────────

export type ReplayTrigger =
  | 'prompt_change'
  | 'weight_change'
  | 'logic_change'
  | 'industry_rule_change'
  | 'schema_change'
  | 'manual';

export interface ReplayPlan {
  trigger:         ReplayTrigger;
  reason:          string;
  promptVersionOld: string | null;
  promptVersionNew: string | null;
  schemaVersionOld: string | null;
  schemaVersionNew: string | null;
  engineVersionOld: string | null;
  engineVersionNew: string | null;
  analysisIds:     string[];  // which analyses to replay
  sessionId:       string;    // groups all replays in this batch
}

// ── Analysis Comparison ───────────────────────────────────────────────────

export interface DimensionDiff {
  field:    string;
  original: number | string | boolean | null;
  replay:   number | string | boolean | null;
  delta:    number | null;  // for numeric fields
  changed:  boolean;
}

export interface AnalysisComparison {
  analysisId:         string;
  replayAnalysisId:   string;
  dimensionDiffs:     DimensionDiff[];
  statusChanged:      boolean;
  stageChanged:       boolean;
  momentumChanged:    boolean;
  overallDelta:       number;  // buying_intent new - old
  agreementScore:     number;  // 0-100: how similar are the two analyses
  significantChange:  boolean; // true if buying_intent or status differs >10 points
}

const NUMERIC_DIMENSIONS: Array<keyof AIAnalysisRecord> = [
  'buying_intent', 'urgency_score', 'trust_score', 'engagement_score',
  'budget_score', 'commitment_score', 'negotiation_score',
  'conversation_quality', 'conversion_probability',
  'confidence', 'intent_confidence', 'stage_confidence',
  'recommendation_confidence', 'buying_intent_confidence',
];

const STRING_DIMENSIONS: Array<keyof AIAnalysisRecord> = [
  'sales_stage', 'momentum', 'budget_sensitivity',
];

export function compareAnalyses(
  original: Partial<AIAnalysisRecord>,
  replay:   Partial<AIAnalysisRecord>,
): AnalysisComparison {
  const diffs: DimensionDiff[] = [];
  let totalDelta = 0;
  let matchingDimensions = 0;

  for (const field of NUMERIC_DIMENSIONS) {
    const orig  = (original[field] as number | null) ?? 0;
    const rep   = (replay[field]   as number | null) ?? 0;
    const delta = rep - orig;
    const changed = delta !== 0;
    if (!changed) matchingDimensions++;
    diffs.push({ field: String(field), original: orig, replay: rep, delta, changed });
    if (field === 'buying_intent') totalDelta = delta;
  }

  for (const field of STRING_DIMENSIONS) {
    const orig    = (original[field] as string | null) ?? null;
    const rep     = (replay[field]   as string | null) ?? null;
    const changed = orig !== rep;
    if (!changed) matchingDimensions++;
    diffs.push({ field: String(field), original: orig, replay: rep, delta: null, changed });
  }

  const totalDimensions  = NUMERIC_DIMENSIONS.length + STRING_DIMENSIONS.length;
  const agreementScore   = Math.round((matchingDimensions / totalDimensions) * 100);
  const statusChanged    = original.sales_stage !== replay.sales_stage;
  const stageChanged     = original.sales_stage !== replay.sales_stage;
  const momentumChanged  = original.momentum    !== replay.momentum;
  const significantChange = Math.abs(totalDelta) > 10 || statusChanged;

  return {
    analysisId:       String(original.id ?? ''),
    replayAnalysisId: String(replay.id ?? ''),
    dimensionDiffs:   diffs,
    statusChanged,
    stageChanged,
    momentumChanged,
    overallDelta:     totalDelta,
    agreementScore,
    significantChange,
  };
}

// ── Snapshot Builder for Replay ───────────────────────────────────────────

export function buildOriginalResultSnapshot(analysis: Partial<AIAnalysisRecord>): Record<string, unknown> {
  return {
    buyingIntent:          analysis.buying_intent,
    urgency:               analysis.urgency_score,
    trust:                 analysis.trust_score,
    engagement:            analysis.engagement_score,
    budget:                analysis.budget_score,
    commitment:            analysis.commitment_score,
    negotiation:           analysis.negotiation_score,
    conversationQuality:   analysis.conversation_quality,
    conversionProbability: analysis.conversion_probability,
    confidence:            analysis.confidence,
    salesStage:            analysis.sales_stage,
    momentum:              analysis.momentum,
    promptVersion:         analysis.prompt_version,
    schemaVersion:         analysis.schema_version,
    createdAt:             analysis.created_at,
  };
}

// ── Replay Batch Planner ──────────────────────────────────────────────────

export interface ReplayBatchOptions {
  /** Only replay analyses with confidence above this threshold (avoids replaying already-uncertain analyses) */
  minConfidence?: number;
  /** Limit the replay to the N most recent analyses per lead */
  maxPerLead?: number;
  /** Only replay analyses from the last N days */
  maxAgeDays?: number;
}

export function shouldReplayAnalysis(
  analysis:   Partial<AIAnalysisRecord>,
  options:    ReplayBatchOptions,
  plan:       ReplayPlan,
): boolean {
  // Never replay a replay
  if (analysis.is_replay) return false;

  if (options.minConfidence !== undefined) {
    if ((analysis.confidence ?? 0) < options.minConfidence) return false;
  }

  if (options.maxAgeDays !== undefined) {
    const ageMs = Date.now() - new Date(analysis.created_at ?? 0).getTime();
    if (ageMs > options.maxAgeDays * 24 * 60 * 60 * 1000) return false;
  }

  // Industry-specific replay: only replay analyses for leads with matching industry module
  if (plan.trigger === 'industry_rule_change' && plan.reason.includes('travel')) {
    if (analysis.signal_engine_version && !analysis.prompt_version?.includes('travel')) {
      // Skip non-travel analyses for travel rule changes
      // (In practice, filter by lead.industry in the query, not here)
    }
  }

  return true;
}
