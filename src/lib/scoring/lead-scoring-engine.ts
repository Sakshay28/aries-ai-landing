// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Tier 1: Fast Signal Engine
//
// Architecture:
//  - Deterministic rule-based scoring is PRIMARY signal source.
//  - Rule score establishes the FLOOR — AI can only add, never subtract.
//  - AI intent contributes supplemental points when confidence is high enough.
//  - Every signal counted ONCE per lead lifetime (deduplicated via buying_signals[]).
//  - Industry-specific modules overlay the universal base set.
//  - Status transitions are validated — impossible jumps are silently held.
//  - Manual overrides are respected — engine never overwrites sales team decisions.
//  - Multi-language: English + Hindi + Hinglish patterns throughout.
//  - QUALIFIED requires explicit closing signal — high score alone is not enough.
//  - Stage progression is forward-only (enforced in transition matrix).
// ═══════════════════════════════════════════════════════════════════════════

import type { AIResponse } from '@/lib/ai/engine';
import type { LeadStatus } from '@/lib/types';
import { INDUSTRY_PATTERNS, INDUSTRY_MODULES, type IndustryProfile, type IndustryPattern } from './industry-profiles';

// ── Score Thresholds ──────────────────────────────────────────────────────────
export const SCORE_THRESHOLDS = {
  COLD:      0,   // 0–29
  WARM:      30,  // 30–69
  HOT:       70,  // 70–89
  QUALIFIED: 90,  // 90–100
} as const;

// AI intent is ignored when confidence drops below this threshold.
// Keeps rule-based scoring from being polluted by weak AI guesses.
export const AI_CONFIDENCE_THRESHOLD = 0.55;

// ── Qualification Gate ────────────────────────────────────────────────────────
// QUALIFIED status requires one of these universal closing signals PLUS any
// industry-specific gates defined in INDUSTRY_MODULES[industry].qualificationGates.
// A high score alone (e.g., score=92 from negotiation) is NOT enough.
// This prevents negotiation-stage leads from being incorrectly marked Qualified.
export const UNIVERSAL_QUALIFICATION_GATES = new Set<string>([
  'intent_payment_link',      // customer asked for payment link
  'intent_confirm_booking',   // customer asked if booking is confirmed
  'invoice_request',          // customer asked for invoice/formal quote
  'intent_reserve',           // customer asked to reserve a specific seat/spot
  'ready_to_pay',             // AI extracted requestPayment = true from customer
]);

// Backward-compat alias — tests and external code may reference this
export const QUALIFICATION_GATE_SIGNALS = UNIVERSAL_QUALIFICATION_GATES;

// Merge universal gates + industry-specific gates at runtime. (Point 14)
// Industry modules own their own qualification logic — no hardcoding here.
export function resolveQualificationGates(industry: IndustryProfile): Set<string> {
  const gates = new Set(UNIVERSAL_QUALIFICATION_GATES);
  const module = INDUSTRY_MODULES[industry];
  if (module) {
    for (const g of module.qualificationGates) gates.add(g);
  }
  return gates;
}

// Sales stage ordering — forward-only progression (Point 9).
// Gemini returns a salesStage string; the Decision Engine ensures it never regresses.
export const STAGE_ORDER: readonly string[] = [
  'Awareness', 'Interest', 'Consideration', 'Evaluation',
  'Negotiation', 'Decision', 'Booked', 'Post-Purchase', 'Advocate',
];

export function stageIndex(stage: string | null | undefined): number {
  const idx = STAGE_ORDER.indexOf(stage ?? '');
  return idx === -1 ? 0 : idx;
}

// ── Pattern Signal Type ───────────────────────────────────────────────────────
interface PatternSignal {
  key: string;
  label: string;
  points: number;
  patterns: RegExp[];
}

// ── Universal Interest Signals ────────────────────────────────────────────────
// Multi-language: English keywords + Hindi/Hinglish equivalents.
const INTEREST_PATTERNS: PatternSignal[] = [
  {
    key: 'asked_pricing',
    label: 'Asked about pricing',
    points: 15,
    patterns: [
      // English
      /\b(prices?|pricing|costs?|charges?|fees?|how much|rates?|tariff|amounts?|budget)\b/i,
      // Hindi / Hinglish
      /\b(kitna|kaas|daam|lagat|paisa|rupee|rs\.|₹|cost kya|price kya|kitne mein|kitna hai)\b/i,
    ],
  },
  {
    key: 'asked_dates',
    label: 'Asked about dates or schedule',
    points: 15,
    patterns: [
      /\b(dates?|when|kab|schedule|calendar|months?|timing)/i,
      // Month names (English)
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)/i,
      /\b(jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/i,
      // Hindi month queries
      /\b(kab se|kab tak|kitne din|konsa mahina|agla month)\b/i,
    ],
  },
  {
    key: 'asked_itinerary',
    label: 'Asked about itinerary or plan',
    points: 10,
    patterns: [
      /\b(itinerary|programme|program|day.by.day|day wise|plan|route|trek|expedition|journey)\b/i,
      /\b(schedule details|what.s the plan|full details|complete details|kya kya hoga)\b/i,
    ],
  },
  {
    key: 'asked_availability',
    label: 'Asked about availability or seats',
    points: 10,
    // No trailing \b — "available", "availability", "seats" all match
    patterns: [
      /\b(availab|seats?|slots?|spots?|capacity|how many.*(left|remain|open)|vacancy|space)/i,
      /\b(kitni jagah|seats bache|seat hai|slot available|open slots?)/i,
    ],
  },
  {
    key: 'asked_inclusions',
    label: 'Asked about inclusions',
    points: 8,
    patterns: [
      /\b(includ|inclusion|what.s included|what is covered|package includes|what.s covered|what do (you|we) get)\b/i,
      /\b(kya kya milega|kya include|sab kuch milega|sab shamil)\b/i,
    ],
  },
  {
    key: 'asked_payment_method',
    label: 'Asked about payment',
    points: 20,
    patterns: [
      /\b(payments?|pay\b|paying|paid|upi|neft|imps|transfer|advance|deposit|installments?|emi|razorpay|gpay|phonepe|paytm|how to pay|payment method)\b/i,
      /\b(paise kaise|payment kaise|advance kitna|booking amount|token amount)\b/i,
    ],
  },
  {
    key: 'asked_booking_process',
    label: 'Asked how to book',
    points: 25,
    patterns: [
      /\b(how (do i|can i|to) book|booking process|kaise book|steps to book|procedure|how.*register|sign up|how.*enroll)\b/i,
      /\b(book karna hai|register kaise|join kaise|kaise le sakte|kya process)\b/i,
    ],
  },
  {
    key: 'asked_cancellation',
    label: 'Asked about cancellation policy',
    points: 8,
    patterns: [
      /\b(cancel|cancellation|refund|policy|non.refundable|reschedul)\b/i,
      /\b(paise wapas|cancel ho|refund milega|policy kya)\b/i,
    ],
  },
  {
    key: 'asked_accommodation',
    label: 'Asked about accommodation',
    points: 8,
    patterns: [
      /\b(hotels?|accommodation|lodge|hostel|camps?|tent|guesthouse|where.*(stay|sleep))\b/i,
      /\b(kahan rukenge|kahan rahenge|stay kahan|raha kahan)\b/i,
    ],
  },
  {
    key: 'asked_difficulty',
    label: 'Asked about difficulty or requirements',
    points: 8,
    patterns: [
      /\b(difficult|fitness|requirement|experience|beginner|expert|age.limit|medical)\b/i,
      /\b(kitna mushkil|mushkil hai|kar sakta|beginner ke liye|experience chahiye)\b/i,
    ],
  },

  // ── NEW: Negotiation signals (previously 100% invisible to the engine) ────
  {
    key: 'asked_discount',
    label: 'Requested discount or negotiating price',
    points: 25,
    patterns: [
      /\b(discount|negotiate|negotiation|deal|special (price|rate|offer))\b/i,
      /\b(best (price|rate|deal)|can you do better|reduce (the )?(price|cost|rate))\b/i,
      /\b(lower (the )?(price|cost|rate|fee)|less (price|rate|expensive)|any (offer|promo|rebate))\b/i,
      /\b(discount milega|kuch kam ho sakta|kam nahi kar sakte|thoda kam karo|offer hai kya)\b/i,
    ],
  },

  // ── NEW: Commitment / Readiness signals ───────────────────────────────────
  {
    key: 'commitment_signals',
    label: 'Showing preparation and commitment',
    points: 20,
    patterns: [
      /\b(prepare|preparation|(what|anything).*(bring|carry|pack|wear|need|require))\b/i,
      /\b(things to (bring|pack|carry)|what should (i|we) (bring|wear|carry|pack))\b/i,
      /\b(before (the )?(trip|trek|tour|travel|journey|visit))\b/i,
      /\b(requirements? from (my|our) (side|end)|from (my|our) (side|end))\b/i,
      /\b(tayyari|kya lana|kya leke jana|kaise tayyar|kya karna hoga pehle)\b/i,
    ],
  },

  // ── NEW: Logistics / Meeting-point confirmation (near-decision signal) ─────
  {
    key: 'logistics_planning',
    label: 'Confirmed logistics or meeting details',
    points: 18,
    patterns: [
      /\b(meeting (point|place|spot)|pick.?up (point|location|spot|place))\b/i,
      /\b(where (do we|should we|will we) (meet|gather|assemble|start))\b/i,
      /\b(airport (transfer|pickup|meet)|how (do i|do we|to) get (there|to))\b/i,
      /\b(pickup kahan|meeting point kahan|kahan se chalenge|kahan milna hai)\b/i,
    ],
  },

  // ── NEW: Comparison / Competitive evaluation ───────────────────────────────
  {
    key: 'comparison_shopping',
    label: 'Comparing options or competitors',
    points: 15,
    patterns: [
      // "compar\w*" covers: comparing, comparison, compare, compared, comparative
      /\b(compar\w*|vs\.?|versus|alternative|other (option|package|company|operator|provider|tour|agency))\b/i,
      /\b(which (is )?(better|best)|any other|someone else|another (company|option|package|provider))\b/i,
      /\b(doosri company|koi aur|dusra option|compare kar|baaki options?|aur koi hai)\b/i,
    ],
  },

  // ── NEW: Urgency / Time pressure ──────────────────────────────────────────
  {
    key: 'urgency_signal',
    label: 'Expressed urgency or time pressure',
    points: 12,
    patterns: [
      /\b(urgent|urgently|asap|as soon as possible|immediately|right (now|away)|today|tomorrow)\b/i,
      /\b(this week|very soon|quickly|fast|hurry|limited (time|offer|seats?|slots?))\b/i,
      /\b(jaldi|abhi chahiye|turant|aaj (hi|chahiye)|kal tak|is hafte|jald se jald)\b/i,
    ],
  },
];

// ── Buying Intent Signals ─────────────────────────────────────────────────────
const BUYING_INTENT_PATTERNS: PatternSignal[] = [
  {
    key: 'intent_book',
    label: 'Expressed intent to book',
    points: 40,
    patterns: [
      // "I want to book" / "want to book" (with or without subject)
      /\b((i )?(want|wanna) (to )?(book|join|register|enroll|reserve))\b/i,
      /\b(i.m (interested|ready) (to|in) (book|join|register))\b/i,
      /\b(count me in|i.m in|i.ll (join|book|take it)|let.s do it)\b/i,
      /\b(book karna hai|join karna hai|lena hai|confirm karna hai|book kar)\b/i,
    ],
  },
  {
    key: 'intent_reserve',
    label: 'Requested a reservation',
    points: 40,
    patterns: [
      /\b(reserve (my|a|the|one)|book (a |my )?(table|seat|spot|slot|place|room)|i want (a |to )?reserve)\b/i,
      /\b(seat reserve|jagah pakdo|hold kar|block kar)\b/i,
    ],
  },
  {
    key: 'intent_payment_link',
    label: 'Requested payment link',
    points: 50,
    patterns: [
      /\b(send (me )?(the |a )?payment link|payment link (please|bhejo|do)|send invoice|link bhejo|upi (id|number) bhejo)\b/i,
      /\b(how (do|can) i pay|pay (now|today|online)|ready to pay|pay kar sakta)\b/i,
    ],
  },
  {
    key: 'intent_confirm_booking',
    label: 'Requested booking confirmation',
    points: 60,
    patterns: [
      /\b(confirm (my |the )?(booking|reservation|seat|registration)|is (my|the) booking confirmed|booking (id|number|confirmed)?)\b/i,
      /\b(booking confirm|seat confirm|registration confirm)\b/i,
    ],
  },
  {
    key: 'intent_when_book',
    label: 'Asked when they can book',
    points: 30,
    patterns: [
      /\b(when can i (book|pay|reserve|register)|can i book (now|today|right now)|book (now|today|asap))\b/i,
      /\b(ab book karu|abhi book|turant book|kab book kar sakta)\b/i,
    ],
  },
  // ── NEW: Invoice / Formal quote request (high-value closing signal) ────────
  {
    key: 'invoice_request',
    label: 'Requested invoice or formal quote',
    points: 35,
    patterns: [
      /\b(invoice|quotation|quote|pro.?forma|formal (offer|document|bill|proposal))\b/i,
      /\b(send (me )?(an? )?(invoice|quote|bill|proposal)|please (send|share) (quote|invoice))\b/i,
      /\b(bill bhejo|invoice chahiye|quote bhejo|formal quote|official quote)\b/i,
    ],
  },
];

// ── Data-Sharing Signals ──────────────────────────────────────────────────────
const DATA_SIGNALS: Record<string, { label: string; points: number }> = {
  shared_email:       { label: 'Shared email address',      points: 15 },
  shared_phone:       { label: 'Shared phone number',       points: 15 },
  shared_name:        { label: 'Shared their name',         points: 5  },
  shared_date:        { label: 'Provided date preference',  points: 8  },
  shared_guest_count: { label: 'Provided group size',       points: 10 },
  ready_to_pay:       { label: 'Signalled readiness to pay', points: 20 },
};

// ── Engagement Milestones ─────────────────────────────────────────────────────
const ENGAGEMENT_MILESTONES: Record<string, { label: string; points: number; threshold: number }> = {
  messages_5:  { label: 'Conversation >5 messages',  points: 10, threshold: 5  },
  messages_10: { label: 'Conversation >10 messages', points: 15, threshold: 10 },
  messages_15: { label: 'Conversation >15 messages', points: 10, threshold: 15 },
  messages_20: { label: 'Conversation >20 messages', points: 8,  threshold: 20 },
  messages_30: { label: 'Conversation >30 messages', points: 5,  threshold: 30 },
};

// ── AI Intent Contributions ───────────────────────────────────────────────────
// These add supplemental points when AI recognises intent beyond what keywords caught.
// Applied only when confidence >= AI_CONFIDENCE_THRESHOLD.
const AI_INTENT_CONTRIBUTIONS: Record<string, { label: string; points: number }> = {
  reserve_table:     { label: 'Expressed reservation intent (AI)',    points: 20 },
  private_event:     { label: 'Enquired about private event (AI)',    points: 20 },
  corporate_booking: { label: 'Enquired about corporate booking (AI)', points: 20 },
  gift_occasion:     { label: 'Enquired about gift/occasion (AI)',    points: 15 },
  confirm:           { label: 'Confirmed booking (AI)',               points: 30 },
  pricing:           { label: 'Asked about pricing (AI)',             points: 8  },
  timing:            { label: 'Asked about timing (AI)',              points: 5  },
  menu:              { label: 'Asked about menu (AI)',                points: 5  },
  human_request:     { label: 'Requested human agent (AI)',           points: 5  },
  // Zero-contribution intents
  greeting:          { label: '', points: 0 },
  general_enquiry:   { label: '', points: 0 },
  cancel:            { label: '', points: 0 },
  thank_you:         { label: '', points: 0 },
  location:          { label: '', points: 0 },
  complaint:         { label: '', points: 0 },
  unknown:           { label: '', points: 0 },
};

// ── Negative Signals ──────────────────────────────────────────────────────────
const NEGATIVE_PATTERNS: PatternSignal[] = [
  {
    key: 'not_interested',
    label: 'Stated not interested',
    points: -100,
    patterns: [
      /\b(not interested|no thanks|nahi chahiye|don.t need|no need|not required|no longer interested)\b/i,
      /\b(nahi chahiye|nahi lena|interest nahi|mujhe nahi)\b/i,
    ],
  },
  {
    key: 'just_browsing',
    label: 'Stated just browsing',
    points: -10,
    patterns: [
      /\b(just (browsing|looking|checking|seeing|curious|asking)|sirf dekh|just wanted to know|just enquiring)\b/i,
      /\b(sirf puch raha|bas dekh raha|abhi confirm nahi|pehle pata karna)\b/i,
    ],
  },
  {
    key: 'wrong_number',
    label: 'Wrong number',
    points: -50,
    patterns: [
      /\b(wrong number|wrong person|galat number|galat jagah|wrong chat)\b/i,
    ],
  },
];

// ── Validated Status Transitions ──────────────────────────────────────────────
// Defines which automatic transitions the engine is allowed to make.
// Manual overrides bypass this matrix.
const ALLOWED_AUTO_TRANSITIONS: Record<string, Set<LeadStatus>> = {
  new:       new Set(['cold', 'warm', 'hot', 'qualified', 'lost']),
  cold:      new Set(['warm', 'hot', 'qualified', 'lost']),
  warm:      new Set(['cold', 'hot', 'qualified', 'lost']),  // cold via decay
  hot:       new Set(['warm', 'qualified', 'lost']),          // warm via decay
  qualified: new Set(['hot', 'converted', 'lost']),           // hot via decay
  converted: new Set(),                                        // terminal
  lost:      new Set(['cold', 'warm', 'hot', 'qualified']),   // re-engageable
};

function isTransitionAllowed(from: string, to: LeadStatus): boolean {
  const allowed = ALLOWED_AUTO_TRANSITIONS[from];
  if (!allowed) return true; // unknown status — allow
  return allowed.has(to);
}

// ── Public Types ──────────────────────────────────────────────────────────────

export interface ScoringInput {
  userMessage: string | null | undefined;
  aiResponse: Pick<AIResponse, 'intent' | 'extractedData' | 'confidence'>;
  conversation: {
    message_count: number;
    created_at: string;
  };
  lead: {
    lead_score: number | null;
    lead_status: LeadStatus | string | null;
    manual_status?: string | null;  // if set, engine updates auto_status only
    buying_signals?: string[] | null;
    negative_signals?: string[] | null;
  };
  industryProfile?: IndustryProfile; // from business_profiles.industry
  // Feature flags — per-tenant; falls back to DEFAULT_FLAGS if not provided
  flags?: {
    enable_negotiation_detection?: boolean;
    enable_commitment_detection?: boolean;
    enable_urgency_detection?: boolean;
    enable_comparison_detection?: boolean;
  };
}

export interface ScoreBreakdownEntry {
  label: string;
  points: number;
  category: 'interest' | 'intent' | 'data' | 'engagement' | 'negative' | 'industry';
}

export interface ScoringResult {
  // Final resolved values
  lead_score:   number;
  lead_status:  LeadStatus;  // effective status (manual wins if set)
  auto_status:  LeadStatus;  // engine's recommendation (always updated)

  // Score components (for explainability)
  rule_score_delta: number;  // points from keyword/rule patterns only
  ai_score_delta:   number;  // supplemental points from AI intent
  score_delta:      number;  // total (rule + ai)
  ai_confidence:    number;
  ai_intent:        string;
  ai_ignored:       boolean; // true when AI confidence < threshold

  // Signal tracking
  new_signals:         string[];
  all_buying_signals:  string[];
  all_negative_signals: string[];

  // Explainability
  score_breakdown:   Record<string, ScoreBreakdownEntry>;
  scoring_reasoning: string;
  intent_level:      'high' | 'medium' | 'low';

  // Transition metadata
  status_changed: boolean;
  prev_status:    string;
}

// ── Main Scoring Function ─────────────────────────────────────────────────────

export function calculateLeadScore(input: ScoringInput): ScoringResult {
  const { userMessage, aiResponse, conversation, lead, industryProfile = 'general' } = input;

  const text = userMessage ?? '';
  const existingScore     = typeof lead.lead_score === 'number' ? lead.lead_score : 0;
  const existingStatus    = (lead.lead_status ?? 'new') as string;
  const hasManualOverride = !!lead.manual_status;
  const existingBuying    = lead.buying_signals    ?? [];
  const existingNegative  = lead.negative_signals  ?? [];
  const allCounted        = new Set([...existingBuying, ...existingNegative]);

  let ruleDelta = 0;
  let aiDelta   = 0;
  const newSignals:         string[] = [];
  const newNegativeSignals: string[] = [];
  const breakdown: Record<string, ScoreBreakdownEntry> = {};

  function addSignal(key: string, label: string, points: number, category: ScoreBreakdownEntry['category'], isAI = false) {
    if (points === 0 || !label) return;
    if (isAI) aiDelta   += points;
    else       ruleDelta += points;
    breakdown[key] = { label, points, category };
    if (points > 0) newSignals.push(key);
    else            newNegativeSignals.push(key);
    allCounted.add(key);
  }

  // 1. Universal interest patterns
  for (const { key, label, points, patterns } of INTEREST_PATTERNS) {
    if (!allCounted.has(key) && patterns.some(p => p.test(text))) {
      addSignal(key, label, points, 'interest');
    }
  }

  // 2. Buying intent patterns
  for (const { key, label, points, patterns } of BUYING_INTENT_PATTERNS) {
    if (!allCounted.has(key) && patterns.some(p => p.test(text))) {
      addSignal(key, label, points, 'intent');
    }
  }

  // 3. Industry-specific patterns
  const industryPatterns: IndustryPattern[] = INDUSTRY_PATTERNS[industryProfile] ?? [];
  for (const { key, label, points, patterns } of industryPatterns) {
    if (!allCounted.has(key) && patterns.some(p => p.test(text))) {
      addSignal(key, label, points, 'industry');
    }
  }

  // 4. Data-sharing from AI extraction
  const extracted = aiResponse.extractedData ?? {};
  if (extracted.email       && !allCounted.has('shared_email'))       addSignal('shared_email',       DATA_SIGNALS.shared_email.label,       DATA_SIGNALS.shared_email.points,       'data');
  if (extracted.phone       && !allCounted.has('shared_phone'))       addSignal('shared_phone',       DATA_SIGNALS.shared_phone.label,       DATA_SIGNALS.shared_phone.points,       'data');
  if (extracted.name        && !allCounted.has('shared_name'))        addSignal('shared_name',        DATA_SIGNALS.shared_name.label,        DATA_SIGNALS.shared_name.points,        'data');
  if (extracted.date        && !allCounted.has('shared_date'))        addSignal('shared_date',        DATA_SIGNALS.shared_date.label,        DATA_SIGNALS.shared_date.points,        'data');
  if (extracted.guestCount  && !allCounted.has('shared_guest_count')) addSignal('shared_guest_count', DATA_SIGNALS.shared_guest_count.label, DATA_SIGNALS.shared_guest_count.points, 'data');
  if (extracted.requestPayment === 'true' && !allCounted.has('ready_to_pay')) addSignal('ready_to_pay', DATA_SIGNALS.ready_to_pay.label, DATA_SIGNALS.ready_to_pay.points, 'intent');

  // 5. AI intent contribution — only when confidence meets threshold
  const aiConfidence = aiResponse.confidence ?? 0;
  const aiIgnored    = aiConfidence < AI_CONFIDENCE_THRESHOLD;
  const intentKey    = `ai_intent:${aiResponse.intent}`;
  const intentContrib = AI_INTENT_CONTRIBUTIONS[aiResponse.intent];

  if (!aiIgnored && intentContrib && intentContrib.points > 0 && !allCounted.has(intentKey)) {
    addSignal(intentKey, intentContrib.label, intentContrib.points, 'intent', true /* isAI */);
  }

  // 6. Engagement milestones
  const msgCount = conversation.message_count ?? 0;
  for (const [sigKey, { label, points, threshold }] of Object.entries(ENGAGEMENT_MILESTONES)) {
    if (msgCount >= threshold && !allCounted.has(sigKey)) {
      addSignal(sigKey, label, points, 'engagement');
    }
  }

  // 7. Greeting-only penalty — first message only
  if (msgCount <= 1) {
    const trimmed = text.trim();
    const isGreetingOnly = /^(hi+|hello|hey|hii+|hola|namaskar|namaste|hy|helo|heya|sup|yo|heys?|hai|haan|haa)\.?!?\s*$/i.test(trimmed);
    if (isGreetingOnly && !allCounted.has('only_greeting')) {
      addSignal('only_greeting', 'Sent greeting only', -10, 'negative');
    }
  }

  // 8. Negative signals
  for (const { key, label, points, patterns } of NEGATIVE_PATTERNS) {
    if (!allCounted.has(key) && patterns.some(p => p.test(text))) {
      addSignal(key, label, points, 'negative');
    }
  }

  // ── Compute scores ─────────────────────────────────────────────────────────
  // AI-as-floor rule (Point 3): AI can only add to the rule score, never reduce it.
  // The rule engine establishes the minimum. AI supplements upward only.
  const aiDeltaSafe  = Math.max(0, aiDelta);  // never negative from AI
  const totalDelta   = ruleDelta + aiDeltaSafe;
  const rawScore     = existingScore + totalDelta;
  const newScore     = Math.min(100, Math.max(0, rawScore));

  // ── Auto status from score (qualification gate enforced) ──────────────────
  const allAccumulatedSignals = [...existingBuying, ...newSignals];
  const autoStatus = deriveAutoStatus(newScore, existingStatus, newNegativeSignals, allAccumulatedSignals, industryProfile);

  // ── Validated transition for auto_status ─────────────────────────────────
  const validatedAutoStatus = isTransitionAllowed(existingStatus, autoStatus)
    ? autoStatus
    : (existingStatus as LeadStatus); // silently hold — log a warning in prod

  // ── Effective lead_status (manual wins) ──────────────────────────────────
  const effectiveStatus: LeadStatus = hasManualOverride
    ? (lead.manual_status as LeadStatus)
    : validatedAutoStatus;

  // ── Reasoning ────────────────────────────────────────────────────────────
  const positives = Object.values(breakdown).filter(s => s.points > 0).map(s => `✓ ${s.label}`);
  const negatives = Object.values(breakdown).filter(s => s.points < 0).map(s => `✗ ${s.label}`);
  const scoring_reasoning =
    [...positives, ...negatives].join('; ') || 'No new signals detected in this message';

  return {
    lead_score:   newScore,
    lead_status:  effectiveStatus,
    auto_status:  validatedAutoStatus,

    rule_score_delta: ruleDelta,
    ai_score_delta:   aiDeltaSafe,
    score_delta:      totalDelta,
    ai_confidence:    aiConfidence,
    ai_intent:        aiResponse.intent,
    ai_ignored:       aiIgnored,

    new_signals:          [...newSignals, ...newNegativeSignals],
    all_buying_signals:   [...existingBuying,   ...newSignals],
    all_negative_signals: [...existingNegative, ...newNegativeSignals],

    score_breakdown:   breakdown,
    scoring_reasoning,
    intent_level:      inferIntentLevel(newScore, newSignals),

    status_changed: effectiveStatus !== existingStatus,
    prev_status:    existingStatus,
  };
}

// ── Status Derivation ─────────────────────────────────────────────────────────

function deriveAutoStatus(
  score: number,
  currentStatus: string,
  newNegativeSignals: string[],
  allSignals: string[],        // all accumulated buying_signals for this lead
  industry: IndustryProfile = 'general',
): LeadStatus {
  // Converted is terminal — never auto-overridden
  if (currentStatus === 'converted') return 'converted';

  // Explicit rejection → lost
  if (newNegativeSignals.includes('not_interested') || newNegativeSignals.includes('wrong_number')) return 'lost';

  // QUALIFIED requires both score threshold AND an explicit closing signal.
  // Gates are resolved dynamically: universal gates ∪ industry-specific gates.
  // A negotiation lead with score=92 stays HOT until they trigger a closing signal.
  if (score >= SCORE_THRESHOLDS.QUALIFIED) {
    const gates = resolveQualificationGates(industry);
    const hasQualifyingSignal = allSignals.some(s => gates.has(s));
    if (hasQualifyingSignal) return 'qualified';
    return 'hot'; // high score but no closing signal → Hot, not Qualified
  }

  if (score >= SCORE_THRESHOLDS.HOT)  return 'hot';
  if (score >= SCORE_THRESHOLDS.WARM) return 'warm';
  return 'cold';
}

function inferIntentLevel(score: number, newSignals: string[]): 'high' | 'medium' | 'low' {
  const HIGH_INTENT = new Set([
    // Universal closing signals
    'intent_book', 'intent_reserve', 'intent_payment_link',
    'intent_confirm_booking', 'intent_when_book', 'ready_to_pay',
    'invoice_request',
    // New negotiation/commitment signals
    'asked_discount', 'commitment_signals', 'logistics_planning',
    // AI intent signals
    'ai_intent:confirm', 'ai_intent:reserve_table',
    'ai_intent:private_event', 'ai_intent:corporate_booking',
    // Industry-specific qualifying signals
    'ind_site_visit', 'ind_demo_request', 'ind_enroll_intent', 'ind_appointment',
  ]);
  if (newSignals.some(s => HIGH_INTENT.has(s)) || score >= SCORE_THRESHOLDS.HOT) return 'high';
  if (score >= SCORE_THRESHOLDS.WARM) return 'medium';
  return 'low';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const INITIAL_LEAD_SCORE = 0;

export function scoreLabel(score: number): string {
  if (score >= SCORE_THRESHOLDS.QUALIFIED) return 'Qualified';
  if (score >= SCORE_THRESHOLDS.HOT)       return 'Hot';
  if (score >= SCORE_THRESHOLDS.WARM)      return 'Warm';
  return 'Cold';
}
