// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Explainability Engine (Point 6)
//
// Dedicated component that produces all human-readable explanations.
// Business logic NEVER generates explanations inline — it passes data here.
//
// Inputs:  Rule Engine result + AI Analysis + Decision Engine result
// Outputs: Why Hot, Why not Qualified, Missing Signals, Next Best Action,
//          Key Buying Signals, Timeline Summary, Sales Summary
// ═══════════════════════════════════════════════════════════════════════════

import type { GeminiConversationAnalysis, GeminiConversationAnalysisV2, Momentum } from './types';

// ── Input Types ──────────────────────────────────────────────────────────

export interface RuleEngineContext {
  lead_score:       number;
  prev_score:       number;
  lead_status:      string;
  prev_status:      string;
  all_buying_signals: string[];
  new_signals:      string[];
  score_breakdown:  Record<string, { label: string; points: number; category: string }>;
  scoring_reasoning: string;
}

export interface DecisionEngineContext {
  final_score:       number;
  composite_method:  'rule_only' | 'blended' | 'ai_led';
  ai_confidence:     number;
  ai_weight_applied: number;
  qualification_met: boolean;
  gate_signal:       string | null;  // which signal triggered qualification
}

// ── Output Types ─────────────────────────────────────────────────────────

export interface ExplainabilityOutput {
  // Core narrative
  why_hot:            string;   // "Why this lead is Hot"
  why_not_qualified:  string;   // "Why not Qualified yet"
  what_changed:       string;   // "What changed in this message"

  // Signal lists (for UI badges)
  key_buying_signals:  SignalBadge[];  // confirmed positive signals
  missing_signals:     SignalBadge[];  // what's still needed
  negative_signals:    SignalBadge[];  // active detractors

  // Actionable intelligence
  next_best_action: string;     // single most important next step
  timeline_summary: string;     // 1-sentence journey summary
  sales_summary:    string;     // what a salesperson needs to know

  // Scores display (all 0-100 for UI bars)
  dimension_scores:  DimensionScore[];

  // Confidence
  confidence:        number;
  confidence_note:   string;    // "Based on 22 messages + AI analysis"

  // Momentum
  momentum:          Momentum;
  momentum_label:    string;    // "↑ Increasing rapidly" or "↓ Declining"
}

export interface SignalBadge {
  key:      string;
  label:    string;
  points?:  number;
  category: string;
}

export interface DimensionScore {
  label:  string;
  key:    string;
  score:  number;
  bar_color: string;  // tailwind color class
}

// ── Signal Label Map ──────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<string, string> = {
  asked_discount:       'Requested discount',
  commitment_signals:   'Showed preparation interest',
  logistics_planning:   'Confirmed logistics / meeting point',
  comparison_shopping:  'Comparing options',
  urgency_signal:       'Expressed urgency',
  invoice_request:      'Requested invoice or quote',
  intent_book:          'Expressed intent to book',
  intent_reserve:       'Requested a reservation',
  intent_payment_link:  'Asked for payment link',
  intent_confirm_booking: 'Asked for booking confirmation',
  asked_pricing:        'Asked about pricing',
  asked_dates:          'Asked about dates',
  asked_itinerary:      'Asked about itinerary',
  asked_availability:   'Asked about availability',
  asked_payment_method: 'Asked about payment method',
  asked_booking_process: 'Asked how to book',
  asked_difficulty:     'Asked about difficulty / requirements',
  asked_inclusions:     'Asked about what is included',
  ind_expedition_named: 'Named specific expedition',
  ind_site_visit:       'Requested site visit',
  ind_demo_request:     'Requested product demo',
  ind_enroll_intent:    'Expressed enrollment intent',
  messages_5:           'Active conversation (5+ messages)',
  messages_10:          'Engaged conversation (10+ messages)',
  messages_15:          'Deeply engaged (15+ messages)',
  messages_20:          'Very engaged (20+ messages)',
};

const MISSING_SIGNAL_LABELS: Record<string, string> = {
  intent_payment_link:     'Payment link not yet requested',
  intent_confirm_booking:  'Booking not yet confirmed',
  invoice_request:         'Invoice not yet requested',
  asked_dates:             'Dates not yet specified',
  asked_pricing:           'Pricing not yet discussed',
  asked_availability:      'Availability not yet checked',
  commitment_signals:      'No preparation questions yet',
  asked_payment_method:    'Payment method not discussed',
  ind_expedition_named:    'No specific destination named',
};

// ── Main Builder ──────────────────────────────────────────────────────────

export function buildExplainability(
  rule:     RuleEngineContext,
  ai:       GeminiConversationAnalysis | GeminiConversationAnalysisV2 | null,
  decision: DecisionEngineContext,
  messageCount: number,
): ExplainabilityOutput {
  const status  = rule.lead_status;
  const score   = decision.final_score;
  const signals = new Set(rule.all_buying_signals);

  const isV2 = ai && 'stage' in ai;
  const v2Ai = isV2 ? (ai as GeminiConversationAnalysisV2) : null;
  const v1Ai = isV2 ? null : (ai as GeminiConversationAnalysis);

  // ── Why Hot ─────────────────────────────────────────────────────────────
  const why_hot = isV2
    ? (v2Ai?.explanation || `Lead score is ${score}/100.`)
    : buildWhyHot(rule, v1Ai, decision, status);

  // ── Why Not Qualified ────────────────────────────────────────────────────
  const why_not_qualified = isV2
    ? (status === 'qualified' ? 'Qualification criteria met.' : `Lead not yet qualified. Status is ${status}.`)
    : buildWhyNotQualified(rule, v1Ai, decision, signals);

  // ── What Changed ────────────────────────────────────────────────────────
  const what_changed = buildWhatChanged(rule);

  // ── Key Buying Signals (positive) ────────────────────────────────────────
  const key_buying_signals: SignalBadge[] = rule.all_buying_signals
    .filter(k => !k.startsWith('messages_') || parseInt(k.split('_')[1]) >= 10)
    .slice(0, 8)
    .map(k => ({
      key:      k,
      label:    SIGNAL_LABELS[k] ?? k.replace(/_/g, ' '),
      points:   rule.score_breakdown[k]?.points,
      category: rule.score_breakdown[k]?.category ?? 'signal',
    }));

  // ── Missing Signals ──────────────────────────────────────────────────────
  const missing_signals: SignalBadge[] = buildMissingSignals(signals, v1Ai, status);

  // ── Negative Signals ─────────────────────────────────────────────────────
  const negative_signals: SignalBadge[] = Object.entries(rule.score_breakdown)
    .filter(([, v]) => v.points < 0)
    .map(([k, v]) => ({ key: k, label: v.label, points: v.points, category: v.category }));

  // ── Next Best Action ─────────────────────────────────────────────────────
  const next_best_action = isV2
    ? (v2Ai?.next_action || buildDefaultRecommendation(status, score, signals))
    : (v1Ai?.recommendation || buildDefaultRecommendation(status, score, signals));

  // ── Timeline Summary ─────────────────────────────────────────────────────
  const timeline_summary = isV2
    ? `${messageCount}-message conversation reached ${v2Ai?.stage} stage with score ${v2Ai?.score}.`
    : buildTimelineSummary(v1Ai, rule, messageCount);

  // ── Sales Summary ────────────────────────────────────────────────────────
  const sales_summary = isV2
    ? (v2Ai?.summary || buildDefaultSalesSummary(rule, status))
    : (v1Ai?.salesSummary || buildDefaultSalesSummary(rule, status));

  // ── Dimension Scores ─────────────────────────────────────────────────────
  const dimension_scores = buildDimensionScores(rule, v1Ai, v2Ai);

  // ── Confidence ───────────────────────────────────────────────────────────
  const confidence      = isV2 ? (v2Ai?.confidence ?? 50) : (v1Ai?.confidence ?? Math.min(50, score));
  const confidence_note = ai
    ? `Based on ${messageCount} messages + Gemini AI analysis (${confidence}% confident)`
    : `Based on ${messageCount} messages + deterministic rule engine (no AI analysis yet)`;

  // ── Momentum ─────────────────────────────────────────────────────────────
  const momentum       = (isV2 ? 'Stable' : (v1Ai?.momentum ?? 'Stable')) as Momentum;
  const momentum_label = buildMomentumLabel(momentum);

  return {
    why_hot, why_not_qualified, what_changed,
    key_buying_signals, missing_signals, negative_signals,
    next_best_action, timeline_summary, sales_summary,
    dimension_scores,
    confidence, confidence_note,
    momentum, momentum_label,
  };
}

// ── Sub-builders ─────────────────────────────────────────────────────────

function buildWhyHot(rule: RuleEngineContext, ai: GeminiConversationAnalysis | null, decision: DecisionEngineContext, status: string): string {
  const parts: string[] = [];

  if (rule.all_buying_signals.includes('asked_discount')) {
    parts.push('actively negotiating on price');
  }
  if (rule.all_buying_signals.includes('commitment_signals')) {
    parts.push('asking preparation questions (strong commitment signal)');
  }
  if (rule.all_buying_signals.includes('logistics_planning')) {
    parts.push('confirmed logistics details (near-decision behaviour)');
  }
  if (rule.all_buying_signals.includes('invoice_request')) {
    parts.push('requested an invoice (closing signal)');
  }
  if (ai && ai.salesStage === 'Negotiation') {
    parts.push(`AI confirms Negotiation stage (confidence: ${ai.confidence}%)`);
  }
  if (ai && ai.buyingIntent >= 75) {
    parts.push(`buying intent scored ${ai.buyingIntent}% by AI`);
  }

  if (parts.length === 0) {
    parts.push(`accumulated ${rule.lead_score} points from ${rule.all_buying_signals.length} confirmed buying signals`);
  }

  const intro = status === 'hot' ? 'This lead is Hot because it is' :
                status === 'qualified' ? 'This lead is Qualified because it' :
                'This lead is';
  return `${intro} ${parts.join(', ')}.`;
}

function buildWhyNotQualified(
  rule: RuleEngineContext,
  ai: GeminiConversationAnalysis | null,
  decision: DecisionEngineContext,
  signals: Set<string>,
): string {
  if (decision.qualification_met) return 'Qualification criteria met.';

  const missingGates: string[] = [];
  if (!signals.has('intent_payment_link'))     missingGates.push('payment link not yet requested');
  if (!signals.has('intent_confirm_booking'))  missingGates.push('booking not confirmed');
  if (!signals.has('invoice_request'))         missingGates.push('no invoice requested');

  if (missingGates.length > 0) {
    return `Qualified status requires a closing signal. Still missing: ${missingGates.join(', ')}.`;
  }

  if (ai && ai.confidence < 75) {
    return `AI confidence is ${ai.confidence}% — needs to be ≥75% with a closing signal to qualify.`;
  }

  return 'Qualification requires a confirmed closing signal (payment, booking, or invoice).';
}

function buildWhatChanged(rule: RuleEngineContext): string {
  if (rule.new_signals.length === 0) {
    return 'No new signals detected in this message.';
  }
  const labels = rule.new_signals.map(k => SIGNAL_LABELS[k] ?? k.replace(/_/g, ' '));
  const deltaStr = rule.score_breakdown
    ? Object.entries(rule.score_breakdown)
        .filter(([, v]) => v.points > 0)
        .map(([, v]) => `+${v.points} ${v.label}`)
        .join(', ')
    : '';
  return `New signal${rule.new_signals.length > 1 ? 's' : ''} detected: ${labels.join(', ')}${deltaStr ? ` (${deltaStr})` : ''}.`;
}

function buildMissingSignals(signals: Set<string>, ai: GeminiConversationAnalysis | null, status: string): SignalBadge[] {
  const candidates = Object.keys(MISSING_SIGNAL_LABELS);
  const missing: SignalBadge[] = [];

  for (const key of candidates) {
    if (!signals.has(key)) {
      missing.push({ key, label: MISSING_SIGNAL_LABELS[key], category: 'missing' });
    }
    if (missing.length >= 4) break;
  }

  // Add AI-suggested missing signals
  if (ai?.missingSignals) {
    for (const s of ai.missingSignals.slice(0, 3)) {
      missing.push({ key: 'ai_missing', label: s, category: 'missing' });
    }
  }

  return missing.slice(0, 6);
}

function buildDefaultRecommendation(status: string, score: number, signals: Set<string>): string {
  if (signals.has('invoice_request') || signals.has('intent_payment_link')) {
    return 'Customer is in closing stage. Send payment link or invoice immediately.';
  }
  if (signals.has('asked_discount')) {
    return 'Customer is negotiating. Have your group discount / seasonal offer ready. Call now.';
  }
  if (signals.has('commitment_signals')) {
    return 'Customer is planning their trip. Send detailed preparation guide and finalize dates.';
  }
  if (status === 'hot') return 'Follow up immediately. Customer shows high intent.';
  if (status === 'warm') return 'Send additional information about the product/service.';
  return 'Continue the conversation to understand their needs better.';
}

function buildTimelineSummary(
  ai: GeminiConversationAnalysis | null,
  rule: RuleEngineContext,
  messageCount: number,
): string {
  const stageStr = ai?.salesStage ?? 'Interest';
  const signals  = rule.all_buying_signals.length;
  return `${messageCount}-message conversation reached ${stageStr} stage with ${signals} confirmed buying signal${signals !== 1 ? 's' : ''}.`;
}

function buildDefaultSalesSummary(rule: RuleEngineContext, status: string): string {
  const topSignals = rule.all_buying_signals.slice(0, 3).map(k => SIGNAL_LABELS[k] ?? k).join(', ');
  return `Lead scored ${rule.lead_score}/100 (${status}). Top signals: ${topSignals || 'basic engagement'}.`;
}

function buildDimensionScores(
  rule: RuleEngineContext, 
  v1Ai: GeminiConversationAnalysis | null,
  v2Ai: GeminiConversationAnalysisV2 | null
): DimensionScore[] {
  const ruleNormalized = Math.min(100, rule.lead_score);
  if (v2Ai) {
    return [
      { label: 'Buying Intent',         key: 'buying_intent',        score: v2Ai.score,        bar_color: 'bg-indigo-500' },
      { label: 'Urgency',               key: 'urgency',              score: v2Ai.score > 70 ? 80 : 40,              bar_color: 'bg-red-500'    },
      { label: 'Trust',                 key: 'trust',                score: v2Ai.confidence,                bar_color: 'bg-emerald-500'},
      { label: 'Engagement',            key: 'engagement',           score: Math.min(100, rule.all_buying_signals.length * 15), bar_color: 'bg-blue-500' },
      { label: 'Conversion Probability',key: 'conversion_probability',score: v2Ai.booking_probability, bar_color: 'bg-green-500' },
    ];
  }
  return [
    { label: 'Buying Intent',         key: 'buying_intent',        score: v1Ai?.buyingIntent        ?? ruleNormalized, bar_color: 'bg-indigo-500' },
    { label: 'Urgency',               key: 'urgency',              score: v1Ai?.urgency             ?? 0,              bar_color: 'bg-red-500'    },
    { label: 'Trust',                 key: 'trust',                score: v1Ai?.trust               ?? 0,              bar_color: 'bg-emerald-500'},
    { label: 'Engagement',            key: 'engagement',           score: v1Ai?.engagement          ?? Math.min(100, rule.all_buying_signals.length * 10), bar_color: 'bg-blue-500' },
    { label: 'Commitment',            key: 'commitment',           score: v1Ai?.commitment          ?? 0,              bar_color: 'bg-amber-500'  },
    { label: 'Negotiation',           key: 'negotiation',          score: v1Ai?.negotiation         ?? 0,              bar_color: 'bg-violet-500' },
    { label: 'Conversion Probability',key: 'conversion_probability',score: v1Ai?.conversionProbability ?? ruleNormalized, bar_color: 'bg-green-500' },
  ];
}

function buildMomentumLabel(momentum: Momentum): string {
  const LABELS: Record<Momentum, string> = {
    Increasing: '↑ Increasing',
    Stable:     '→ Stable',
    Declining:  '↓ Declining',
    Spiking:    '↑↑ Spiking',
    Dormant:    '— Dormant',
  };
  return LABELS[momentum] ?? '→ Stable';
}

// ── Momentum Calculator (Point 3) ────────────────────────────────────────
// Call with the last 3–5 buying_intent values (oldest first)

export function computeMomentum(recentIntentValues: number[]): Momentum {
  if (recentIntentValues.length < 2) return 'Stable';
  const values = recentIntentValues.slice(-5);
  const deltas = values.slice(1).map((v, i) => v - values[i]);
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  if (avg >= 15) return 'Spiking';
  if (avg >= 5)  return 'Increasing';
  if (avg <= -10) return 'Declining';
  if (avg <= -3)  return 'Declining';
  // Check if completely dormant (no change AND low absolute value)
  const latest = values[values.length - 1];
  if (Math.abs(avg) < 1 && latest < 20) return 'Dormant';
  return 'Stable';
}
