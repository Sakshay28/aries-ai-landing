// ══════════════════════════════════════════════════════════════════
// Production Hardening Tests for Lead Scoring Engine v2
//
// Covers: industry profiles, manual overrides, status transitions,
// AI confidence threshold, multi-language, decay logic, edge cases,
// idempotency, and concurrency-safe deduplication.
// ══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { calculateLeadScore, AI_CONFIDENCE_THRESHOLD, SCORE_THRESHOLDS } from '@/lib/scoring/lead-scoring-engine';
import { calculateDecayPoints, shouldForceCold, DEFAULT_DECAY_THRESHOLDS } from '@/lib/scoring/lead-decay';
import { normalizeIndustry } from '@/lib/scoring/industry-profiles';
import type { ScoringInput } from '@/lib/scoring/lead-scoring-engine';

// ── Shared helpers ────────────────────────────────────────────────────────────

function input(overrides: Partial<ScoringInput> & { userMessage?: string }): ScoringInput {
  return {
    userMessage: overrides.userMessage ?? '',
    aiResponse: { intent: 'general_enquiry', extractedData: {}, confidence: 0.9, ...(overrides.aiResponse ?? {}) },
    conversation: { message_count: 1, created_at: '', ...(overrides.conversation ?? {}) },
    lead: { lead_score: 0, lead_status: 'new', buying_signals: [], negative_signals: [], ...(overrides.lead ?? {}) },
    industryProfile: overrides.industryProfile,
  };
}

// ══════════════════════════════════════════════════════════════════
// 1. INDUSTRY PROFILE SYSTEM
// ══════════════════════════════════════════════════════════════════

describe('Industry Profiles', () => {
  describe('travel profile', () => {
    it('awards points for asking about altitude', () => {
      const r = calculateLeadScore(input({ userMessage: 'Is this trek difficult for beginners?', industryProfile: 'travel' }));
      expect(r.all_buying_signals).toContain('ind_altitude');
      expect(r.score_delta).toBeGreaterThan(0);
    });

    it('awards points for permit inquiry', () => {
      const r = calculateLeadScore(input({ userMessage: 'Do I need a permit for Zanskar?', industryProfile: 'travel' }));
      expect(r.all_buying_signals).toContain('ind_permits');
    });

    it('awards bonus points for named expedition', () => {
      const r = calculateLeadScore(input({ userMessage: 'Tell me about the Zanskar expedition', industryProfile: 'travel' }));
      expect(r.all_buying_signals).toContain('ind_expedition_named');
      expect(r.score_delta).toBeGreaterThanOrEqual(20);
    });

    it('stacks with universal signals', () => {
      const r = calculateLeadScore(input({
        userMessage: 'Zanskar dates and price?',
        industryProfile: 'travel',
      }));
      // Universal: asked_pricing + asked_dates; Industry: ind_expedition_named
      expect(r.score_delta).toBeGreaterThanOrEqual(15 + 15 + 20);
    });
  });

  describe('restaurant profile', () => {
    it('awards points for special occasion', () => {
      const r = calculateLeadScore(input({ userMessage: 'I want to book for my birthday', industryProfile: 'restaurant' }));
      expect(r.all_buying_signals).toContain('ind_occasion');
      expect(r.all_buying_signals).toContain('intent_book');
    });

    it('awards points for dietary restriction', () => {
      const r = calculateLeadScore(input({ userMessage: 'Do you have vegan options?', industryProfile: 'restaurant' }));
      expect(r.all_buying_signals).toContain('ind_dietary');
    });

    it('awards points for private dining', () => {
      const r = calculateLeadScore(input({ userMessage: 'Do you have a private dining room?', industryProfile: 'restaurant' }));
      expect(r.all_buying_signals).toContain('ind_private_room');
    });
  });

  describe('clinic profile', () => {
    it('awards points for appointment request', () => {
      const r = calculateLeadScore(input({ userMessage: 'I need to book an appointment', industryProfile: 'clinic' }));
      expect(r.all_buying_signals).toContain('ind_appointment');
      expect(r.score_delta).toBeGreaterThanOrEqual(25);
    });

    it('awards points for urgency', () => {
      const r = calculateLeadScore(input({ userMessage: 'This is urgent, I need to see the doctor today', industryProfile: 'clinic' }));
      expect(r.all_buying_signals).toContain('ind_urgency');
    });

    it('awards points for insurance inquiry', () => {
      const r = calculateLeadScore(input({ userMessage: 'Are you empanelled with Star Health insurance?', industryProfile: 'clinic' }));
      expect(r.all_buying_signals).toContain('ind_insurance');
    });
  });

  describe('real_estate profile', () => {
    it('awards points for site visit request', () => {
      const r = calculateLeadScore(input({ userMessage: 'Can I schedule a site visit this weekend?', industryProfile: 'real_estate' }));
      expect(r.all_buying_signals).toContain('ind_site_visit');
      expect(r.score_delta).toBeGreaterThanOrEqual(30);
    });

    it('awards points for budget mention', () => {
      const r = calculateLeadScore(input({ userMessage: 'My budget is 1.5 crore', industryProfile: 'real_estate' }));
      expect(r.all_buying_signals).toContain('ind_budget');
    });

    it('awards points for property type specification', () => {
      const r = calculateLeadScore(input({ userMessage: 'Looking for a 3 BHK apartment', industryProfile: 'real_estate' }));
      expect(r.all_buying_signals).toContain('ind_property_type');
    });
  });

  describe('hotel profile', () => {
    it('awards points for check-in date', () => {
      const r = calculateLeadScore(input({ userMessage: 'We would check in on 15th July', industryProfile: 'hotel' }));
      expect(r.all_buying_signals).toContain('ind_checkin_date');
    });

    it('awards points for room type inquiry', () => {
      const r = calculateLeadScore(input({ userMessage: 'Do you have sea view suites?', industryProfile: 'hotel' }));
      expect(r.all_buying_signals).toContain('ind_room_type');
    });
  });

  describe('industry signal deduplication', () => {
    it('does not double-count industry-specific signals', () => {
      const first = calculateLeadScore(input({ userMessage: 'Tell me about Zanskar', industryProfile: 'travel' }));
      const second = calculateLeadScore(input({
        userMessage: 'More about Zanskar expedition',
        industryProfile: 'travel',
        lead: { lead_score: first.lead_score, lead_status: first.lead_status, buying_signals: first.all_buying_signals, negative_signals: [] },
      }));
      expect(second.new_signals).not.toContain('ind_expedition_named');
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. INDUSTRY NORMALIZATION
// ══════════════════════════════════════════════════════════════════

describe('normalizeIndustry', () => {
  it('maps travel keywords correctly', () => {
    expect(normalizeIndustry('Adventure Travel')).toBe('travel');
    expect(normalizeIndustry('Trekking & Tours')).toBe('travel');
    expect(normalizeIndustry('Tourism')).toBe('travel');
  });

  it('maps restaurant keywords', () => {
    expect(normalizeIndustry('Restaurant')).toBe('restaurant');
    expect(normalizeIndustry('Fine Dining Cafe')).toBe('restaurant');
  });

  it('maps clinic keywords', () => {
    expect(normalizeIndustry('Multi-specialty Hospital')).toBe('clinic');
    expect(normalizeIndustry('Dental Clinic')).toBe('clinic');
  });

  it('maps real estate keywords', () => {
    expect(normalizeIndustry('Real Estate Builder')).toBe('real_estate');
    expect(normalizeIndustry('Housing Developer')).toBe('real_estate');
  });

  it('falls back to general for unknown industries', () => {
    expect(normalizeIndustry('Unknown Niche')).toBe('general');
    expect(normalizeIndustry(null)).toBe('general');
    expect(normalizeIndustry(undefined)).toBe('general');
    expect(normalizeIndustry('')).toBe('general');
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. MANUAL STATUS OVERRIDE
// ══════════════════════════════════════════════════════════════════

describe('Manual Status Override', () => {
  it('engine respects manual_status even if engine disagrees', () => {
    const r = calculateLeadScore(input({
      userMessage: 'just browsing',
      lead: {
        lead_score: 80,
        lead_status: 'hot',
        manual_status: 'hot', // team says hot
        buying_signals: [],
        negative_signals: [],
      },
    }));
    // Engine might say warm/cold based on "just_browsing" signal + no other signals
    // But manual override keeps it at 'hot'
    expect(r.lead_status).toBe('hot');
  });

  it('auto_status reflects engine recommendation even under manual override', () => {
    const r = calculateLeadScore(input({
      userMessage: 'just browsing',
      lead: {
        lead_score: 0,
        lead_status: 'warm',
        manual_status: 'warm',
        buying_signals: [],
        negative_signals: [],
      },
    }));
    // lead_status stays warm (manual), but auto_status engine recommends cold
    // Transition warm→cold IS allowed, so auto_status = cold
    expect(r.lead_status).toBe('warm');
    expect(r.auto_status).toBe('cold');
  });

  it('when no manual_status, lead_status follows auto_status', () => {
    const r = calculateLeadScore(input({
      userMessage: 'I want to book now',
      lead: {
        lead_score: 0,
        lead_status: 'cold',
        manual_status: null,
        buying_signals: [],
        negative_signals: [],
      },
    }));
    expect(r.lead_status).toBe(r.auto_status);
    expect(r.lead_status).not.toBe('cold');
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. STATUS TRANSITION VALIDATION
// ══════════════════════════════════════════════════════════════════

describe('Status Transition Validation', () => {
  it('converted lead cannot be auto-changed by scoring', () => {
    const r = calculateLeadScore(input({
      userMessage: 'just browsing',
      lead: { lead_score: 100, lead_status: 'converted', buying_signals: [], negative_signals: [] },
    }));
    expect(r.lead_status).toBe('converted');
    expect(r.auto_status).toBe('converted');
  });

  it('cold → warm transition is allowed', () => {
    const r = calculateLeadScore(input({
      userMessage: 'What are the available dates and price?',
      lead: { lead_score: 10, lead_status: 'cold', buying_signals: [], negative_signals: [] },
    }));
    expect(r.lead_score).toBeGreaterThanOrEqual(30);
    expect(['warm', 'hot', 'qualified']).toContain(r.auto_status);
  });

  it('qualified → converted only happens via booking event, not just scoring', () => {
    // The engine alone cannot move someone to converted without a booking signal.
    // (converted status comes from manual API or booking event, not keyword scoring)
    const r = calculateLeadScore(input({
      userMessage: 'reserve my seat',
      lead: { lead_score: 90, lead_status: 'qualified', buying_signals: ['intent_book'], negative_signals: [] },
    }));
    // Should stay qualified or become hot — never jump directly to converted via keywords
    expect(r.lead_status).not.toBe('converted');
  });

  it('lost lead can re-engage (scoring resumes)', () => {
    const r = calculateLeadScore(input({
      userMessage: 'Actually, I want to book now',
      lead: { lead_score: 0, lead_status: 'lost', manual_status: null, buying_signals: [], negative_signals: ['not_interested'] },
    }));
    expect(r.score_delta).toBeGreaterThan(0);
    expect(r.auto_status).not.toBe('lost');
  });
});

// ══════════════════════════════════════════════════════════════════
// 5. AI CONFIDENCE THRESHOLD
// ══════════════════════════════════════════════════════════════════

describe('AI Confidence Threshold', () => {
  it('ignores AI intent when confidence is below threshold', () => {
    const lowConf = AI_CONFIDENCE_THRESHOLD - 0.05;
    const r = calculateLeadScore(input({
      userMessage: 'book',
      aiResponse: { intent: 'reserve_table', extractedData: {}, confidence: lowConf },
    }));
    expect(r.ai_ignored).toBe(true);
    expect(r.ai_score_delta).toBe(0);
    // Only keyword score (if any) should contribute
    const rNoAI = calculateLeadScore(input({
      userMessage: 'book',
      aiResponse: { intent: 'unknown', extractedData: {}, confidence: lowConf },
    }));
    expect(r.lead_score).toBe(rNoAI.lead_score);
  });

  it('uses AI intent when confidence is at or above threshold', () => {
    const r = calculateLeadScore(input({
      userMessage: 'book',
      aiResponse: { intent: 'reserve_table', extractedData: {}, confidence: AI_CONFIDENCE_THRESHOLD },
    }));
    expect(r.ai_ignored).toBe(false);
    expect(r.ai_score_delta).toBeGreaterThan(0);
  });

  it('reports ai_confidence and ai_intent in result', () => {
    const r = calculateLeadScore(input({
      userMessage: 'hello',
      aiResponse: { intent: 'greeting', extractedData: {}, confidence: 0.97 },
      conversation: { message_count: 1, created_at: '' },
    }));
    expect(r.ai_confidence).toBe(0.97);
    expect(r.ai_intent).toBe('greeting');
  });
});

// ══════════════════════════════════════════════════════════════════
// 6. MULTI-LANGUAGE SUPPORT
// ══════════════════════════════════════════════════════════════════

describe('Multi-Language Support', () => {
  it('detects pricing in Hindi (kitna hai)', () => {
    const r = calculateLeadScore(input({ userMessage: 'kitna hai bhaiya?' }));
    expect(r.all_buying_signals).toContain('asked_pricing');
  });

  it('detects dates in Hindi (kab)', () => {
    const r = calculateLeadScore(input({ userMessage: 'kab available hai?' }));
    expect(r.all_buying_signals).toContain('asked_dates');
  });

  it('detects booking intent in Hinglish', () => {
    const r = calculateLeadScore(input({ userMessage: 'bhai book karna hai' }));
    expect(r.all_buying_signals).toContain('intent_book');
  });

  it('detects booking intent in Hinglish (join karna hai)', () => {
    const r = calculateLeadScore(input({ userMessage: 'join karna hai mujhe' }));
    expect(r.all_buying_signals).toContain('intent_book');
  });

  it('detects payment inquiry in Hinglish (payment kaise)', () => {
    const r = calculateLeadScore(input({ userMessage: 'payment kaise karu?' }));
    expect(r.all_buying_signals).toContain('asked_payment_method');
  });

  it('detects "not interested" in Hindi (nahi chahiye)', () => {
    const r = calculateLeadScore(input({ userMessage: 'nahi chahiye abhi' }));
    expect(r.all_negative_signals).toContain('not_interested');
    expect(r.lead_status).toBe('lost');
  });

  it('detects "just checking" in Hindi (sirf puch raha)', () => {
    const r = calculateLeadScore(input({ userMessage: 'bhai sirf puch raha tha' }));
    expect(r.all_negative_signals).toContain('just_browsing');
  });

  it('detects wrong number in Hindi (galat number)', () => {
    const r = calculateLeadScore(input({ userMessage: 'galat number hai' }));
    expect(r.lead_status).toBe('lost');
  });

  it('detects accommodation query in Hindi (kahan rukenge)', () => {
    const r = calculateLeadScore(input({ userMessage: 'hum kahan rukenge?' }));
    expect(r.all_buying_signals).toContain('asked_accommodation');
  });

  it('handles emoji-only message without crashing', () => {
    const r = calculateLeadScore(input({ userMessage: '👍🏼❤️🙏' }));
    expect(r.score_delta).toBe(0);
    expect(r.lead_score).toBe(0);
  });

  it('handles mixed emoji + text', () => {
    const r = calculateLeadScore(input({ userMessage: '🙌 I want to book now!' }));
    expect(r.all_buying_signals).toContain('intent_when_book');
  });
});

// ══════════════════════════════════════════════════════════════════
// 7. LEAD DECAY ENGINE
// ══════════════════════════════════════════════════════════════════

describe('Lead Decay Engine', () => {
  function daysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }

  it('returns 0 decay for activity within 3 days', () => {
    expect(calculateDecayPoints(daysAgo(1))).toBe(0);
    expect(calculateDecayPoints(daysAgo(2))).toBe(0);
  });

  it('returns -5 for 3+ day inactivity', () => {
    expect(calculateDecayPoints(daysAgo(3))).toBe(-5);
    expect(calculateDecayPoints(daysAgo(4))).toBe(-5);
  });

  it('returns -15 for 7+ day inactivity (3d + 7d thresholds)', () => {
    expect(calculateDecayPoints(daysAgo(7))).toBe(-15);  // -5 + -10
  });

  it('returns -35 for 14+ day inactivity (3d + 7d + 14d thresholds)', () => {
    expect(calculateDecayPoints(daysAgo(14))).toBe(-35); // -5 + -10 + -20
  });

  it('shouldForceCold is false under 30 days', () => {
    expect(shouldForceCold(daysAgo(29))).toBe(false);
  });

  it('shouldForceCold is true at 30+ days', () => {
    expect(shouldForceCold(daysAgo(30))).toBe(true);
    expect(shouldForceCold(daysAgo(60))).toBe(true);
  });

  it('returns 0 decay for null last_activity_at', () => {
    expect(calculateDecayPoints(null)).toBe(0);
    expect(shouldForceCold(null)).toBe(false);
  });

  it('decay has expected thresholds', () => {
    expect(DEFAULT_DECAY_THRESHOLDS).toHaveLength(3);
    expect(DEFAULT_DECAY_THRESHOLDS[0].days).toBe(3);
    expect(DEFAULT_DECAY_THRESHOLDS[1].days).toBe(7);
    expect(DEFAULT_DECAY_THRESHOLDS[2].days).toBe(14);
  });
});

// ══════════════════════════════════════════════════════════════════
// 8. IDEMPOTENCY / DUPLICATE SIGNAL PROTECTION
// ══════════════════════════════════════════════════════════════════

describe('Duplicate Signal / Idempotency Protection', () => {
  it('same intent from duplicate webhook does not double-score', () => {
    const first = calculateLeadScore(input({
      userMessage: 'What is the price?',
      aiResponse: { intent: 'pricing', extractedData: {}, confidence: 0.9 },
    }));
    const second = calculateLeadScore(input({
      userMessage: 'What is the price?',
      aiResponse: { intent: 'pricing', extractedData: {}, confidence: 0.9 },
      lead: { lead_score: first.lead_score, lead_status: first.lead_status, buying_signals: first.all_buying_signals, negative_signals: [] },
    }));
    // All signals already counted — delta must be 0
    expect(second.score_delta).toBe(0);
    expect(second.new_signals).toHaveLength(0);
  });

  it('rephrased buying intent does not inflate score beyond first occurrence', () => {
    const msgs = [
      'I want to book',
      'I would like to book',
      'Book karna hai',
      'Can I book?',
      'Please book me in',
    ];
    let score = 0;
    let status: string = 'new';
    let buyingSignals: string[] = [];
    let negativeSignals: string[] = [];

    for (const msg of msgs) {
      const r = calculateLeadScore(input({
        userMessage: msg,
        lead: { lead_score: score, lead_status: status as any, buying_signals: buyingSignals, negative_signals: negativeSignals },
        conversation: { message_count: msgs.indexOf(msg) + 1, created_at: '' },
      }));
      score = r.lead_score;
      status = r.lead_status;
      buyingSignals = r.all_buying_signals;
      negativeSignals = r.all_negative_signals;
    }

    // intent_book should appear only once in the deduplicated list
    expect(buyingSignals.filter(s => s === 'intent_book').length).toBe(1);
  });

  it('AI intent:reserve_table counted only once across messages', () => {
    const first = calculateLeadScore(input({
      userMessage: 'table please',
      aiResponse: { intent: 'reserve_table', extractedData: {}, confidence: 0.9 },
    }));
    const second = calculateLeadScore(input({
      userMessage: 'table please again',
      aiResponse: { intent: 'reserve_table', extractedData: {}, confidence: 0.9 },
      lead: { lead_score: first.lead_score, lead_status: first.lead_status, buying_signals: first.all_buying_signals, negative_signals: [] },
    }));
    expect(second.all_buying_signals.filter(s => s === 'ai_intent:reserve_table').length).toBe(1);
    expect(second.ai_score_delta).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// 9. SCORE EXPLAINABILITY
// ══════════════════════════════════════════════════════════════════

describe('Score Explainability', () => {
  it('separates rule_score_delta and ai_score_delta', () => {
    const r = calculateLeadScore(input({
      userMessage: 'dates and price?',
      aiResponse: { intent: 'pricing', extractedData: {}, confidence: 0.9 },
    }));
    // Keyword: asked_pricing (+15) + asked_dates (+15) = rule 30
    // AI: ai_intent:pricing (+8) = ai 8
    expect(r.rule_score_delta).toBe(30);
    expect(r.ai_score_delta).toBe(8);
    expect(r.score_delta).toBe(38);
  });

  it('score_breakdown contains category for each signal', () => {
    const r = calculateLeadScore(input({ userMessage: 'I want to book, what are the dates?' }));
    for (const entry of Object.values(r.score_breakdown)) {
      expect(['interest', 'intent', 'data', 'engagement', 'negative', 'industry']).toContain(entry.category);
    }
  });

  it('status_changed is true when status transitions', () => {
    const r = calculateLeadScore(input({
      userMessage: 'I want to book and pay now',
      lead: { lead_score: 0, lead_status: 'cold', buying_signals: [], negative_signals: [] },
    }));
    expect(r.status_changed).toBe(true);
    expect(r.prev_status).toBe('cold');
  });

  it('status_changed is false when status stays same', () => {
    const r = calculateLeadScore(input({
      userMessage: 'ok',
      lead: { lead_score: 80, lead_status: 'hot', buying_signals: ['intent_book', 'asked_pricing', 'messages_5', 'messages_10', 'ai_intent:reserve_table'], negative_signals: [] },
      conversation: { message_count: 12, created_at: '' },
    }));
    expect(r.status_changed).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
// 10. EDGE CASES & ROBUSTNESS
// ══════════════════════════════════════════════════════════════════

describe('Edge Cases', () => {
  it('handles voice transcript (all lowercase, no punctuation)', () => {
    const r = calculateLeadScore(input({ userMessage: 'want to book zanskar trek dates in july price?' }));
    expect(r.all_buying_signals).toContain('intent_book');
    expect(r.all_buying_signals).toContain('asked_dates');
    expect(r.all_buying_signals).toContain('asked_pricing');
    expect(r.lead_score).toBeGreaterThanOrEqual(70);
  });

  it('handles ALL CAPS message', () => {
    const r = calculateLeadScore(input({ userMessage: 'WHAT IS THE PRICE FOR THIS TREK' }));
    expect(r.all_buying_signals).toContain('asked_pricing');
  });

  it('handles very long message without crashing', () => {
    const longMsg = 'I am interested in booking your Zanskar expedition for July. '.repeat(50);
    const r = calculateLeadScore(input({ userMessage: longMsg }));
    expect(r.lead_score).toBeGreaterThan(0);
  });

  it('handles message with only numbers', () => {
    const r = calculateLeadScore(input({ userMessage: '9876543210' }));
    expect(r.score_delta).toBe(0);
  });

  it('handles single character message', () => {
    const r = calculateLeadScore(input({ userMessage: 'k' }));
    expect(r.score_delta).toBe(0);
    expect(r.lead_score).toBe(0);
  });

  it('score never exceeds 100 with massive signal stack', () => {
    const r = calculateLeadScore(input({
      userMessage: 'I want to book, send payment link, confirm my booking, reserve my seat, when can I book',
      aiResponse: { intent: 'confirm', extractedData: { email: 'x@y.com', phone: '123', name: 'Raj', date: 'July', guestCount: '4', requestPayment: 'true' }, confidence: 0.99 },
      conversation: { message_count: 20, created_at: '' },
      lead: { lead_score: 95, lead_status: 'qualified', buying_signals: [], negative_signals: [] },
    }));
    expect(r.lead_score).toBeLessThanOrEqual(100);
  });

  it('score never drops below 0 with multiple negative signals', () => {
    const r = calculateLeadScore(input({
      userMessage: 'not interested, wrong number, just browsing',
      lead: { lead_score: 0, lead_status: 'cold', buying_signals: [], negative_signals: [] },
    }));
    expect(r.lead_score).toBeGreaterThanOrEqual(0);
  });

  it('deleted/empty message (null) does not crash or score', () => {
    const r = calculateLeadScore(input({ userMessage: null as any }));
    expect(r.score_delta).toBe(0);
    expect(r.lead_score).toBe(0);
  });

  it('message with only whitespace/newlines does not score', () => {
    const r = calculateLeadScore(input({ userMessage: '   \n\n   \t  ' }));
    expect(r.score_delta).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// 11. CONCURRENCY SAFETY (UNIT-LEVEL)
// ══════════════════════════════════════════════════════════════════

describe('Concurrency Safety (unit-level)', () => {
  it('is a pure function — same input always produces same output', () => {
    const args = input({ userMessage: 'I want to book', lead: { lead_score: 30, lead_status: 'warm', buying_signals: ['asked_pricing'], negative_signals: [] } });
    const r1 = calculateLeadScore(args);
    const r2 = calculateLeadScore(args);
    expect(r1.lead_score).toBe(r2.lead_score);
    expect(r1.lead_status).toBe(r2.lead_status);
    expect(r1.score_delta).toBe(r2.score_delta);
  });

  it('parallel calls with different starting states return independent results', () => {
    const [r1, r2] = [
      calculateLeadScore(input({ userMessage: 'I want to book', lead: { lead_score: 0, lead_status: 'cold', buying_signals: [], negative_signals: [] } })),
      calculateLeadScore(input({ userMessage: 'just browsing', lead: { lead_score: 80, lead_status: 'hot', buying_signals: ['intent_book'], negative_signals: [] } })),
    ];
    expect(r1.lead_status).not.toBe('cold'); // got points
    expect(r2.all_negative_signals).toContain('just_browsing'); // got penalty
  });
});

// ══════════════════════════════════════════════════════════════════
// 12. SCORE THRESHOLD CONSTANTS
// ══════════════════════════════════════════════════════════════════

describe('Score Threshold Constants', () => {
  it('thresholds are in increasing order', () => {
    expect(SCORE_THRESHOLDS.COLD).toBeLessThan(SCORE_THRESHOLDS.WARM);
    expect(SCORE_THRESHOLDS.WARM).toBeLessThan(SCORE_THRESHOLDS.HOT);
    expect(SCORE_THRESHOLDS.HOT).toBeLessThan(SCORE_THRESHOLDS.QUALIFIED);
  });

  it('AI_CONFIDENCE_THRESHOLD is between 0 and 1', () => {
    expect(AI_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(AI_CONFIDENCE_THRESHOLD).toBeLessThan(1);
  });
});
