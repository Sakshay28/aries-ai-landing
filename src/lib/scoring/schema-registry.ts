// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Schema Registry (REQ 4)
//
// Never trust free-form JSON from AI providers.
// Every AI response is validated against a versioned schema before use.
// Schemas evolve independently from prompts.
// ═══════════════════════════════════════════════════════════════════════════

import type { GeminiConversationAnalysis } from './types';

export interface SchemaRecord {
  schemaKey:   string;
  version:     string;
  description: string;
  isActive:    boolean;
  validate(data: unknown): ValidationResult;
}

export interface ValidationResult {
  valid:   boolean;
  parsed?: GeminiConversationAnalysis;
  errors:  string[];
  warnings: string[];
}

// ── Schema v1: LeadAnalysis ───────────────────────────────────────────────
// Full schema for conversation_analysis prompt output.

const REQUIRED_NUMBER_FIELDS = [
  'buyingIntent', 'urgency', 'trust', 'engagement', 'budgetScore',
  'commitment', 'negotiation', 'conversionProbability', 'conversationQuality',
  'confidence', 'intentConfidence', 'stageConfidence', 'recommendationConfidence',
  'buyingIntentConfidence', 'entityExtractionConfidence',
] as const;

const REQUIRED_STRING_FIELDS = [
  'budgetSensitivity', 'salesStage', 'momentum', 'negotiationState',
  'explanation', 'recommendation', 'whyHot', 'whyNotQualified', 'salesSummary',
  'recommendationPriority', 'expectedImpact', 'recommendationReason',
] as const;

const REQUIRED_ARRAY_FIELDS = [
  'intentHistory', 'objections', 'detectedSignals', 'missingSignals', 'keyMoments',
] as const;

const VALID_SALES_STAGES = new Set([
  'Awareness', 'Interest', 'Consideration', 'Evaluation',
  'Negotiation', 'Decision', 'Booked', 'Post-Purchase', 'Advocate', 'Unknown',
]);
const VALID_MOMENTUM  = new Set(['Increasing', 'Stable', 'Declining', 'Spiking', 'Dormant']);
const VALID_BUDGET    = new Set(['Low', 'Medium', 'High', 'Unknown']);
const VALID_NEG_STATE = new Set(['none', 'exploring', 'active', 'final']);
const VALID_PRIORITY  = new Set(['critical', 'high', 'medium', 'low']);

function clampScore(v: unknown, field: string, errors: string[]): number {
  if (typeof v !== 'number' || isNaN(v)) {
    errors.push(`${field}: expected number, got ${typeof v}`);
    return 0;
  }
  const clamped = Math.round(Math.max(0, Math.min(100, v)));
  return clamped;
}

function validateEnum(v: unknown, validSet: Set<string>, field: string, fallback: string, errors: string[]): string {
  if (typeof v !== 'string' || !validSet.has(v)) {
    errors.push(`${field}: invalid value "${v}", expected one of: ${[...validSet].join(', ')}`);
    return fallback;
  }
  return v;
}

function validateMemoryUpdates(raw: unknown): GeminiConversationAnalysis['memoryUpdates'] {
  if (!raw || typeof raw !== 'object') return {};
  const m = raw as Record<string, unknown>;
  return {
    customerName:             typeof m.customerName === 'string'   ? m.customerName            : undefined,
    language:                 typeof m.language === 'string'        ? m.language                : undefined,
    communicationPreference:  typeof m.communicationPreference === 'string' ? (m.communicationPreference as any) : undefined,
    travellingWithFamily:     typeof m.travellingWithFamily === 'boolean'  ? m.travellingWithFamily  : undefined,
    groupSize:                typeof m.groupSize === 'number'       ? m.groupSize               : undefined,
    groupComposition:         typeof m.groupComposition === 'string' ? m.groupComposition       : undefined,
    budgetMin:                typeof m.budgetMin === 'number'       ? m.budgetMin               : undefined,
    budgetMax:                typeof m.budgetMax === 'number'       ? m.budgetMax               : undefined,
    preferredDestination:     typeof m.preferredDestination === 'string' ? m.preferredDestination : undefined,
    preferredTravelMonth:     typeof m.preferredTravelMonth === 'string'  ? m.preferredTravelMonth  : undefined,
    dietaryRequirements:      typeof m.dietaryRequirements === 'string'   ? m.dietaryRequirements   : undefined,
    fitnessConcern:           typeof m.fitnessConcern === 'boolean'  ? m.fitnessConcern          : undefined,
    airportPickupNeeded:      typeof m.airportPickupNeeded === 'boolean' ? m.airportPickupNeeded  : undefined,
    discountRequested:        typeof m.discountRequested === 'boolean' ? m.discountRequested      : undefined,
    discountAmountRequested:  typeof m.discountAmountRequested === 'number' ? m.discountAmountRequested : undefined,
    priceSensitivity:         VALID_BUDGET.has(String(m.priceSensitivity)) ? (m.priceSensitivity as any) : undefined,
    knownObjections:          Array.isArray(m.knownObjections) ? m.knownObjections.map(String) : undefined,
    knownPreferences:         Array.isArray(m.knownPreferences) ? m.knownPreferences.map(String) : undefined,
    discoveredFacts:          typeof m.discoveredFacts === 'object' && m.discoveredFacts !== null ? (m.discoveredFacts as Record<string, unknown>) : undefined,
  };
}

function validateLeadAnalysisV1(data: unknown): ValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Response is not an object'], warnings };
  }

  const raw = data as Record<string, unknown>;

  // Clamp numeric scores
  const scores: Record<string, number> = {};
  for (const field of REQUIRED_NUMBER_FIELDS) {
    scores[field] = clampScore(raw[field], field, errors);
  }

  // Validate enums
  const salesStage       = validateEnum(raw.salesStage,        VALID_SALES_STAGES, 'salesStage',        'Unknown', errors);
  const momentum         = validateEnum(raw.momentum,          VALID_MOMENTUM,     'momentum',          'Stable',  errors);
  const budgetSensitivity = validateEnum(raw.budgetSensitivity, VALID_BUDGET,      'budgetSensitivity', 'Unknown', warnings);
  const negotiationState = validateEnum(raw.negotiationState,   VALID_NEG_STATE,   'negotiationState',  'none',    warnings);
  const recPriority      = validateEnum(raw.recommendationPriority, VALID_PRIORITY, 'recommendationPriority', 'medium', warnings);

  // Coerce string fields
  const strings: Record<string, string> = {};
  for (const field of REQUIRED_STRING_FIELDS) {
    strings[field] = typeof raw[field] === 'string' ? String(raw[field]) : '';
    if (!strings[field]) warnings.push(`${field}: empty string`);
  }

  // Coerce array fields
  const arrays: Record<string, string[]> = {};
  for (const field of REQUIRED_ARRAY_FIELDS) {
    arrays[field] = Array.isArray(raw[field]) ? (raw[field] as unknown[]).map(String) : [];
  }

  const groupBooking = typeof raw.groupBooking === 'boolean' ? raw.groupBooking : false;
  const groupSize    = typeof raw.groupSize === 'number' ? raw.groupSize : null;
  const automationEligible = typeof raw.automationEligible === 'boolean' ? raw.automationEligible : false;
  const estimatedCloseProbImprovement = typeof raw.estimatedCloseProbImprovement === 'number'
    ? Math.round(Math.max(0, Math.min(100, raw.estimatedCloseProbImprovement))) : 0;

  const parsed: GeminiConversationAnalysis = {
    buyingIntent:          scores.buyingIntent,
    urgency:               scores.urgency,
    trust:                 scores.trust,
    engagement:            scores.engagement,
    budgetScore:           scores.budgetScore,
    commitment:            scores.commitment,
    negotiation:           scores.negotiation,
    conversionProbability: scores.conversionProbability,
    conversationQuality:   scores.conversationQuality,
    confidence:            scores.confidence,
    intentConfidence:      scores.intentConfidence,
    stageConfidence:       scores.stageConfidence,
    recommendationConfidence:   scores.recommendationConfidence,
    buyingIntentConfidence:     scores.buyingIntentConfidence,
    entityExtractionConfidence: scores.entityExtractionConfidence,
    budgetSensitivity:  budgetSensitivity as any,
    salesStage:         salesStage as any,
    momentum:           momentum as any,
    negotiationState:   negotiationState as any,
    intentHistory:      arrays.intentHistory,
    groupBooking,
    groupSize,
    objections:         arrays.objections,
    detectedSignals:    arrays.detectedSignals,
    missingSignals:     arrays.missingSignals,
    keyMoments:         arrays.keyMoments,
    explanation:           strings.explanation,
    recommendation:        strings.recommendation,
    whyHot:                strings.whyHot,
    whyNotQualified:       strings.whyNotQualified,
    salesSummary:          strings.salesSummary,
    recommendationPriority: recPriority as any,
    expectedImpact:         strings.expectedImpact,
    recommendationReason:   strings.recommendationReason,
    automationEligible,
    estimatedCloseProbImprovement,
    memoryUpdates: validateMemoryUpdates(raw.memoryUpdates),
  };

  return { valid: errors.length === 0, parsed, errors, warnings };
}

// ── Schema Store ──────────────────────────────────────────────────────────

const SCHEMA_STORE: Map<string, SchemaRecord> = new Map([
  ['lead_analysis:v1', {
    schemaKey:   'lead_analysis',
    version:     'v1',
    description: 'Phase C v1: Full conversation intelligence schema with multi-dimensional confidence and memory extraction',
    isActive:    true,
    validate:    validateLeadAnalysisV1,
  }],
]);

// ── Public API ────────────────────────────────────────────────────────────

export function getSchema(schemaKey: string, version?: string): SchemaRecord {
  const ver = version ?? getLatestSchemaVersion(schemaKey);
  const record = SCHEMA_STORE.get(`${schemaKey}:${ver}`);
  if (!record) throw new Error(`No schema found for key="${schemaKey}" version="${ver}"`);
  return record;
}

export function getLatestSchemaVersion(schemaKey: string): string {
  const active = [...SCHEMA_STORE.values()]
    .filter(s => s.schemaKey === schemaKey && s.isActive)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  if (!active.length) throw new Error(`No active schema for key="${schemaKey}"`);
  return active[0].version;
}

export function validateResponse(schemaKey: string, version: string, data: unknown): ValidationResult {
  return getSchema(schemaKey, version).validate(data);
}

export function registerSchema(record: SchemaRecord): void {
  SCHEMA_STORE.set(`${record.schemaKey}:${record.version}`, record);
}

/** Try to parse JSON from AI response, stripping markdown fences if present. */
export function extractJSON(raw: string): unknown {
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(stripped);
}
