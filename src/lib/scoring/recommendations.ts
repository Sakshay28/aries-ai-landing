// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Recommendation Engine (REQ 14)
//
// Separate from business logic. Each industry provides its own action set.
// Output is now a full RichRecommendation with priority, expected impact,
// reason, confidence, automation eligibility, and close probability delta.
// ═══════════════════════════════════════════════════════════════════════════

import type { IndustryProfile } from './industry-profiles';
import type { Momentum, ActionPriority } from './types';

// ── Output Types (REQ 14: Expanded Recommendation Output) ─────────────────

export interface SalesAction {
  title:           string;
  description:     string;
  channel:         'whatsapp' | 'call' | 'email' | 'in_person' | 'system';
  trigger_signal?: string;
}

export interface RichRecommendationOutput {
  // Core action
  primary_action:    SalesAction;
  secondary_actions: SalesAction[];
  summary:           string;

  // REQ 14: Expanded fields
  priority:          ActionPriority;
  expected_impact:   string;   // "Customer will confirm booking within 24h if followed up now"
  reason:            string;   // "Customer requested discount — they are in Negotiation stage"
  confidence:        number;   // 0-100
  automation_eligible: boolean;
  estimated_close_probability_improvement: number;  // percentage points
}

// ── Universal High-Priority Signal Actions ────────────────────────────────

const UNIVERSAL_ACTIONS: Record<string, RichRecommendationOutput> = {
  intent_payment_link: {
    primary_action: {
      title: 'Send Payment Link Now',
      description: 'Customer asked for the payment link — this is a closing signal. Send within 5 minutes.',
      channel: 'whatsapp', trigger_signal: 'intent_payment_link',
    },
    secondary_actions: [],
    summary: 'Send payment link immediately — customer is in closing stage.',
    priority: 'critical', expected_impact: 'Booking confirmed within the hour if payment link is sent now.',
    reason: 'Customer explicitly asked for the payment link.', confidence: 95,
    automation_eligible: true, estimated_close_probability_improvement: 40,
  },
  invoice_request: {
    primary_action: {
      title: 'Send Invoice or Quote',
      description: 'Customer requested a formal quote. Prepare and send within the hour.',
      channel: 'email', trigger_signal: 'invoice_request',
    },
    secondary_actions: [],
    summary: 'Send invoice — customer is evaluating and ready for a formal offer.',
    priority: 'critical', expected_impact: 'Customer will compare with competitors and decide within 24h.',
    reason: 'Invoice request is a high-confidence closing signal.', confidence: 90,
    automation_eligible: false, estimated_close_probability_improvement: 35,
  },
  intent_confirm_booking: {
    primary_action: {
      title: 'Confirm the Booking',
      description: 'Customer is asking to confirm. Provide booking confirmation immediately.',
      channel: 'whatsapp', trigger_signal: 'intent_confirm_booking',
    },
    secondary_actions: [],
    summary: 'Confirm booking now — customer is ready to commit.',
    priority: 'critical', expected_impact: 'Booking secured if confirmed within 30 minutes.',
    reason: 'Customer asked for booking confirmation.', confidence: 92,
    automation_eligible: true, estimated_close_probability_improvement: 45,
  },
  asked_discount: {
    primary_action: {
      title: 'Call to Negotiate',
      description: 'Customer is negotiating price. Have your best group/seasonal offer ready. Call — don\'t text.',
      channel: 'call', trigger_signal: 'asked_discount',
    },
    secondary_actions: [
      { title: 'Prepare Group Offer', description: 'Have group pricing ready before the call.', channel: 'system' },
    ],
    summary: 'Customer is negotiating — call with your best offer now.',
    priority: 'high', expected_impact: 'Call now increases close probability by ~25-30%.',
    reason: 'Customer explicitly requested a discount — they are price-sensitive and in Negotiation stage.',
    confidence: 85, automation_eligible: false, estimated_close_probability_improvement: 28,
  },
  commitment_signals: {
    primary_action: {
      title: 'Send Preparation Guide',
      description: 'Customer is planning ahead. Send the detailed preparation checklist and finalize dates.',
      channel: 'whatsapp', trigger_signal: 'commitment_signals',
    },
    secondary_actions: [],
    summary: 'Customer is planning — send preparation details and lock in dates.',
    priority: 'high', expected_impact: 'Finalizing logistics moves customer from Intent to Decision.',
    reason: 'Preparation questions are a strong commitment signal.', confidence: 80,
    automation_eligible: true, estimated_close_probability_improvement: 20,
  },
  logistics_planning: {
    primary_action: {
      title: 'Share Meeting Point Details',
      description: 'Send pickup point, time, and any logistics information they asked for.',
      channel: 'whatsapp', trigger_signal: 'logistics_planning',
    },
    secondary_actions: [],
    summary: 'Customer confirmed logistics — share meeting point now.',
    priority: 'high', expected_impact: 'Logistics confirmation is a near-Decision stage signal.',
    reason: 'Meeting point questions indicate customer is mentally committed.', confidence: 78,
    automation_eligible: true, estimated_close_probability_improvement: 18,
  },
  urgency_signal: {
    primary_action: {
      title: 'Respond Immediately',
      description: 'Customer expressed urgency. Any delay risks losing them to a competitor.',
      channel: 'whatsapp', trigger_signal: 'urgency_signal',
    },
    secondary_actions: [],
    summary: 'Urgent lead — respond within 5 minutes or lose them.',
    priority: 'critical', expected_impact: 'Response within 5 min retains 90% of urgent leads.',
    reason: 'Customer expressed time pressure.', confidence: 88,
    automation_eligible: true, estimated_close_probability_improvement: 30,
  },
  comparison_shopping: {
    primary_action: {
      title: 'Send Value Differentiator',
      description: 'Customer is comparing. Share your unique value proposition, testimonials, and what makes you better.',
      channel: 'whatsapp', trigger_signal: 'comparison_shopping',
    },
    secondary_actions: [
      { title: 'Share Testimonials', description: 'Send 2-3 short testimonials from similar customers.', channel: 'whatsapp' },
    ],
    summary: 'Customer is comparing options — show why you are the better choice.',
    priority: 'high', expected_impact: 'Sharing USP within 1h increases win rate by ~20% against competitors.',
    reason: 'Customer is actively evaluating alternatives.', confidence: 75,
    automation_eligible: false, estimated_close_probability_improvement: 20,
  },
};

// ── Industry Provider Type ────────────────────────────────────────────────

type IndustryRecommendationProvider = (
  signals:  string[],
  status:   string,
  score:    number,
  momentum: Momentum,
) => RichRecommendationOutput;

// ── Industry Providers ────────────────────────────────────────────────────

const INDUSTRY_PROVIDERS: Record<IndustryProfile, IndustryRecommendationProvider> = {

  travel: (signals, status, score, momentum) => {
    if (signals.includes('intent_payment_link'))    return UNIVERSAL_ACTIONS.intent_payment_link;
    if (signals.includes('invoice_request'))        return UNIVERSAL_ACTIONS.invoice_request;
    if (signals.includes('intent_confirm_booking')) return UNIVERSAL_ACTIONS.intent_confirm_booking;
    if (signals.includes('asked_discount')) return UNIVERSAL_ACTIONS.asked_discount;

    if (signals.includes('ind_expedition_named') && signals.includes('commitment_signals')) {
      return {
        primary_action: { title: 'Send Full Itinerary + Packing List', description: 'Customer named the trek and is planning. Send detailed PDF with fitness requirements, packing list, and itinerary.', channel: 'whatsapp' },
        secondary_actions: [{ title: 'Confirm Availability', description: 'Check and confirm batch availability for their dates.', channel: 'whatsapp' }],
        summary: 'Customer named a specific trek and is preparing — send full itinerary.',
        priority: 'high', expected_impact: 'Detailed itinerary moves customer from Consideration to Decision.',
        reason: 'Specific trek + preparation questions = strong commitment signals.', confidence: 82,
        automation_eligible: true, estimated_close_probability_improvement: 22,
      };
    }

    if (signals.includes('commitment_signals'))  return UNIVERSAL_ACTIONS.commitment_signals;
    if (signals.includes('logistics_planning'))  return UNIVERSAL_ACTIONS.logistics_planning;

    if (signals.includes('asked_dates') || signals.includes('asked_availability')) {
      return {
        primary_action: { title: 'Share Availability', description: 'Reply with upcoming batch dates and available slots.', channel: 'whatsapp' },
        secondary_actions: [],
        summary: 'Customer is checking dates — respond with availability.',
        priority: 'high', expected_impact: 'Sharing dates moves customer toward booking decision.',
        reason: 'Date availability is a key decision factor for travel.', confidence: 72,
        automation_eligible: false, estimated_close_probability_improvement: 15,
      };
    }
    return defaultRecommendation(status, score, momentum);
  },

  restaurant: (signals, status, score, momentum) => {
    if (signals.includes('ind_private_room') || signals.includes('intent_reserve')) {
      return {
        primary_action: { title: 'Confirm Table Availability', description: 'Check availability and confirm the reservation immediately.', channel: 'whatsapp' },
        secondary_actions: [],
        summary: 'Customer wants to reserve — confirm availability now.',
        priority: 'critical', expected_impact: 'Immediate confirmation captures the reservation.',
        reason: 'Reservation intent is a closing signal for restaurants.', confidence: 88,
        automation_eligible: true, estimated_close_probability_improvement: 38,
      };
    }
    if (signals.includes('asked_pricing')) {
      return {
        primary_action: { title: 'Send Menu + Pricing', description: 'Share the menu with pricing for their expected group size.', channel: 'whatsapp' },
        secondary_actions: [],
        summary: 'Send menu and pricing — customer is evaluating.',
        priority: 'high', expected_impact: 'Menu with pricing answers their primary objection.',
        reason: 'Customer asked about pricing.', confidence: 70,
        automation_eligible: true, estimated_close_probability_improvement: 15,
      };
    }
    return defaultRecommendation(status, score, momentum);
  },

  hotel: (signals, status, score, momentum) => {
    if (signals.includes('ind_checkin_date') && signals.includes('asked_pricing')) {
      return {
        primary_action: { title: 'Send Availability Quote', description: 'Send a targeted availability quote for their specific dates.', channel: 'whatsapp' },
        secondary_actions: [],
        summary: 'Customer has dates and price interest — send quote now.',
        priority: 'critical', expected_impact: 'Targeted quote has ~60% booking rate for this customer profile.',
        reason: 'Check-in dates + pricing intent = ready to book.', confidence: 85,
        automation_eligible: false, estimated_close_probability_improvement: 32,
      };
    }
    if (signals.includes('asked_payment_method')) return UNIVERSAL_ACTIONS.intent_payment_link;
    return defaultRecommendation(status, score, momentum);
  },

  clinic: (signals, status, score, momentum) => {
    if (signals.includes('ind_appointment') || signals.includes('ind_urgency')) {
      return {
        primary_action: { title: 'Book Appointment Now', description: 'Offer available appointment slots immediately — patient needs timely care.', channel: 'whatsapp' },
        secondary_actions: [],
        summary: 'Patient wants an appointment — offer slots immediately.',
        priority: 'critical', expected_impact: 'Offering slots within 5 min retains 95% of urgent clinic leads.',
        reason: 'Patient expressed urgency or appointment need.', confidence: 92,
        automation_eligible: true, estimated_close_probability_improvement: 45,
      };
    }
    return defaultRecommendation(status, score, momentum);
  },

  real_estate: (signals, status, score, momentum) => {
    if (signals.includes('ind_site_visit')) {
      return {
        primary_action: { title: 'Schedule Site Visit', description: 'Book a site visit for this week. Interested buyers cool down fast.', channel: 'call' },
        secondary_actions: [],
        summary: 'Customer wants a site visit — book it today.',
        priority: 'critical', expected_impact: 'Site visit booked = 3× higher close rate.',
        reason: 'Site visit request is the highest-intent signal in real estate.', confidence: 90,
        automation_eligible: false, estimated_close_probability_improvement: 40,
      };
    }
    if (signals.includes('ind_budget') && signals.includes('asked_pricing')) {
      return {
        primary_action: { title: 'Send Matching Properties', description: 'Shortlist 3-5 properties within their budget and send today.', channel: 'whatsapp' },
        secondary_actions: [],
        summary: 'Customer shared budget — shortlist matching properties.',
        priority: 'high', expected_impact: 'Relevant shortlist moves customer to site visit request.',
        reason: 'Budget disclosure + pricing enquiry = serious buyer.', confidence: 80,
        automation_eligible: false, estimated_close_probability_improvement: 25,
      };
    }
    return defaultRecommendation(status, score, momentum);
  },

  retail: (signals, status, score, momentum) => {
    if (signals.includes('ind_bulk') && signals.includes('asked_pricing')) {
      return {
        primary_action: { title: 'Send Bulk Pricing Sheet', description: 'Share bulk pricing with minimum order quantity.', channel: 'whatsapp' },
        secondary_actions: [],
        summary: 'Bulk order enquiry — send pricing and MOQ now.',
        priority: 'high', expected_impact: 'Bulk pricing sheet moves B2B customer to Purchase Order.',
        reason: 'Bulk quantity + pricing intent = serious B2B buyer.', confidence: 80,
        automation_eligible: false, estimated_close_probability_improvement: 22,
      };
    }
    return defaultRecommendation(status, score, momentum);
  },

  education: (signals, status, score, momentum) => {
    if (signals.includes('ind_enroll_intent') || signals.includes('asked_payment_method')) {
      return {
        primary_action: { title: 'Send Enrollment Form', description: 'Share the form with fee structure and payment options.', channel: 'whatsapp' },
        secondary_actions: [],
        summary: 'Student ready to enroll — send form and fees immediately.',
        priority: 'critical', expected_impact: 'Enrollment form + payment link = same-day conversion.',
        reason: 'Enrollment intent is the highest signal for education leads.', confidence: 88,
        automation_eligible: true, estimated_close_probability_improvement: 38,
      };
    }
    return defaultRecommendation(status, score, momentum);
  },

  automotive: (signals, status, score, momentum) => {
    if (signals.includes('ind_test_drive')) {
      return {
        primary_action: { title: 'Book Test Drive', description: 'Schedule a test drive for this week. This is the highest automotive intent signal.', channel: 'call' },
        secondary_actions: [],
        summary: 'Customer wants a test drive — book immediately.',
        priority: 'critical', expected_impact: 'Test drive = 65% conversion rate on follow-up.',
        reason: 'Test drive request is the single highest-intent signal in automotive.', confidence: 92,
        automation_eligible: false, estimated_close_probability_improvement: 42,
      };
    }
    if (signals.includes('ind_loan_enquiry')) {
      return {
        primary_action: { title: 'Share Finance Options', description: 'Send EMI calculator and finance partner options.', channel: 'whatsapp' },
        secondary_actions: [],
        summary: 'Customer is exploring financing — share loan options.',
        priority: 'high', expected_impact: 'Financing clarity removes the biggest objection in automotive.',
        reason: 'Loan enquiry indicates budget is not the blocker — only process clarity is needed.',
        confidence: 78, automation_eligible: true, estimated_close_probability_improvement: 20,
      };
    }
    return defaultRecommendation(status, score, momentum);
  },

  saas: (signals, status, score, momentum) => {
    if (signals.includes('ind_demo_request')) {
      return {
        primary_action: { title: 'Book Product Demo', description: 'Schedule within 24 hours — SaaS leads cool extremely fast.', channel: 'call' },
        secondary_actions: [],
        summary: 'Demo requested — schedule within 24 hours.',
        priority: 'critical', expected_impact: 'Demo booked within 24h = 3× higher close rate vs. 48h+.',
        reason: 'Demo request is the highest-intent SaaS signal.', confidence: 90,
        automation_eligible: false, estimated_close_probability_improvement: 40,
      };
    }
    if (signals.includes('ind_trial')) {
      return {
        primary_action: { title: 'Activate Trial Account', description: 'Activate trial and send onboarding email immediately.', channel: 'email' },
        secondary_actions: [{ title: 'Send Onboarding Guide', description: 'Share quick-start guide to get them using the product today.', channel: 'email' }],
        summary: 'Trial requested — activate and onboard immediately.',
        priority: 'high', expected_impact: 'Activated trials that reach Aha moment within 3 days have 70% conversion.',
        reason: 'Trial request shows strong product intent.', confidence: 85,
        automation_eligible: true, estimated_close_probability_improvement: 30,
      };
    }
    return defaultRecommendation(status, score, momentum);
  },

  general: (signals, status, score, momentum) => defaultRecommendation(status, score, momentum),
};

// ── Public API ────────────────────────────────────────────────────────────

export function getRecommendation(
  industry: IndustryProfile,
  signals:  string[],
  status:   string,
  score:    number,
  momentum: Momentum = 'Stable',
): RichRecommendationOutput {
  // Universal overrides: check critical signals first regardless of industry
  for (const key of ['intent_payment_link', 'invoice_request', 'intent_confirm_booking', 'urgency_signal']) {
    if (signals.includes(key) && UNIVERSAL_ACTIONS[key]) {
      const provider = INDUSTRY_PROVIDERS[industry] ?? INDUSTRY_PROVIDERS.general;
      return provider(signals, status, score, momentum);
    }
  }
  const provider = INDUSTRY_PROVIDERS[industry] ?? INDUSTRY_PROVIDERS.general;
  return provider(signals, status, score, momentum);
}

// ── Default Fallback ──────────────────────────────────────────────────────

function defaultRecommendation(status: string, score: number, momentum: Momentum): RichRecommendationOutput {
  const declining = momentum === 'Declining' || momentum === 'Dormant';

  if (status === 'hot' || status === 'qualified') {
    return {
      primary_action: { title: 'Follow Up Immediately', description: 'High-intent lead. Reach out via WhatsApp now.', channel: 'whatsapp' },
      secondary_actions: [],
      summary: `Score ${score} — high-intent lead${declining ? ' (momentum declining — act fast)' : ''}.`,
      priority: declining ? 'critical' : 'high',
      expected_impact: 'Follow-up within 1h retains 80% of hot leads.',
      reason: `Lead scored ${score}/100${declining ? ', but momentum is declining' : ''}.`,
      confidence: 75, automation_eligible: false,
      estimated_close_probability_improvement: declining ? 20 : 15,
    };
  }
  if (status === 'warm') {
    return {
      primary_action: { title: 'Send More Information', description: 'Share relevant product/service information to progress them.', channel: 'whatsapp' },
      secondary_actions: [],
      summary: 'Warm lead — nurture with relevant content.',
      priority: 'medium', expected_impact: 'Good content moves 40% of warm leads to hot within a week.',
      reason: `Lead is interested but needs more information (score: ${score}).`,
      confidence: 60, automation_eligible: true, estimated_close_probability_improvement: 8,
    };
  }
  return {
    primary_action: { title: 'Ask Qualifying Questions', description: 'Understand their needs better with targeted questions.', channel: 'whatsapp' },
    secondary_actions: [],
    summary: 'Early-stage lead — qualify their intent.',
    priority: 'low', expected_impact: 'Qualifying questions identify whether this lead is worth pursuing.',
    reason: 'Low score — need to determine buying intent before investing time.',
    confidence: 45, automation_eligible: true, estimated_close_probability_improvement: 5,
  };
}

// ── Backward-compat shim (old RecommendationOutput callers) ──────────────

export type { RichRecommendationOutput as RecommendationOutput };
export type { ActionPriority };
