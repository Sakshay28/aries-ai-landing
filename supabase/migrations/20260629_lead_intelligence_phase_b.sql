-- ═══════════════════════════════════════════════════════════════════════════
-- Lead Intelligence Platform — Phase B + C Architecture Schema
-- Migration: 20260629_lead_intelligence_phase_b.sql
--
-- Req 1:  conversation_state (ephemeral) + conversation_memory (persistent)
-- Req 2:  lead_profiles → full Customer Intelligence
-- Req 3:  prompt_registry (per-industry versioned prompts)
-- Req 4:  schema_registry (versioned AI response schemas)
-- Req 6:  tenant_ai_costs (AI cost per tenant, daily/monthly)
-- Req 9:  Multi-dimensional confidence on lead_ai_analysis
-- Req 10+14: recommendation_history (immutable, expanded output)
-- Req 11: conversation_events (event sourcing canonical store)
-- Req 12: ai_analysis_replays (replay engine)
-- Req 13: Feature flag scope on leads + tenants
--
-- All tables: RLS via get_current_tenant_id()
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- REQ 1A: conversation_state — ephemeral (changes every AI analysis)
-- Never mix with memory. State describes where we are RIGHT NOW.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conversation_state (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES leads(id)         ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  current_stage    TEXT NOT NULL DEFAULT 'Awareness',
  current_momentum TEXT NOT NULL DEFAULT 'Stable'
    CHECK (current_momentum IN ('Increasing', 'Stable', 'Declining', 'Spiking', 'Dormant')),
  momentum_trend   SMALLINT[] NOT NULL DEFAULT '{}',

  current_intent        TEXT,
  current_buying_intent SMALLINT NOT NULL DEFAULT 0 CHECK (current_buying_intent BETWEEN 0 AND 100),

  negotiation_state TEXT NOT NULL DEFAULT 'none'
    CHECK (negotiation_state IN ('none', 'exploring', 'active', 'final')),

  current_objections TEXT[] NOT NULL DEFAULT '{}',

  last_analysis_id  UUID,   -- FK to lead_ai_analysis, added via ALTER below
  last_analyzed_at  TIMESTAMPTZ,

  latest_recommendation_id UUID,  -- FK to recommendation_history, added below

  conversation_hash          TEXT,
  message_count_at_analysis  INT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT conversation_state_conv_unique UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_state_lead   ON conversation_state(lead_id);
CREATE INDEX IF NOT EXISTS idx_conv_state_tenant ON conversation_state(tenant_id);

ALTER TABLE conversation_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_conv_state" ON conversation_state;
CREATE POLICY "tenant_own_conv_state" ON conversation_state
  USING (tenant_id = get_current_tenant_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- REQ 1B: conversation_memory — persistent (facts accumulate over conversation)
-- Never overwritten — only enriched. Each new AI analysis may add more facts.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conversation_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES leads(id)         ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- Personal facts
  customer_name             TEXT,
  language                  TEXT DEFAULT 'en',
  communication_preference  TEXT CHECK (communication_preference IN ('whatsapp', 'call', 'email', 'any')),

  -- Group composition
  travelling_with_family BOOLEAN,
  group_size             SMALLINT,
  group_composition      TEXT,

  -- Budget
  budget_range_min  DECIMAL(12, 2),
  budget_range_max  DECIMAL(12, 2),
  budget_currency   TEXT DEFAULT 'INR',

  -- Preferences
  preferred_destination  TEXT,
  preferred_travel_month TEXT,
  dietary_requirements   TEXT,
  fitness_concern        BOOLEAN,
  airport_pickup_needed  BOOLEAN,

  -- Negotiation facts (discovered, not derived)
  discount_requested        BOOLEAN NOT NULL DEFAULT FALSE,
  discount_amount_requested DECIMAL(5, 2),
  last_offered_price        DECIMAL(12, 2),
  price_sensitivity         TEXT CHECK (price_sensitivity IN ('Low', 'Medium', 'High', 'Unknown')) DEFAULT 'Unknown',

  -- Persistent signal lists
  known_objections  TEXT[] NOT NULL DEFAULT '{}',
  known_preferences TEXT[] NOT NULL DEFAULT '{}',

  -- Industry-specific facts bucket
  -- Travel:    {"preferredTrek": "Zanskar", "fitnessLevel": "moderate"}
  -- Restaurant: {"occasion": "birthday", "allergens": ["nuts"]}
  -- SaaS:       {"teamSize": 12, "useCase": "customer support"}
  discovered_facts JSONB NOT NULL DEFAULT '{}',

  -- Timestamped fact discovery log
  fact_timestamps  JSONB NOT NULL DEFAULT '{}',

  facts_extracted_by TEXT NOT NULL DEFAULT 'engine'
    CHECK (facts_extracted_by IN ('engine', 'ai', 'manual', 'backfill')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT conversation_memory_conv_unique UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_memory_lead   ON conversation_memory(lead_id);
CREATE INDEX IF NOT EXISTS idx_conv_memory_tenant ON conversation_memory(tenant_id);

ALTER TABLE conversation_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_conv_memory" ON conversation_memory;
CREATE POLICY "tenant_own_conv_memory" ON conversation_memory
  USING (tenant_id = get_current_tenant_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- REQ 2: lead_profiles — Customer Intelligence (scoring is one dimension)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lead_profiles (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id   UUID NOT NULL REFERENCES leads(id)   ON DELETE CASCADE,

  -- Relationship
  is_repeat_customer    BOOLEAN NOT NULL DEFAULT FALSE,
  customer_segment      TEXT CHECK (customer_segment IN ('VIP', 'Regular', 'Occasional', 'New', 'At-Risk', 'Lost')),
  risk_category         TEXT CHECK (risk_category IN ('Low', 'Medium', 'High', 'Unknown')) DEFAULT 'Unknown',
  relationship_strength SMALLINT DEFAULT 0 CHECK (relationship_strength BETWEEN 0 AND 100),
  salesperson_notes     TEXT,

  -- Purchase history
  estimated_lifetime_value   DECIMAL(12, 2),
  total_deal_value           DECIMAL(12, 2),
  previous_purchases         JSONB NOT NULL DEFAULT '[]',
  previous_bookings          JSONB NOT NULL DEFAULT '[]',
  industries_enquired        TEXT[] NOT NULL DEFAULT '{}',
  typical_budget_min         DECIMAL(12, 2),
  typical_budget_max         DECIMAL(12, 2),
  historical_conversion_rate DECIMAL(5, 4),

  -- Response behaviour
  avg_response_delay_mins FLOAT,
  response_consistency    TEXT DEFAULT 'Unknown' CHECK (response_consistency IN ('High', 'Medium', 'Low', 'Unknown')),
  preferred_contact_time  TEXT,
  best_contact_channel    TEXT CHECK (best_contact_channel IN ('whatsapp', 'call', 'email', 'any')),

  -- Negotiation history
  past_negotiations           JSONB NOT NULL DEFAULT '[]',
  max_discount_ever_accepted  DECIMAL(5, 2),

  -- Lead scoring summary (one dimension)
  conversation_count     INT      NOT NULL DEFAULT 0,
  total_messages         INT      NOT NULL DEFAULT 0,
  lifetime_buying_intent SMALLINT NOT NULL DEFAULT 0,
  peak_buying_intent     SMALLINT NOT NULL DEFAULT 0,
  peak_intent_at         TIMESTAMPTZ,
  lifetime_momentum      TEXT NOT NULL DEFAULT 'Stable'
    CHECK (lifetime_momentum IN ('Increasing', 'Stable', 'Declining', 'Spiking', 'Dormant')),
  intent_trend           SMALLINT[] NOT NULL DEFAULT '{}',

  first_contact_at TIMESTAMPTZ,
  last_contact_at  TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lead_profiles_lead_unique UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_profiles_tenant ON lead_profiles(tenant_id);

ALTER TABLE lead_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_lead_profiles" ON lead_profiles;
CREATE POLICY "tenant_own_lead_profiles" ON lead_profiles
  USING (tenant_id = get_current_tenant_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- REQ 3: prompt_registry — per-industry versioned AI prompts
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS prompt_registry (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  industry   TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  version    TEXT NOT NULL,
  system_prompt        TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  notes                TEXT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prompt_registry_unique UNIQUE (industry, prompt_key, version)
);


-- ═══════════════════════════════════════════════════════════════════════════
-- REQ 4: schema_registry — versioned AI response schemas
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS schema_registry (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_key  TEXT NOT NULL,
  version     TEXT NOT NULL,
  json_schema JSONB NOT NULL,
  ts_interface TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  notes        TEXT,
  released_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schema_registry_unique UNIQUE (schema_key, version)
);


-- ═══════════════════════════════════════════════════════════════════════════
-- REQ 6: tenant_ai_costs — AI cost tracking per tenant
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tenant_ai_costs (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  cost_date  DATE     NOT NULL,
  cost_hour  SMALLINT CHECK (cost_hour BETWEEN 0 AND 23),
  provider   TEXT NOT NULL DEFAULT 'gemini',
  model      TEXT NOT NULL DEFAULT 'gemini-2.0-flash',

  total_calls    INT NOT NULL DEFAULT 0,
  skipped_calls  INT NOT NULL DEFAULT 0,
  cached_calls   INT NOT NULL DEFAULT 0,
  failed_calls   INT NOT NULL DEFAULT 0,

  total_tokens_in  INT NOT NULL DEFAULT 0,
  total_tokens_out INT NOT NULL DEFAULT 0,

  total_cost_usd    DECIMAL(10, 4) NOT NULL DEFAULT 0,
  cache_savings_usd DECIMAL(10, 4) NOT NULL DEFAULT 0,
  skip_savings_usd  DECIMAL(10, 4) NOT NULL DEFAULT 0,

  avg_cost_per_call_usd DECIMAL(10, 6),
  avg_latency_ms        INT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT tenant_ai_costs_unique UNIQUE (tenant_id, cost_date, cost_hour, provider, model)
);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_costs_tenant ON tenant_ai_costs(tenant_id, cost_date DESC);

ALTER TABLE tenant_ai_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_ai_costs" ON tenant_ai_costs;
CREATE POLICY "tenant_own_ai_costs" ON tenant_ai_costs
  USING (tenant_id = get_current_tenant_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- REQ 9: lead_ai_analysis — with multi-dimensional confidence
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lead_ai_analysis (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES leads(id)         ON DELETE CASCADE,
  conversation_id UUID     REFERENCES conversations(id)      ON DELETE SET NULL,
  message_id      TEXT,

  analysis_type    TEXT NOT NULL DEFAULT 'conversation'
                   CHECK (analysis_type IN ('conversation', 'lead', 'manual', 'replay')),
  analysis_trigger TEXT NOT NULL
                   CHECK (analysis_trigger IN ('message', 'manual', 'backfill', 'cron', 'status_change')),

  -- Multi-dimensional scores (0–100)
  buying_intent          SMALLINT NOT NULL DEFAULT 0 CHECK (buying_intent          BETWEEN 0 AND 100),
  urgency_score          SMALLINT NOT NULL DEFAULT 0 CHECK (urgency_score          BETWEEN 0 AND 100),
  trust_score            SMALLINT NOT NULL DEFAULT 0 CHECK (trust_score            BETWEEN 0 AND 100),
  engagement_score       SMALLINT NOT NULL DEFAULT 0 CHECK (engagement_score       BETWEEN 0 AND 100),
  budget_score           SMALLINT NOT NULL DEFAULT 0 CHECK (budget_score           BETWEEN 0 AND 100),
  commitment_score       SMALLINT NOT NULL DEFAULT 0 CHECK (commitment_score       BETWEEN 0 AND 100),
  negotiation_score      SMALLINT NOT NULL DEFAULT 0 CHECK (negotiation_score      BETWEEN 0 AND 100),
  conversation_quality   SMALLINT NOT NULL DEFAULT 0 CHECK (conversation_quality   BETWEEN 0 AND 100),
  conversion_probability SMALLINT NOT NULL DEFAULT 0 CHECK (conversion_probability BETWEEN 0 AND 100),

  budget_sensitivity TEXT CHECK (budget_sensitivity IN ('Low', 'Medium', 'High', 'Unknown')),
  sales_stage        TEXT,
  momentum           TEXT CHECK (momentum IN ('Increasing', 'Stable', 'Declining', 'Spiking', 'Dormant')),

  intent_history    TEXT[] NOT NULL DEFAULT '{}',
  objections        TEXT[] NOT NULL DEFAULT '{}',
  detected_signals  TEXT[] NOT NULL DEFAULT '{}',
  missing_signals   TEXT[] NOT NULL DEFAULT '{}',
  key_moments       TEXT[] NOT NULL DEFAULT '{}',

  group_booking BOOLEAN NOT NULL DEFAULT FALSE,
  group_size    SMALLINT,

  explanation        TEXT,
  recommendation     TEXT,
  why_hot            TEXT,
  why_not_qualified  TEXT,
  sales_summary      TEXT,

  -- REQ 9: Multi-dimensional confidence
  confidence                   SMALLINT NOT NULL DEFAULT 0 CHECK (confidence                   BETWEEN 0 AND 100),
  intent_confidence            SMALLINT NOT NULL DEFAULT 0 CHECK (intent_confidence            BETWEEN 0 AND 100),
  stage_confidence             SMALLINT NOT NULL DEFAULT 0 CHECK (stage_confidence             BETWEEN 0 AND 100),
  recommendation_confidence    SMALLINT NOT NULL DEFAULT 0 CHECK (recommendation_confidence    BETWEEN 0 AND 100),
  buying_intent_confidence     SMALLINT NOT NULL DEFAULT 0 CHECK (buying_intent_confidence     BETWEEN 0 AND 100),
  entity_extraction_confidence SMALLINT NOT NULL DEFAULT 0 CHECK (entity_extraction_confidence BETWEEN 0 AND 100),
  decision_confidence          SMALLINT          DEFAULT 0 CHECK (decision_confidence          BETWEEN 0 AND 100),

  -- Versioning
  prompt_version          TEXT NOT NULL DEFAULT 'v1',
  schema_version          TEXT NOT NULL DEFAULT '1.0',
  signal_engine_version   TEXT NOT NULL DEFAULT '1.0',
  decision_engine_version TEXT NOT NULL DEFAULT '1.0',
  industry_pack_version   TEXT NOT NULL DEFAULT '1.0',
  reasoning_version       TEXT NOT NULL DEFAULT '1.0',

  -- Provider metadata
  provider           TEXT NOT NULL DEFAULT 'gemini',
  model              TEXT NOT NULL DEFAULT 'gemini-2.0-flash',
  tokens_in          INT,
  tokens_out         INT,
  estimated_cost_usd DECIMAL(10, 6),
  latency_ms         INT,

  -- REQ 7: Incremental analysis tracking
  was_incremental           BOOLEAN NOT NULL DEFAULT FALSE,
  incremental_message_count INT,
  full_context_message_count INT,

  -- Cache
  conversation_hash TEXT,
  cache_hit         BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_level    SMALLINT DEFAULT 0 CHECK (fallback_level BETWEEN 0 AND 5),

  -- Observability
  execution_id    TEXT UNIQUE,
  queue_wait_ms   INT,
  processing_ms   INT,
  retry_count     SMALLINT NOT NULL DEFAULT 0,
  parsing_errors  TEXT[],

  -- REQ 12: Replay tracking
  is_replay           BOOLEAN NOT NULL DEFAULT FALSE,
  replays_analysis_id UUID REFERENCES lead_ai_analysis(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_ai_analysis_lead   ON lead_ai_analysis(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_analysis_tenant ON lead_ai_analysis(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_ai_analysis_exec   ON lead_ai_analysis(execution_id) WHERE execution_id IS NOT NULL;

ALTER TABLE lead_ai_analysis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_ai_analysis" ON lead_ai_analysis;
CREATE POLICY "tenant_own_ai_analysis" ON lead_ai_analysis
  USING (tenant_id = get_current_tenant_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- REQ 10 + 14: recommendation_history — immutable, expanded output
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS recommendation_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES leads(id)         ON DELETE CASCADE,
  conversation_id UUID     REFERENCES conversations(id)      ON DELETE SET NULL,
  analysis_id     UUID     REFERENCES lead_ai_analysis(id)   ON DELETE SET NULL,

  title            TEXT NOT NULL,
  summary          TEXT NOT NULL,
  suggested_action TEXT NOT NULL,

  -- REQ 14: Expanded fields
  priority         TEXT NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  expected_impact  TEXT NOT NULL,
  reason           TEXT NOT NULL,
  confidence       SMALLINT NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  automation_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_close_probability_improvement SMALLINT DEFAULT 0,
  valid_until      TIMESTAMPTZ,

  channel TEXT NOT NULL DEFAULT 'whatsapp'
          CHECK (channel IN ('whatsapp', 'call', 'email', 'in_person', 'system')),

  status TEXT NOT NULL DEFAULT 'active'
         CHECK (status IN ('active', 'followed_up', 'expired', 'dismissed', 'succeeded')),
  followed_up_at  TIMESTAMPTZ,
  followed_up_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  outcome         TEXT,

  generated_by TEXT NOT NULL DEFAULT 'ai'
               CHECK (generated_by IN ('ai', 'rule_engine', 'manual', 'replay')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_history_lead   ON recommendation_history(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_history_tenant ON recommendation_history(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rec_history_active ON recommendation_history(tenant_id, status) WHERE status = 'active';

ALTER TABLE recommendation_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_rec_history" ON recommendation_history;
CREATE POLICY "tenant_own_rec_history" ON recommendation_history
  USING (tenant_id = get_current_tenant_id());

-- Wire FKs that depended on tables created above
ALTER TABLE conversation_state
  ADD CONSTRAINT fk_conv_state_last_analysis
  FOREIGN KEY (last_analysis_id)
  REFERENCES lead_ai_analysis(id) ON DELETE SET NULL;

ALTER TABLE conversation_state
  ADD CONSTRAINT fk_conv_state_latest_rec
  FOREIGN KEY (latest_recommendation_id)
  REFERENCES recommendation_history(id) ON DELETE SET NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- REQ 11: conversation_events — event sourcing canonical store
-- All state derivable from this timeline. Replay reads from here.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conversation_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id)       ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES leads(id)         ON DELETE CASCADE,
  conversation_id UUID     REFERENCES conversations(id)      ON DELETE SET NULL,

  event_type     TEXT NOT NULL,
  event_category TEXT NOT NULL
                 CHECK (event_category IN ('signal', 'milestone', 'ai', 'status', 'stage', 'correction', 'decay', 'recommendation', 'memory', 'system')),

  message_number INT,
  message_id     TEXT,

  score_delta INT NOT NULL DEFAULT 0,
  new_score   INT,
  old_score   INT,
  old_value   TEXT,
  new_value   TEXT,
  label       TEXT,

  metadata JSONB NOT NULL DEFAULT '{}',

  triggered_by TEXT NOT NULL DEFAULT 'engine'
               CHECK (triggered_by IN ('engine', 'ai', 'manual', 'decay', 'system', 'backfill', 'replay')),
  triggered_by_user_id UUID,

  signal_engine_version   TEXT DEFAULT '1.0',
  decision_engine_version TEXT DEFAULT '1.0',

  is_replay      BOOLEAN NOT NULL DEFAULT FALSE,
  replay_session TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_events_lead   ON conversation_events(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_events_tenant ON conversation_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_events_conv   ON conversation_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_events_type   ON conversation_events(tenant_id, event_type);

ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_conv_events" ON conversation_events;
CREATE POLICY "tenant_own_conv_events" ON conversation_events
  USING (tenant_id = get_current_tenant_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- REQ 12: ai_analysis_replays — replay engine storage
-- Original analysis is never modified. Replay produces a parallel record.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_analysis_replays (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id)          ON DELETE CASCADE,
  original_analysis_id UUID NOT NULL REFERENCES lead_ai_analysis(id) ON DELETE CASCADE,
  replay_analysis_id   UUID     REFERENCES lead_ai_analysis(id)      ON DELETE SET NULL,

  replay_trigger TEXT NOT NULL
    CHECK (replay_trigger IN ('prompt_change', 'weight_change', 'logic_change', 'industry_rule_change', 'schema_change', 'manual')),
  replay_reason  TEXT NOT NULL,

  prompt_version_old TEXT,  prompt_version_new TEXT,
  schema_version_old TEXT,  schema_version_new TEXT,
  engine_version_old TEXT,  engine_version_new TEXT,

  original_result JSONB NOT NULL DEFAULT '{}',
  replay_result   JSONB          DEFAULT '{}',
  comparison      JSONB          DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error        TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_analysis_replays_dedup UNIQUE (original_analysis_id, replay_trigger, prompt_version_new)
);

CREATE INDEX IF NOT EXISTS idx_replays_tenant   ON ai_analysis_replays(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replays_original ON ai_analysis_replays(original_analysis_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- Supporting: ai_jobs, lead_feedback, tenant_signal_weights, scoring_versions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ai_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  lead_id     UUID NOT NULL,
  conversation_id UUID,
  message_id  TEXT,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed', 'dead', 'skipped')),
  skip_reason TEXT CHECK (skip_reason IN ('trivial_message', 'cache_hit', 'no_meaningful_change', 'flags_disabled', 'rate_limited')),
  retry_count    SMALLINT NOT NULL DEFAULT 0,
  max_retries    SMALLINT NOT NULL DEFAULT 3,
  last_error     TEXT,
  fallback_level SMALLINT NOT NULL DEFAULT 0 CHECK (fallback_level BETWEEN 0 AND 5),
  enqueued_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  message_count     INT,
  conversation_hash TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'message'
    CHECK (trigger_type IN ('message', 'manual', 'cron', 'backfill', 'status_change', 'replay')),
  priority SMALLINT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10)
);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_pending ON ai_jobs(priority, enqueued_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_ai_jobs_lead ON ai_jobs(lead_id, enqueued_at DESC);

CREATE TABLE IF NOT EXISTS lead_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES leads(id)       ON DELETE CASCADE,
  analysis_id     UUID     REFERENCES lead_ai_analysis(id) ON DELETE SET NULL,
  conversation_id UUID     REFERENCES conversations(id)    ON DELETE SET NULL,
  submitted_by    UUID     REFERENCES users(id)            ON DELETE SET NULL,
  field_changed TEXT NOT NULL
    CHECK (field_changed IN ('status', 'stage', 'buying_intent', 'recommendation', 'probability', 'momentum', 'other')),
  old_value TEXT, new_value TEXT, reason TEXT,
  ai_was_correct       BOOLEAN,
  wrong_stage          BOOLEAN NOT NULL DEFAULT FALSE,
  wrong_intent         BOOLEAN NOT NULL DEFAULT FALSE,
  wrong_recommendation BOOLEAN NOT NULL DEFAULT FALSE,
  wrong_probability    BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_feedback_lead   ON lead_feedback(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_feedback_tenant ON lead_feedback(tenant_id, created_at DESC);
ALTER TABLE lead_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_feedback" ON lead_feedback;
CREATE POLICY "tenant_own_feedback" ON lead_feedback USING (tenant_id = get_current_tenant_id());

CREATE TABLE IF NOT EXISTS tenant_signal_weights (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  weights   JSONB NOT NULL DEFAULT '{}',
  ai_min_confidence       SMALLINT DEFAULT 55,
  ai_blend_threshold_low  SMALLINT DEFAULT 60,
  ai_blend_threshold_high SMALLINT DEFAULT 80,
  ai_blend_threshold_full SMALLINT DEFAULT 95,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_signal_weights_tenant_unique UNIQUE (tenant_id)
);
ALTER TABLE tenant_signal_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_own_weights" ON tenant_signal_weights;
CREATE POLICY "tenant_own_weights" ON tenant_signal_weights USING (tenant_id = get_current_tenant_id());

CREATE TABLE IF NOT EXISTS scoring_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component   TEXT NOT NULL CHECK (component IN (
    'signal_engine','decision_engine','industry_pack','prompt','schema','reasoning',
    'recommendation','replay_engine','ai_provider')),
  version     TEXT NOT NULL,
  description TEXT,
  changelog   JSONB NOT NULL DEFAULT '{}',
  is_current  BOOLEAN NOT NULL DEFAULT FALSE,
  released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scoring_versions_unique UNIQUE (component, version)
);

INSERT INTO scoring_versions (component, version, description, is_current) VALUES
  ('signal_engine',   '1.0', 'Phase A: 18 base + 6 new signals (discount, commitment, logistics, comparison, urgency, invoice)', TRUE),
  ('decision_engine', '1.0', 'Phase A+B: Qualification gate + AI-floor + dynamic industry gates', TRUE),
  ('industry_pack',   '1.0', 'Phase A: 9 industry modules with qualificationGates and aiPromptContext', TRUE),
  ('prompt',          'v1',  'Phase C: Initial Gemini conversation intelligence prompt', FALSE),
  ('schema',          '1.0', 'Phase B+C: Full AI Intelligence Platform schema', TRUE),
  ('reasoning',       '1.0', 'Phase A: String-based reasoning from signal labels', TRUE),
  ('recommendation',  '1.0', 'Phase B: Per-industry recommendation providers', TRUE),
  ('replay_engine',   '1.0', 'Phase C: Initial replay engine', FALSE),
  ('ai_provider',     '1.0', 'Phase C: Gemini 2.0 Flash as first provider', FALSE)
ON CONFLICT (component, version) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE leads — AI summary columns + REQ 13 lead-level flag overrides
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS ai_buying_intent          SMALLINT,
  ADD COLUMN IF NOT EXISTS ai_urgency                SMALLINT,
  ADD COLUMN IF NOT EXISTS ai_trust                  SMALLINT,
  ADD COLUMN IF NOT EXISTS ai_engagement             SMALLINT,
  ADD COLUMN IF NOT EXISTS ai_conversion_probability SMALLINT,
  ADD COLUMN IF NOT EXISTS ai_sales_stage            TEXT,
  ADD COLUMN IF NOT EXISTS ai_confidence             SMALLINT,
  ADD COLUMN IF NOT EXISTS ai_momentum               TEXT
    CHECK (ai_momentum IN ('Increasing', 'Stable', 'Declining', 'Spiking', 'Dormant')),
  ADD COLUMN IF NOT EXISTS ai_objections             TEXT[],
  ADD COLUMN IF NOT EXISTS ai_recommendation         TEXT,
  ADD COLUMN IF NOT EXISTS ai_explanation            TEXT,
  ADD COLUMN IF NOT EXISTS ai_last_analyzed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_group_booking          BOOLEAN,
  ADD COLUMN IF NOT EXISTS ai_group_size             SMALLINT,
  -- REQ 13: Lead-level feature flag overrides (highest specificity in hierarchy)
  ADD COLUMN IF NOT EXISTS feature_flag_overrides    JSONB;


-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER TABLE tenants — Feature flags + REQ 13 industry-level flag overrides
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS lead_intelligence_flags JSONB NOT NULL DEFAULT '{
    "enable_ai": true,
    "enable_conversation_intelligence": true,
    "enable_confidence_gate": true,
    "enable_negotiation_detection": true,
    "enable_commitment_detection": true,
    "enable_group_booking_detection": true,
    "enable_urgency_detection": true,
    "enable_comparison_detection": true,
    "enable_conversation_memory": true,
    "enable_cross_conversation_analysis": false,
    "enable_momentum_tracking": true,
    "enable_automation": true,
    "enable_ai_recommendations": true,
    "enable_human_feedback": true,
    "enable_incremental_analysis": true,
    "enable_replay_engine": false,
    "enable_cost_tracking": true,
    "industry_module": "auto"
  }'::jsonb,
  -- REQ 13: Industry-level overrides {"travel": {"enable_ai": false}}
  ADD COLUMN IF NOT EXISTS industry_flag_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
