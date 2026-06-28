// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — TypeScript Interfaces for all DB Entities
// ═══════════════════════════════════════════════════════════════════════════

export type Momentum = 'Increasing' | 'Stable' | 'Declining' | 'Spiking' | 'Dormant';

export type SalesStage =
  | 'Awareness' | 'Interest' | 'Consideration' | 'Evaluation'
  | 'Negotiation' | 'Decision' | 'Booked' | 'Post-Purchase' | 'Advocate'
  | 'Unknown';

export type BudgetSensitivity = 'Low' | 'Medium' | 'High' | 'Unknown';

export type NegotiationState = 'none' | 'exploring' | 'active' | 'final';

export type EventCategory = 'signal' | 'milestone' | 'ai' | 'status' | 'stage' | 'correction' | 'decay' | 'recommendation' | 'memory' | 'system';
export type EventTrigger  = 'engine' | 'ai' | 'manual' | 'decay' | 'system' | 'backfill' | 'replay';
export type JobStatus     = 'pending' | 'processing' | 'done' | 'failed' | 'dead' | 'skipped';
export type SkipReason    = 'trivial_message' | 'cache_hit' | 'no_meaningful_change' | 'flags_disabled' | 'rate_limited';
export type TriggerType   = 'message' | 'manual' | 'cron' | 'backfill' | 'status_change' | 'replay';
export type ActionPriority = 'critical' | 'high' | 'medium' | 'low';
export type FallbackLevel  = 0 | 1 | 2 | 3 | 4 | 5;

// ── Multi-dimensional scores (all 0–100) ───────────────────────────────────

export interface MultiDimensionalScores {
  buying_intent:         number;
  urgency_score:         number;
  trust_score:           number;
  engagement_score:      number;
  budget_score:          number;
  commitment_score:      number;
  negotiation_score:     number;
  conversation_quality:  number;
  conversion_probability: number;
}

// ── REQ 9: Multi-dimensional confidence (one per scoring dimension) ────────

export interface MultiDimensionalConfidence {
  overall:             number;  // 0-100 — overall AI confidence
  intent:              number;  // how confident about current_intent
  stage:               number;  // how confident about sales_stage classification
  recommendation:      number;  // how confident about the recommendation
  buying_intent:       number;  // how confident about buying_intent score
  entity_extraction:   number;  // how confident about extracted facts (name, group, dates)
}

// ── REQ 1A: ConversationState — ephemeral, replaced each AI analysis ───────

export interface ConversationState {
  id:              string;
  tenant_id:       string;
  lead_id:         string;
  conversation_id: string;

  current_stage:         SalesStage;
  current_momentum:      Momentum;
  momentum_trend:        number[];

  current_intent:        string | null;
  current_buying_intent: number;
  negotiation_state:     NegotiationState;
  current_objections:    string[];

  last_analysis_id:          string | null;
  last_analyzed_at:          string | null;
  latest_recommendation_id:  string | null;

  conversation_hash:         string | null;
  message_count_at_analysis: number | null;

  created_at: string;
  updated_at: string;
}

// ── REQ 1B: ConversationMemory — persistent discovered facts ───────────────

export interface BudgetRange {
  min:      number | null;
  max:      number | null;
  currency: string;
}

export interface ConversationMemory {
  id:              string;
  tenant_id:       string;
  lead_id:         string;
  conversation_id: string;

  // Personal facts
  customer_name:             string | null;
  language:                  string | null;
  communication_preference:  'whatsapp' | 'call' | 'email' | 'any' | null;

  // Group
  travelling_with_family: boolean | null;
  group_size:             number | null;
  group_composition:      string | null;

  // Budget
  budget_range_min:  number | null;
  budget_range_max:  number | null;
  budget_currency:   string;

  // Preferences
  preferred_destination:   string | null;
  preferred_travel_month:  string | null;
  dietary_requirements:    string | null;
  fitness_concern:         boolean | null;
  airport_pickup_needed:   boolean | null;

  // Negotiation facts
  discount_requested:         boolean;
  discount_amount_requested:  number | null;
  last_offered_price:         number | null;
  price_sensitivity:          BudgetSensitivity;

  // Persistent lists
  known_objections:  string[];
  known_preferences: string[];

  // Industry-specific free-form bucket
  discovered_facts:  Record<string, unknown>;
  fact_timestamps:   Record<string, string>;

  facts_extracted_by: 'engine' | 'ai' | 'manual' | 'backfill';

  created_at: string;
  updated_at: string;
}

// ── REQ 2: Lead Profile → Customer Intelligence ───────────────────────────

export interface PurchaseRecord {
  name:   string;
  value:  number | null;
  date:   string;
  status: 'completed' | 'cancelled' | 'pending';
}

export interface BookingRecord {
  destination: string;
  date:        string;
  value:       number | null;
  rating:      number | null;
}

export interface NegotiationRecord {
  date:     string;
  offered:  number;
  accepted: number | null;
  outcome:  'accepted' | 'rejected' | 'pending';
}

export interface CustomerIntelligence {
  id:        string;
  tenant_id: string;
  lead_id:   string;

  // Relationship
  is_repeat_customer:    boolean;
  customer_segment:      'VIP' | 'Regular' | 'Occasional' | 'New' | 'At-Risk' | 'Lost' | null;
  risk_category:         BudgetSensitivity;
  relationship_strength: number;  // 0-100
  salesperson_notes:     string | null;

  // Purchase history
  estimated_lifetime_value:   number | null;
  total_deal_value:           number | null;
  previous_purchases:         PurchaseRecord[];
  previous_bookings:          BookingRecord[];
  industries_enquired:        string[];
  typical_budget_min:         number | null;
  typical_budget_max:         number | null;
  historical_conversion_rate: number | null;  // 0.0–1.0

  // Response behaviour
  avg_response_delay_mins: number | null;
  response_consistency:    'High' | 'Medium' | 'Low' | 'Unknown';
  preferred_contact_time:  string | null;
  best_contact_channel:    'whatsapp' | 'call' | 'email' | 'any' | null;

  // Negotiation history
  past_negotiations:          NegotiationRecord[];
  max_discount_ever_accepted: number | null;

  // Lead scoring summary
  conversation_count:     number;
  total_messages:         number;
  lifetime_buying_intent: number;
  peak_buying_intent:     number;
  peak_intent_at:         string | null;
  lifetime_momentum:      Momentum;
  intent_trend:           number[];

  first_contact_at: string | null;
  last_contact_at:  string | null;

  created_at: string;
  updated_at: string;
}

// ── AI Analysis Record ────────────────────────────────────────────────────

export interface AIAnalysisRecord extends MultiDimensionalScores {
  id:              string;
  tenant_id:       string;
  lead_id:         string;
  conversation_id: string | null;
  message_id:      string | null;

  analysis_type:    'conversation' | 'lead' | 'manual' | 'replay';
  analysis_trigger: TriggerType;

  budget_sensitivity: BudgetSensitivity | null;
  sales_stage:        SalesStage | null;
  momentum:           Momentum | null;

  intent_history:   string[];
  objections:       string[];
  detected_signals: string[];
  missing_signals:  string[];
  key_moments:      string[];

  group_booking: boolean;
  group_size:    number | null;

  explanation:       string | null;
  recommendation:    string | null;
  why_hot:           string | null;
  why_not_qualified: string | null;
  sales_summary:     string | null;

  // REQ 9: Multi-dimensional confidence
  confidence:                   number;
  intent_confidence:            number;
  stage_confidence:             number;
  recommendation_confidence:    number;
  buying_intent_confidence:     number;
  entity_extraction_confidence: number;
  decision_confidence:          number | null;

  // Versioning
  prompt_version:          string;
  schema_version:          string;
  signal_engine_version:   string;
  decision_engine_version: string;
  industry_pack_version:   string;
  reasoning_version:       string;

  // Provider
  provider:           string;
  model:              string;
  tokens_in:          number | null;
  tokens_out:         number | null;
  estimated_cost_usd: number | null;
  latency_ms:         number | null;

  // Incremental analysis
  was_incremental:            boolean;
  incremental_message_count:  number | null;
  full_context_message_count: number | null;

  // Cache
  conversation_hash: string | null;
  cache_hit:         boolean;
  fallback_level:    FallbackLevel;

  // Observability
  execution_id:   string | null;
  queue_wait_ms:  number | null;
  processing_ms:  number | null;
  retry_count:    number;
  parsing_errors: string[];

  is_replay:           boolean;
  replays_analysis_id: string | null;

  created_at: string;
}

// ── REQ 10 + 14: Rich Recommendation ─────────────────────────────────────

export interface RichRecommendation {
  id:              string;
  tenant_id:       string;
  lead_id:         string;
  conversation_id: string | null;
  analysis_id:     string | null;

  title:            string;
  summary:          string;
  suggested_action: string;

  // REQ 14 expanded fields
  priority:          ActionPriority;
  expected_impact:   string;
  reason:            string;
  confidence:        number;
  automation_eligible: boolean;
  estimated_close_probability_improvement: number;
  valid_until:       string | null;

  channel: 'whatsapp' | 'call' | 'email' | 'in_person' | 'system';

  status:         'active' | 'followed_up' | 'expired' | 'dismissed' | 'succeeded';
  followed_up_at: string | null;
  followed_up_by: string | null;
  outcome:        string | null;

  generated_by: 'ai' | 'rule_engine' | 'manual' | 'replay';

  created_at: string;
}

// ── Conversation Event ────────────────────────────────────────────────────

export interface ConversationEvent {
  id:              string;
  tenant_id:       string;
  lead_id:         string;
  conversation_id: string | null;

  event_type:     string;
  event_category: EventCategory;

  message_number: number | null;
  message_id:     string | null;

  score_delta: number;
  new_score:   number | null;
  old_score:   number | null;
  old_value:   string | null;
  new_value:   string | null;
  label:       string | null;

  metadata: Record<string, unknown>;

  triggered_by:         EventTrigger;
  triggered_by_user_id: string | null;

  signal_engine_version:   string | null;
  decision_engine_version: string | null;

  is_replay:      boolean;
  replay_session: string | null;

  created_at: string;
}

// ── AI Job ────────────────────────────────────────────────────────────────

export interface AIJob {
  id:              string;
  tenant_id:       string;
  lead_id:         string;
  conversation_id: string | null;
  message_id:      string | null;

  idempotency_key: string | null;
  status:          JobStatus;
  skip_reason:     SkipReason | null;
  fallback_level:  FallbackLevel;

  retry_count: number;
  max_retries: number;
  last_error:  string | null;

  enqueued_at:  string;
  started_at:   string | null;
  completed_at: string | null;

  message_count:     number | null;
  conversation_hash: string | null;
  trigger_type:      TriggerType;
  priority:          number;
}

// ── AI Analysis Replay ────────────────────────────────────────────────────

export interface AIAnalysisReplay {
  id:                    string;
  tenant_id:             string;
  original_analysis_id:  string;
  replay_analysis_id:    string | null;

  replay_trigger: 'prompt_change' | 'weight_change' | 'logic_change' | 'industry_rule_change' | 'schema_change' | 'manual';
  replay_reason:  string;

  prompt_version_old: string | null;  prompt_version_new: string | null;
  schema_version_old: string | null;  schema_version_new: string | null;
  engine_version_old: string | null;  engine_version_new: string | null;

  original_result: Record<string, unknown>;
  replay_result:   Record<string, unknown>;
  comparison:      Record<string, unknown>;

  status:      'pending' | 'running' | 'completed' | 'failed';
  started_at:  string | null;
  completed_at: string | null;
  error:       string | null;

  created_at: string;
}

// ── Lead Feedback ─────────────────────────────────────────────────────────

export interface LeadFeedback {
  id:              string;
  tenant_id:       string;
  lead_id:         string;
  analysis_id:     string | null;
  conversation_id: string | null;
  submitted_by:    string | null;

  field_changed: 'status' | 'stage' | 'buying_intent' | 'recommendation' | 'probability' | 'momentum' | 'other';
  old_value: string | null;
  new_value: string | null;
  reason:    string | null;

  ai_was_correct:       boolean | null;
  wrong_stage:          boolean;
  wrong_intent:         boolean;
  wrong_recommendation: boolean;
  wrong_probability:    boolean;

  notes:      string | null;
  created_at: string;
}

// ── Gemini / AI Provider Response Shape ───────────────────────────────────

export interface GeminiConversationAnalysis {
  // Multi-dimensional scores
  buyingIntent:          number;
  urgency:               number;
  trust:                 number;
  engagement:            number;
  budgetScore:           number;
  commitment:            number;
  negotiation:           number;
  conversionProbability: number;
  conversationQuality:   number;

  // REQ 9: Multi-dimensional confidence
  confidence:                 number;
  intentConfidence:           number;
  stageConfidence:            number;
  recommendationConfidence:   number;
  buyingIntentConfidence:     number;
  entityExtractionConfidence: number;

  // Categorical
  budgetSensitivity: BudgetSensitivity;
  salesStage:        SalesStage;
  momentum:          Momentum;
  negotiationState:  NegotiationState;

  // Arrays
  intentHistory:   string[];
  groupBooking:    boolean;
  groupSize:       number | null;
  objections:      string[];
  detectedSignals: string[];
  missingSignals:  string[];
  keyMoments:      string[];

  // Narrative
  explanation:      string;
  recommendation:   string;
  whyHot:           string;
  whyNotQualified:  string;
  salesSummary:     string;

  // REQ 1B: Memory extraction (facts to persist in conversation_memory)
  memoryUpdates: Partial<{
    customerName:           string;
    language:               string;
    communicationPreference: string;
    travellingWithFamily:   boolean;
    groupSize:              number;
    groupComposition:       string;
    budgetMin:              number;
    budgetMax:              number;
    preferredDestination:   string;
    preferredTravelMonth:   string;
    dietaryRequirements:    string;
    fitnessConcern:         boolean;
    airportPickupNeeded:    boolean;
    discountRequested:      boolean;
    discountAmountRequested: number;
    priceSensitivity:       BudgetSensitivity;
    knownObjections:        string[];
    knownPreferences:       string[];
    discoveredFacts:        Record<string, unknown>;
  }>;

  // REQ 14: Recommendation expanded fields
  recommendationPriority:    ActionPriority;
  expectedImpact:            string;
  recommendationReason:      string;
  automationEligible:        boolean;
  estimatedCloseProbImprovement: number;
}
