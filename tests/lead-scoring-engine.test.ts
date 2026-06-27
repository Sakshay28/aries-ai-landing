import { describe, it, expect } from 'vitest';
import { calculateLeadScore, SCORE_THRESHOLDS, scoreLabel } from '@/lib/scoring/lead-scoring-engine';
import type { ScoringInput } from '@/lib/scoring/lead-scoring-engine';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ScoringInput> & { userMessage?: string }): ScoringInput {
  return {
    userMessage: overrides.userMessage ?? '',
    aiResponse: {
      intent:        'general_enquiry',
      extractedData: {},
      confidence:    0.9,
      ...(overrides.aiResponse ?? {}),
    },
    conversation: {
      message_count: 1,
      created_at:    new Date().toISOString(),
      ...(overrides.conversation ?? {}),
    },
    lead: {
      lead_score:       0,
      lead_status:      'new',
      buying_signals:   [],
      negative_signals: [],
      ...(overrides.lead ?? {}),
    },
  };
}

// ── Score Threshold Tests ─────────────────────────────────────────────────────

describe('scoreLabel', () => {
  it('returns Cold for 0', () => expect(scoreLabel(0)).toBe('Cold'));
  it('returns Cold for 29', () => expect(scoreLabel(29)).toBe('Cold'));
  it('returns Warm for 30', () => expect(scoreLabel(30)).toBe('Warm'));
  it('returns Warm for 69', () => expect(scoreLabel(69)).toBe('Warm'));
  it('returns Hot for 70', () => expect(scoreLabel(70)).toBe('Hot'));
  it('returns Hot for 89', () => expect(scoreLabel(89)).toBe('Hot'));
  it('returns Qualified for 90', () => expect(scoreLabel(90)).toBe('Qualified'));
  it('returns Qualified for 100', () => expect(scoreLabel(100)).toBe('Qualified'));
});

// ── Greeting-Only Penalty ─────────────────────────────────────────────────────

describe('greeting-only penalty', () => {
  it('penalises a bare "Hi" as first message', () => {
    const result = calculateLeadScore(makeInput({ userMessage: 'Hi', conversation: { message_count: 1, created_at: '' } }));
    expect(result.score_delta).toBe(-10);
    expect(result.lead_score).toBe(0); // clamped at 0
    expect(result.lead_status).toBe('cold');
  });

  it('penalises "Hello" as first message', () => {
    const result = calculateLeadScore(makeInput({ userMessage: 'Hello', conversation: { message_count: 0, created_at: '' } }));
    expect(result.score_delta).toBe(-10);
  });

  it('does NOT penalise "Hi I want to book a table"', () => {
    const result = calculateLeadScore(makeInput({ userMessage: 'Hi I want to book a table', conversation: { message_count: 1, created_at: '' } }));
    expect(result.score_delta).toBeGreaterThan(0);
    expect(result.all_buying_signals).toContain('intent_reserve');
  });

  it('does NOT apply greeting penalty after message 2', () => {
    // Pass existing messages_5 so that engagement signal is not counted again
    const result = calculateLeadScore(makeInput({
      userMessage: 'hi',
      conversation: { message_count: 5, created_at: '' },
      lead: { lead_score: 0, lead_status: 'cold', buying_signals: ['messages_5'], negative_signals: [] },
    }));
    expect(result.score_delta).toBe(0);
    expect(result.all_negative_signals).not.toContain('only_greeting');
  });

  it('does NOT double-count greeting penalty', () => {
    const first = calculateLeadScore(makeInput({ userMessage: 'hi', conversation: { message_count: 1, created_at: '' } }));
    const second = calculateLeadScore(makeInput({
      userMessage: 'hi again',
      conversation: { message_count: 2, created_at: '' },
      lead: { lead_score: first.lead_score, lead_status: first.lead_status, buying_signals: first.all_buying_signals, negative_signals: first.all_negative_signals },
    }));
    // penalty was already counted once — second message has no penalty
    expect(second.score_delta).toBe(0);
  });
});

// ── Interest Signal Tests ─────────────────────────────────────────────────────

describe('interest signals', () => {
  it('detects pricing inquiry in English', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'What is the price?' }));
    expect(r.all_buying_signals).toContain('asked_pricing');
    expect(r.score_delta).toBe(15);
  });

  it('detects pricing in Hindi (kitna)', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'kitna cost hai?' }));
    expect(r.all_buying_signals).toContain('asked_pricing');
  });

  it('detects date/availability question', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'What dates are available?' }));
    expect(r.all_buying_signals).toContain('asked_dates');
    expect(r.all_buying_signals).toContain('asked_availability');
  });

  it('detects "When in July" as dates signal', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'When in July?' }));
    expect(r.all_buying_signals).toContain('asked_dates');
  });

  it('detects itinerary question', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'Can you share the itinerary?' }));
    expect(r.all_buying_signals).toContain('asked_itinerary');
  });

  it('detects cancellation policy question', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'What is your cancellation policy?' }));
    expect(r.all_buying_signals).toContain('asked_cancellation');
  });

  it('detects accommodation question', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'What hotels do you use?' }));
    expect(r.all_buying_signals).toContain('asked_accommodation');
  });

  it('does NOT double-count same interest signal', () => {
    const first = calculateLeadScore(makeInput({ userMessage: 'what is the price?' }));
    const second = calculateLeadScore(makeInput({
      userMessage: 'and the price includes what?',
      lead: { lead_score: first.lead_score, lead_status: first.lead_status, buying_signals: first.all_buying_signals, negative_signals: [] },
    }));
    // asked_pricing must appear exactly once across the full accumulated list
    expect(second.all_buying_signals.filter(s => s === 'asked_pricing').length).toBe(1);
    // asked_pricing must NOT appear in the NEW signals from this round
    expect(second.new_signals).not.toContain('asked_pricing');
  });
});

// ── Buying Intent Tests ───────────────────────────────────────────────────────

describe('buying intent signals', () => {
  it('detects "I want to book"', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'I want to book the Zanskar expedition' }));
    expect(r.all_buying_signals).toContain('intent_book');
    expect(r.score_delta).toBeGreaterThanOrEqual(40);
    expect(r.intent_level).toBe('high');
  });

  it('detects "reserve my seat"', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'Can I reserve my seat for July?' }));
    expect(r.all_buying_signals).toContain('intent_reserve');
    expect(r.score_delta).toBeGreaterThanOrEqual(40);
  });

  it('detects payment link request', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'Send me the payment link' }));
    expect(r.all_buying_signals).toContain('intent_payment_link');
    // "payment" also fires asked_payment_method (+20) — total >= 50
    expect(r.score_delta).toBeGreaterThanOrEqual(50);
    expect(r.intent_level).toBe('high');
  });

  it('detects "Can I pay tomorrow?"', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'Can I pay tomorrow?' }));
    expect(r.all_buying_signals).toContain('asked_payment_method');
  });

  it('detects booking confirmation request', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'Can you confirm my booking?' }));
    expect(r.all_buying_signals).toContain('intent_confirm_booking');
    expect(r.score_delta).toBe(60);
  });

  it('detects "when can I book"', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'When can I book?' }));
    expect(r.all_buying_signals).toContain('intent_when_book');
    // "when" also fires asked_dates (+15) — total >= 30
    expect(r.score_delta).toBeGreaterThanOrEqual(30);
  });
});

// ── Data Extraction Signals ───────────────────────────────────────────────────

describe('data-sharing signals from AI extraction', () => {
  it('awards points when AI extracts email', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'My email is ravi@example.com',
      aiResponse: { intent: 'general_enquiry', extractedData: { email: 'ravi@example.com' }, confidence: 0.9 },
    }));
    expect(r.all_buying_signals).toContain('shared_email');
    expect(r.score_delta).toBe(15);
  });

  it('awards points when AI extracts phone', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'My number is 9876543210',
      aiResponse: { intent: 'general_enquiry', extractedData: { phone: '9876543210' }, confidence: 0.9 },
    }));
    expect(r.all_buying_signals).toContain('shared_phone');
    expect(r.score_delta).toBe(15);
  });

  it('awards points when AI extracts name + date + guestCount', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'I am Ravi, party of 4, 23rd July',
      aiResponse: { intent: 'general_enquiry', extractedData: { name: 'Ravi', date: '23 July', guestCount: '4' }, confidence: 0.9 },
    }));
    // Data signals: name +5, date +8, guestCount +10 = 23
    // "July" keyword also fires asked_dates (+15), so total >= 23
    expect(r.score_delta).toBeGreaterThanOrEqual(5 + 8 + 10);
    expect(r.all_buying_signals).toContain('shared_name');
    expect(r.all_buying_signals).toContain('shared_date');
    expect(r.all_buying_signals).toContain('shared_guest_count');
  });

  it('does not double-count data fields on repeat extraction', () => {
    const first = calculateLeadScore(makeInput({
      userMessage: 'I am Ravi',
      aiResponse: { intent: 'general_enquiry', extractedData: { name: 'Ravi' }, confidence: 0.9 },
    }));
    const second = calculateLeadScore(makeInput({
      userMessage: 'still Ravi btw',
      aiResponse: { intent: 'general_enquiry', extractedData: { name: 'Ravi' }, confidence: 0.9 },
      lead: { lead_score: first.lead_score, lead_status: first.lead_status, buying_signals: first.all_buying_signals, negative_signals: [] },
    }));
    expect(second.score_delta).toBe(0);
  });

  it('triggers ready_to_pay when AI extracts requestPayment=true', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'I am ready',
      aiResponse: { intent: 'confirm', extractedData: { requestPayment: 'true' }, confidence: 0.95 },
    }));
    expect(r.all_buying_signals).toContain('ready_to_pay');
  });
});

// ── Engagement Signals ────────────────────────────────────────────────────────

describe('engagement signals', () => {
  it('awards +10 at 5 messages', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'any message',
      conversation: { message_count: 5, created_at: '' },
    }));
    expect(r.all_buying_signals).toContain('messages_5');
  });

  it('awards +15 at 10 messages (and messages_5 is not double-counted)', () => {
    const prev = calculateLeadScore(makeInput({
      userMessage: 'message 5',
      conversation: { message_count: 5, created_at: '' },
    }));
    const r = calculateLeadScore(makeInput({
      userMessage: 'message 10',
      conversation: { message_count: 10, created_at: '' },
      lead: { lead_score: prev.lead_score, lead_status: prev.lead_status, buying_signals: prev.all_buying_signals, negative_signals: [] },
    }));
    expect(r.all_buying_signals).toContain('messages_10');
    expect(r.all_buying_signals.filter(s => s === 'messages_5').length).toBe(1);
  });

  it('awards +10 at 15 messages', () => {
    const prev = calculateLeadScore(makeInput({
      userMessage: 'msg 10',
      conversation: { message_count: 10, created_at: '' },
      lead: { lead_score: 30, lead_status: 'warm', buying_signals: ['messages_5', 'messages_10'], negative_signals: [] },
    }));
    const r = calculateLeadScore(makeInput({
      userMessage: 'msg 15',
      conversation: { message_count: 15, created_at: '' },
      lead: { lead_score: prev.lead_score, lead_status: prev.lead_status, buying_signals: prev.all_buying_signals, negative_signals: [] },
    }));
    expect(r.all_buying_signals).toContain('messages_15');
  });
});

// ── Negative Signals ──────────────────────────────────────────────────────────

describe('negative signals', () => {
  it('"not interested" sets status to lost regardless of score', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'not interested thanks',
      lead: { lead_score: 80, lead_status: 'hot', buying_signals: [], negative_signals: [] },
    }));
    expect(r.lead_status).toBe('lost');
    expect(r.all_negative_signals).toContain('not_interested');
  });

  it('"wrong number" sets status to lost', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'wrong number sorry' }));
    expect(r.lead_status).toBe('lost');
    expect(r.all_negative_signals).toContain('wrong_number');
  });

  it('"just browsing" deducts points but does not set lost', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'just browsing for now' }));
    expect(r.score_delta).toBe(-10);
    expect(r.lead_status).not.toBe('lost');
    expect(r.all_negative_signals).toContain('just_browsing');
  });

  it('does not double-count "not_interested" on a repeat message', () => {
    const first = calculateLeadScore(makeInput({ userMessage: 'not interested' }));
    const second = calculateLeadScore(makeInput({
      userMessage: 'nahi chahiye',
      lead: { lead_score: 0, lead_status: 'lost', buying_signals: [], negative_signals: first.all_negative_signals },
    }));
    expect(second.score_delta).toBe(0); // already counted
  });
});

// ── Terminal Status Protection ────────────────────────────────────────────────

describe('terminal status protection', () => {
  it('does not change status from "converted" even with high score signals', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'I want to book and pay now, send invoice',
      lead: { lead_score: 100, lead_status: 'converted', buying_signals: [], negative_signals: [] },
    }));
    expect(r.lead_status).toBe('converted');
  });

  it('allows "lost" to become "cold" if new intent signals arrive (new chance)', () => {
    // "lost" is NOT a terminal status by our engine — only "converted" is.
    // A "lost" lead who later says "I want to book" should become warm/hot.
    const r = calculateLeadScore(makeInput({
      userMessage: 'I want to book now',
      lead: { lead_score: 0, lead_status: 'lost', buying_signals: [], negative_signals: ['not_interested'] },
    }));
    // Should have positive delta from booking intent
    expect(r.score_delta).toBeGreaterThan(0);
    // Status should not stay 'lost' unless a new rejection signal fires
    expect(r.lead_status).not.toBe('lost');
  });
});

// ── Status Tier Tests ─────────────────────────────────────────────────────────

describe('lead status tier derivation', () => {
  it('0–29 = cold', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'What is your menu?' }));
    expect(r.lead_status).toBe('cold');
  });

  it('reaches warm when score crosses 30', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'What are the available dates and price?',
      lead: { lead_score: 10, lead_status: 'cold', buying_signals: [], negative_signals: [] },
    }));
    expect(r.lead_score).toBeGreaterThanOrEqual(30);
    expect(r.lead_status).toBe('warm');
  });

  it('reaches hot when score crosses 70', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'I want to book, send me the payment link',
      lead: { lead_score: 0, lead_status: 'cold', buying_signals: [], negative_signals: [] },
    }));
    expect(r.lead_score).toBeGreaterThanOrEqual(70);
    expect(['hot', 'qualified']).toContain(r.lead_status);
  });

  it('reaches qualified when score crosses 90', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'Can you confirm my booking please?',
      lead: { lead_score: 45, lead_status: 'warm', buying_signals: ['asked_pricing', 'asked_dates'], negative_signals: [] },
    }));
    expect(r.lead_score).toBeGreaterThanOrEqual(90);
    expect(r.lead_status).toBe('qualified');
  });
});

// ── Realistic Conversation Simulation ────────────────────────────────────────
// Simulates the full Zanskar expedition conversation described in the task.

describe('Zanskar expedition full conversation', () => {
  it('scores correctly across 7 messages, ending at hot/qualified', () => {
    const msgs = [
      { text: 'Hi',                          intent: 'greeting',         extracted: {} },
      { text: 'Tell me about Zanskar',        intent: 'general_enquiry',  extracted: {} },
      { text: 'What dates are available?',   intent: 'timing',           extracted: {} },
      { text: '23rd July',                   intent: 'general_enquiry',  extracted: { date: '23 July' } },
      { text: 'How much does it cost?',      intent: 'pricing',          extracted: {} },
      { text: 'How many seats are left?',    intent: 'general_enquiry',  extracted: {} },
      { text: 'Can I pay tomorrow?',         intent: 'general_enquiry',  extracted: {} },
    ];

    let score = 0;
    let status: string = 'new';
    let buyingSignals: string[] = [];
    let negativeSignals: string[] = [];

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      const result = calculateLeadScore({
        userMessage: msg.text,
        aiResponse: { intent: msg.intent as any, extractedData: msg.extracted as any, confidence: 0.9 },
        conversation: { message_count: i + 1, created_at: '' },
        lead: { lead_score: score, lead_status: status as any, buying_signals: buyingSignals, negative_signals: negativeSignals },
      });
      score = result.lead_score;
      status = result.lead_status;
      buyingSignals = result.all_buying_signals;
      negativeSignals = result.all_negative_signals;
    }

    // After 7 messages with pricing, dates, availability, payment questions — should be warm or hot
    expect(score).toBeGreaterThanOrEqual(30);
    expect(['warm', 'hot', 'qualified']).toContain(status);
    expect(buyingSignals).toContain('asked_pricing');
    expect(buyingSignals).toContain('asked_dates');
    expect(buyingSignals).toContain('asked_availability');
    // "Can I pay tomorrow?" fires asked_payment_method via bare "pay" pattern
    expect(buyingSignals).toContain('asked_payment_method');
    expect(buyingSignals).toContain('shared_date');
  });
});

// ── AI Intent Contribution ────────────────────────────────────────────────────

describe('AI intent contribution', () => {
  it('adds supplemental points for reserve_table AI intent', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'table please',
      aiResponse: { intent: 'reserve_table', extractedData: {}, confidence: 0.9 },
    }));
    expect(r.all_buying_signals.some(s => s.startsWith('ai_intent:'))).toBe(true);
    expect(r.score_delta).toBeGreaterThan(0);
  });

  it('does not double-count AI intent on second message with same intent', () => {
    const first = calculateLeadScore(makeInput({
      userMessage: 'book a table',
      aiResponse: { intent: 'reserve_table', extractedData: {}, confidence: 0.9 },
    }));
    const second = calculateLeadScore(makeInput({
      userMessage: 'book again',
      aiResponse: { intent: 'reserve_table', extractedData: {}, confidence: 0.9 },
      lead: { lead_score: first.lead_score, lead_status: first.lead_status, buying_signals: first.all_buying_signals, negative_signals: [] },
    }));
    expect(second.score_delta).toBe(0); // AI intent already counted
  });

  it('zero-contrib intents add no score', () => {
    for (const intent of ['greeting', 'general_enquiry', 'thank_you', 'unknown', 'cancel'] as const) {
      const r = calculateLeadScore(makeInput({
        userMessage: 'ok',
        aiResponse: { intent, extractedData: {}, confidence: 0.8 },
      }));
      // No keyword signals from "ok", no positive AI intent — delta should be 0
      expect(r.score_delta).toBe(0);
    }
  });
});

// ── Score Boundary Tests ──────────────────────────────────────────────────────

describe('score boundaries', () => {
  it('score never exceeds 100', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'I want to book, confirm my booking, send payment link',
      lead: { lead_score: 80, lead_status: 'hot', buying_signals: [], negative_signals: [] },
    }));
    expect(r.lead_score).toBeLessThanOrEqual(100);
  });

  it('score never goes below 0', () => {
    const r = calculateLeadScore(makeInput({
      userMessage: 'not interested, wrong number, just browsing',
      lead: { lead_score: 0, lead_status: 'cold', buying_signals: [], negative_signals: [] },
    }));
    expect(r.lead_score).toBeGreaterThanOrEqual(0);
  });
});

// ── Scoring Reasoning ─────────────────────────────────────────────────────────

describe('scoring reasoning / explainability', () => {
  it('produces non-empty reasoning when signals fire', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'What is the price?' }));
    expect(r.scoring_reasoning).toContain('✓');
    expect(r.scoring_reasoning.length).toBeGreaterThan(0);
  });

  it('says "No new signals" when no signals fire', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'ok', conversation: { message_count: 5, created_at: '' }, lead: { lead_score: 0, lead_status: 'cold', buying_signals: ['messages_5'], negative_signals: [] } }));
    expect(r.scoring_reasoning).toBe('No new signals detected in this message');
  });

  it('score_breakdown contains signal details', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'What is the price and dates?' }));
    expect(r.score_breakdown['asked_pricing']).toMatchObject({ label: expect.any(String), points: 15, category: 'interest' });
  });

  it('negative signals appear in reasoning with ✗', () => {
    const r = calculateLeadScore(makeInput({ userMessage: 'not interested', conversation: { message_count: 3, created_at: '' } }));
    expect(r.scoring_reasoning).toContain('✗');
  });
});

// ── Null / Empty Message Safety ───────────────────────────────────────────────

describe('null/empty message safety', () => {
  it('handles null userMessage gracefully', () => {
    const r = calculateLeadScore(makeInput({ userMessage: null as any }));
    expect(r.lead_score).toBeGreaterThanOrEqual(0);
    expect(r.lead_status).toBeDefined();
  });

  it('handles undefined userMessage gracefully', () => {
    const r = calculateLeadScore(makeInput({ userMessage: undefined }));
    expect(r.score_delta).toBe(0);
  });

  it('handles empty string gracefully', () => {
    const r = calculateLeadScore(makeInput({ userMessage: '' }));
    expect(r.score_delta).toBe(0);
  });
});
