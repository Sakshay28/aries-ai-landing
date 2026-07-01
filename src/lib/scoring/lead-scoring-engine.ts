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
import type { GeminiConversationAnalysisV2 } from './types';
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


// ── Public Types ──────────────────────────────────────────────────────────────

export interface ScoringInput {
  userMessage: string | null | undefined;
  aiResponse: Partial<GeminiConversationAnalysisV2> & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractedData?: any;
    intent?: string;
    confidence?: number;
  };
  conversation: {
    message_count: number;
    created_at: string;
  };
  lead: {
    lead_score: number | null;
    lead_status: LeadStatus | string | null;
    manual_status?: string | null;  // legacy manual stage
    manual_override?: boolean | null;
    manual_stage?: string | null;
    buying_signals?: string[] | null;
    negative_signals?: string[] | null;
    tags?: string[] | null;
    is_repeat_customer?: boolean | null;
    past_bookings_count?: number | null;
    last_activity_at?: string | null;
  };
  industryProfile?: IndustryProfile;
}

export interface ScoreBreakdownEntry {
  label: string;
  points: number;
  category: 'interest' | 'intent' | 'data' | 'engagement' | 'negative' | 'industry';
}

export interface ScoringResult {
  lead_score:   number;
  lead_status:  LeadStatus;  // effective status
  auto_status:  LeadStatus;  // recommendation

  rule_score_delta: number;
  ai_score_delta:   number;
  score_delta:      number;
  ai_confidence:    number;
  ai_intent:        string;
  ai_ignored:       boolean;

  new_signals:          string[];
  all_buying_signals:  string[];
  all_negative_signals: string[];

  score_breakdown:   Record<string, ScoreBreakdownEntry>;
  scoring_reasoning: string;
  intent_level:      'high' | 'medium' | 'low';

  status_changed: boolean;
  prev_status:    string;
}

// ── Main Scoring Function ─────────────────────────────────────────────────────

export function calculateLeadScore(input: ScoringInput): ScoringResult {
  const { userMessage, aiResponse, conversation, lead } = input;

  const text = userMessage ?? '';
  const existingScore = typeof lead.lead_score === 'number' ? lead.lead_score : 0;
  const existingStatus = (lead.lead_status ?? 'new') as string;
  const hasManualOverride = !!lead.manual_override || !!lead.manual_status;
  
  let score = 0;
  const breakdown: Record<string, ScoreBreakdownEntry> = {};
  const newSignals: string[] = [];
  const newNegativeSignals: string[] = [];

  function addSignal(key: string, label: string, points: number, category: ScoreBreakdownEntry['category']) {
    score += points;
    breakdown[key] = { label, points, category };
    if (points > 0) newSignals.push(key);
    else newNegativeSignals.push(key);
  }

  // ── 1. Buying Intent (+25) ──
  const hasBuyingIntent = 
    ['Qualified', 'Hot', 'Converted', 'qualified', 'hot', 'converted'].includes(aiResponse.stage ?? '') ||
    /(book|reserv|confirm|appoint|order|buy|purchas)/i.test(aiResponse.intent ?? '') ||
    (aiResponse.booking_probability ?? 0) > 50;
  if (hasBuyingIntent) {
    addSignal('buying_intent', 'Buying intent detected', 25, 'intent');
  }

  // ── 2. Asked Pricing (+10) ──
  const matchesPricing = 
    /\b(prices?|pricing|costs?|charges?|fees?|how much|rates?|tariff|amounts?|budget|kitna|kaas|daam|lagat|paisa|rupee|rs\.|₹)\b/i.test(text) ||
    /(price|cost|fee|charge|rate|negotiat|discount)/i.test(aiResponse.intent ?? '');
  if (matchesPricing) {
    addSignal('asked_pricing', 'Asked about pricing', 10, 'interest');
  }

  // ── 3. Asked Availability (+10) ──
  const matchesAvailability = 
    /\b(availab|seats?|slots?|spots?|capacity|vacancy|space|dates?|when|kab|schedule|calendar|timing)\b/i.test(text) ||
    /(availab|date|time|schedule|slot|spot)/i.test(aiResponse.intent ?? '');
  if (matchesAvailability) {
    addSignal('asked_availability', 'Asked about availability', 10, 'interest');
  }

  // ── 4. Requested Booking (+20) ──
  const matchesBookingRequest = 
    /\b(book|reserve|confirm|appoint|karna hai)\b/i.test(text) ||
    /(book|reserv|appoint|confirm)/i.test(aiResponse.intent ?? '');
  if (matchesBookingRequest) {
    addSignal('requested_booking', 'Requested booking/appointment', 20, 'intent');
  }

  // ── 5. Positive Sentiment (+10) ──
  if (aiResponse.sentiment === 'positive') {
    addSignal('positive_sentiment', 'Positive sentiment', 10, 'interest');
  }

  // ── 6. Responds Quickly (+5) ──
  const messageCount = conversation.message_count ?? 0;
  if (messageCount > 0) {
    addSignal('responds_quickly', 'Responds quickly and engages', 5, 'engagement');
  }

  // ── 7. Multiple Conversations (+10) ──
  if (messageCount > 5) {
    addSignal('multiple_conversations', 'Multiple messages exchanged (> 5)', 10, 'engagement');
  }

  // ── 8. Returning Customer (+10) ──
  if (lead.is_repeat_customer) {
    addSignal('returning_customer', 'Returning customer profile', 10, 'engagement');
  }

  // ── 9. Repeated Visits (+10) ──
  if ((lead.past_bookings_count ?? 0) > 1) {
    addSignal('repeated_visits', 'Repeated visits or bookings history', 10, 'engagement');
  }

  // ── 10. Ghosted over 14 days (-20) ──
  if (lead.last_activity_at) {
    const diffMs = Date.now() - new Date(lead.last_activity_at).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays >= 14) {
      addSignal('ghosted_14_days', 'Ghosted over 14 days', -20, 'negative');
    }
  }

  // ── 11. Negative Sentiment (-15) ──
  if (aiResponse.sentiment === 'negative') {
    addSignal('negative_sentiment', 'Negative customer sentiment', -15, 'negative');
  }

  // ── 12. Cancelled Booking (-25) ──
  const hasCancelled = lead.tags?.includes('cancelled') || lead.tags?.includes('cancelled_booking');
  if (hasCancelled) {
    addSignal('cancelled_booking', 'Cancelled booking history', -25, 'negative');
  }

  // ── 13. Competitor Mention (-10) ──
  const mentionsCompetitor = /\b(competitor|other vendor|other clinic|another company|vs|cheaper elsewhere)\b/i.test(text);
  if (mentionsCompetitor) {
    addSignal('competitor_mention', 'Mentioned competitor or alternatives', -10, 'negative');
  }

  // ── 14. Spam (-100) ──
  if (lead.tags?.includes('spam')) {
    addSignal('spam_lead', 'Classified as spam', -100, 'negative');
  }

  // ── 15. Duplicate (-100) ──
  if (lead.tags?.includes('duplicate')) {
    addSignal('duplicate_lead', 'Duplicate contact detected', -100, 'negative');
  }

  const finalScore = Math.min(100, Math.max(0, score));

  // Determine stage based on AI response
  const aiSuggestedStage: LeadStatus = (aiResponse.stage?.toLowerCase() as LeadStatus) || 'new';
  
  // Transition safety check
  const validatedAutoStatus = isTransitionAllowed(existingStatus, aiSuggestedStage)
    ? aiSuggestedStage
    : (existingStatus as LeadStatus);

  const effectiveStatus: LeadStatus = hasManualOverride
    ? ((lead.manual_stage || lead.manual_status || existingStatus) as LeadStatus)
    : validatedAutoStatus;

  const positives = Object.values(breakdown).filter(s => s.points > 0).map(s => `✓ ${s.label}`);
  const negatives = Object.values(breakdown).filter(s => s.points < 0).map(s => `✗ ${s.label}`);
  const scoring_reasoning =
    [...positives, ...negatives].join('; ') || 'No new signals detected';

  return {
    lead_score:   finalScore,
    lead_status:  effectiveStatus,
    auto_status:  validatedAutoStatus,

    rule_score_delta: score,
    ai_score_delta:   0,
    score_delta:      score,
    ai_confidence:    aiResponse.confidence ?? 0,
    ai_intent:        aiResponse.intent ?? 'unknown',
    ai_ignored:       false,

    new_signals:          [...newSignals, ...newNegativeSignals],
    all_buying_signals:   [...(lead.buying_signals || []), ...newSignals],
    all_negative_signals: [...(lead.negative_signals || []), ...newNegativeSignals],

    score_breakdown:   breakdown,
    scoring_reasoning,
    intent_level:      finalScore > 70 ? 'high' : finalScore > 30 ? 'medium' : 'low',

    status_changed: effectiveStatus !== existingStatus,
    prev_status:    existingStatus,
  };
}

// ── Status Transitions ────────────────────────────────────────────────────────

const ALLOWED_AUTO_TRANSITIONS: Record<string, Set<LeadStatus>> = {
  new:       new Set(['interested', 'warm', 'cold', 'hot', 'qualified', 'converted', 'lost']),
  cold:      new Set(['interested', 'warm', 'hot', 'qualified', 'lost']),
  warm:      new Set(['interested', 'cold', 'hot', 'qualified', 'lost']),
  interested: new Set(['cold', 'hot', 'qualified', 'converted', 'lost']),
  hot:       new Set(['interested', 'warm', 'cold', 'qualified', 'converted', 'lost']),
  qualified: new Set(['cold', 'hot', 'converted', 'lost']),
  converted: new Set(),
  lost:      new Set(['new', 'interested', 'warm', 'cold', 'qualified', 'hot', 'converted']),
};

function isTransitionAllowed(from: string, to: LeadStatus): boolean {
  const allowed = ALLOWED_AUTO_TRANSITIONS[from];
  if (!allowed) return true;
  return allowed.has(to);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const INITIAL_LEAD_SCORE = 0;

export function scoreLabel(score: number): string {
  if (score >= 70) return 'Hot';
  if (score >= 30) return 'Interested';
  return 'Cold';
}

