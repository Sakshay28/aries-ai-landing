-- ═══════════════════════════════════════════════════════════
-- Lead Scoring v2 — Cumulative, Explainable, Deterministic
--
-- Adds per-lead signal tracking so the scoring engine can
-- accumulate signals across messages without double-counting.
--
-- Run in Supabase SQL Editor (idempotent).
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- Signal arrays: each key is stored once (deduplication set).
-- buying_signals: positive signal keys that have fired (e.g. 'asked_pricing', 'intent_book').
-- negative_signals: negative signal keys that have fired (e.g. 'not_interested').
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS buying_signals   TEXT[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS negative_signals TEXT[]   NOT NULL DEFAULT '{}';

-- JSON breakdown of score contributions for the admin dashboard explainability panel.
-- Keyed by signal key → { label, points, category }.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS score_breakdown     JSONB    NOT NULL DEFAULT '{}';

-- Human-readable sentence shown below the score in the CRM (e.g. "✓ Asked pricing; ✓ Shared date").
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS scoring_reasoning   TEXT;

-- Faster CRM queries: sort leads by score, filter by status
CREATE INDEX IF NOT EXISTS idx_leads_score         ON leads(tenant_id, lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_buying_signals ON leads USING GIN (buying_signals);

-- Reset all existing leads so the new engine re-scores them from scratch
-- on the next inbound message. This is safe — scores will rebuild naturally
-- as conversations continue.
UPDATE leads
SET
  lead_score        = 0,
  lead_status       = 'new',
  buying_signals    = '{}',
  negative_signals  = '{}',
  score_breakdown   = '{}',
  scoring_reasoning = NULL
WHERE lead_status NOT IN ('converted', 'lost');

COMMIT;
