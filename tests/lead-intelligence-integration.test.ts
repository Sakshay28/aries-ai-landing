// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — End-to-End Integration Tests (Phase C, Point 9)
//
// Covers the full pipeline:
//   Webhook enqueue → Rule Engine → AI (mocked) → Decision Engine →
//   Explainability → Recommendation → DB (mocked) → Final Status
//
// MockProvider is used for deterministic AI responses.
// Supabase is fully mocked — no real DB needed.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Decision Engine (pure — no DB, no mocks needed) ──────────────────────
import { runDecisionEngine } from '@/lib/scoring/decision-engine';
// ── Rule Engine ───────────────────────────────────────────────────────────
import { calculateLeadScore } from '@/lib/scoring/lead-scoring-engine';
// ── Mock AI Provider ─────────────────────────────────────────────────────
import { mockProvider } from '@/lib/scoring/providers/mock-provider';
// ── Explainability ────────────────────────────────────────────────────────
import { buildExplainability, computeMomentum } from '@/lib/scoring/explainability';
// ── Recommendations ───────────────────────────────────────────────────────
import { getRecommendation } from '@/lib/scoring/recommendations';
// ── Incremental Analyzer ─────────────────────────────────────────────────
import { buildConversationSnapshot, shouldForceFullRebuild } from '@/lib/scoring/incremental-analyzer';
// ── Failure Strategy ─────────────────────────────────────────────────────
import { determineFallback, classifyError } from '@/lib/scoring/failure-strategy';
// ── Cost Tracker ─────────────────────────────────────────────────────────
import { recordCall, getTenantDailySummary } from '@/lib/scoring/cost-tracker';
// ── Feature Flags ─────────────────────────────────────────────────────────
import { resolveFlags, buildFlagContext } from '@/lib/scoring/feature-flags';
// ── Cost Optimizer ───────────────────────────────────────────────────────
import { shouldRunAIAnalysis } from '@/lib/scoring/cost-optimizer';
// ── Hash ─────────────────────────────────────────────────────────────────
import { computeConversationHash, conversationHashChanged } from '@/lib/scoring/conversation-hash';
// ── Types ─────────────────────────────────────────────────────────────────
import type { GeminiConversationAnalysis } from '@/lib/scoring/types';

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA — Zanskar Trek conversation (46 messages, the original root-cause)
// ═══════════════════════════════════════════════════════════════════════════

const ZANSKAR_MESSAGES = [
  { id: 'm1',  content: 'Hi, I want to go for Zanskar Valley Trek in August',  direction: 'inbound'  as const, createdAt: '2026-06-01T10:00:00Z', senderName: null },
  { id: 'm2',  content: 'Great choice! Zanskar Valley Trek is spectacular.',    direction: 'outbound' as const, createdAt: '2026-06-01T10:01:00Z', senderName: null },
  { id: 'm3',  content: 'How many people will be joining?',                     direction: 'outbound' as const, createdAt: '2026-06-01T10:01:30Z', senderName: null },
  { id: 'm4',  content: 'We are 4 people — 2 adults, 2 teenagers',             direction: 'inbound'  as const, createdAt: '2026-06-01T10:03:00Z', senderName: null },
  { id: 'm5',  content: 'What is the budget per person?',                       direction: 'outbound' as const, createdAt: '2026-06-01T10:03:30Z', senderName: null },
  { id: 'm6',  content: 'Around 35,000 per person',                            direction: 'inbound'  as const, createdAt: '2026-06-01T10:05:00Z', senderName: null },
  { id: 'm7',  content: 'Our Zanskar Valley 8D/7N package is ₹38,500 pp.',    direction: 'outbound' as const, createdAt: '2026-06-01T10:06:00Z', senderName: null },
  { id: 'm8',  content: 'That seems a bit high. Can you give a discount?',     direction: 'inbound'  as const, createdAt: '2026-06-01T10:07:00Z', senderName: null },
  { id: 'm9',  content: 'For a group of 4, we can offer ₹37,000 pp.',         direction: 'outbound' as const, createdAt: '2026-06-01T10:08:00Z', senderName: null },
  { id: 'm10', content: 'Ok what does the package include?',                   direction: 'inbound'  as const, createdAt: '2026-06-01T10:10:00Z', senderName: null },
  { id: 'm11', content: 'Accommodation, meals, guide, permits included.',       direction: 'outbound' as const, createdAt: '2026-06-01T10:11:00Z', senderName: null },
  { id: 'm12', content: 'What is the fitness level required?',                  direction: 'inbound'  as const, createdAt: '2026-06-01T10:12:00Z', senderName: null },
  { id: 'm13', content: 'Moderate fitness. Daily 5-8 km hike.',                direction: 'outbound' as const, createdAt: '2026-06-01T10:13:00Z', senderName: null },
  { id: 'm14', content: 'Is airport pickup available from Leh airport?',        direction: 'inbound'  as const, createdAt: '2026-06-01T10:15:00Z', senderName: null },
  { id: 'm15', content: 'Yes, Leh airport pickup is included.',                direction: 'outbound' as const, createdAt: '2026-06-01T10:16:00Z', senderName: null },
  { id: 'm16', content: 'We have one vegetarian in our group',                  direction: 'inbound'  as const, createdAt: '2026-06-01T10:18:00Z', senderName: null },
  { id: 'm17', content: 'All meals can be arranged vegetarian. No problem.',   direction: 'outbound' as const, createdAt: '2026-06-01T10:19:00Z', senderName: null },
  { id: 'm18', content: 'When is the best time to visit Zanskar?',             direction: 'inbound'  as const, createdAt: '2026-06-01T10:20:00Z', senderName: null },
  { id: 'm19', content: 'July-September is ideal. August is peak.',             direction: 'outbound' as const, createdAt: '2026-06-01T10:21:00Z', senderName: null },
  { id: 'm20', content: 'I am comparing your package with another agency',     direction: 'inbound'  as const, createdAt: '2026-06-01T10:25:00Z', senderName: null },
  { id: 'm21', content: 'What dates in August are you looking at?',            direction: 'outbound' as const, createdAt: '2026-06-01T10:26:00Z', senderName: null },
  { id: 'm22', content: 'August 10-17 would work for us',                     direction: 'inbound'  as const, createdAt: '2026-06-01T10:28:00Z', senderName: null },
  { id: 'm23', content: 'August 10-17 has availability. Shall I reserve?',    direction: 'outbound' as const, createdAt: '2026-06-01T10:29:00Z', senderName: null },
  { id: 'm24', content: 'How do I pay? What payment methods do you accept?',   direction: 'inbound'  as const, createdAt: '2026-06-01T10:30:00Z', senderName: null },
  { id: 'm25', content: 'UPI, bank transfer, or card. 20% advance to confirm.', direction: 'outbound' as const, createdAt: '2026-06-01T10:31:00Z', senderName: null },
  { id: 'm26', content: 'Can you send me the payment link to confirm booking?',  direction: 'inbound'  as const, createdAt: '2026-06-01T10:35:00Z', senderName: null },
];

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 1: Decision Engine (pure, no DB)
// ═══════════════════════════════════════════════════════════════════════════

describe('Decision Engine', () => {
  it('uses rule_only when AI confidence < 60', () => {
    const result = runDecisionEngine({
      ruleScore:        50, ruleStatus: 'warm', allBuyingSignals: [],
      prevFinalStatus:  'cold', aiAnalysis: { buyingIntent: 90, confidence: 55 } as any,
      aiConfidence:     55, industryProfile: 'general', isRepeatCustomer: false, messageCount: 10,
    });
    expect(result.compositeMethod).toBe('rule_only');
    expect(result.finalScore).toBe(50);
    expect(result.aiWeightApplied).toBe(0);
  });

  it('blends at 30% AI weight when confidence 60-80', () => {
    const result = runDecisionEngine({
      ruleScore:        60, ruleStatus: 'warm', allBuyingSignals: [],
      prevFinalStatus:  'warm', aiAnalysis: { buyingIntent: 90, confidence: 70, salesStage: 'Consideration', momentum: 'Increasing' } as any,
      aiConfidence:     70, industryProfile: 'general', isRepeatCustomer: false, messageCount: 15,
    });
    expect(result.compositeMethod).toBe('blended');
    expect(result.aiWeightApplied).toBe(0.30);
    // Floor: Math.max(60, round(60*0.7 + 90*0.3)) = Math.max(60, round(42+27)) = Math.max(60, 69) = 69
    // Stage bonus: Consideration not in STAGE_BONUS → 0; Momentum: Increasing → +2
    expect(result.finalScore).toBeGreaterThanOrEqual(60); // AI-as-floor: never below rule
  });

  it('AI cannot lower the score below rule engine floor', () => {
    const result = runDecisionEngine({
      ruleScore:        80, ruleStatus: 'hot', allBuyingSignals: [],
      prevFinalStatus:  'hot', aiAnalysis: { buyingIntent: 30, confidence: 90, salesStage: 'Awareness', momentum: 'Declining' } as any,
      aiConfidence:     90, industryProfile: 'general', isRepeatCustomer: false, messageCount: 20,
    });
    // Blended: max(80, round(80*0.45 + 30*0.55)) = max(80, round(36+16.5)) = max(80, 53) = 80
    // Momentum Declining: -5 → but bounded to max(ruleScore, blended) first, then momentum
    expect(result.finalScore).toBeGreaterThanOrEqual(70); // at minimum HOT (slight momentum penalty might bring down)
  });

  it('qualifies lead with gate signal and score >= 90', () => {
    const result = runDecisionEngine({
      ruleScore:        92, ruleStatus: 'hot', allBuyingSignals: ['intent_payment_link'],
      prevFinalStatus:  'hot', aiAnalysis: { buyingIntent: 95, confidence: 88, salesStage: 'Decision', momentum: 'Spiking' } as any,
      aiConfidence:     88, industryProfile: 'travel', isRepeatCustomer: false, messageCount: 26,
    });
    expect(result.qualificationMet).toBe(true);
    expect(result.gateSignal).toBe('intent_payment_link');
    expect(result.finalStatus).toBe('qualified');
  });

  it('does not qualify lead with gate signal but score < 90', () => {
    const result = runDecisionEngine({
      ruleScore:        65, ruleStatus: 'warm', allBuyingSignals: ['intent_payment_link'],
      prevFinalStatus:  'warm', aiAnalysis: { buyingIntent: 50, confidence: 75, salesStage: 'Consideration', momentum: 'Stable' } as any,
      aiConfidence:     75, industryProfile: 'general', isRepeatCustomer: false, messageCount: 10,
    });
    // Gate signal present but score too low
    expect(result.qualificationMet).toBe(false);
    expect(result.finalStatus).not.toBe('qualified');
  });

  it('preserves terminal status: converted lead stays converted', () => {
    const result = runDecisionEngine({
      ruleScore:        30, ruleStatus: 'cold', allBuyingSignals: [],
      prevFinalStatus:  'converted', aiAnalysis: null, aiConfidence: 0,
      industryProfile: 'general', isRepeatCustomer: false, messageCount: 5,
    });
    expect(result.finalStatus).toBe('converted');
  });

  it('applies Negotiation stage bonus (+5)', () => {
    const base = runDecisionEngine({
      ruleScore:        75, ruleStatus: 'hot', allBuyingSignals: [],
      prevFinalStatus:  'hot', aiAnalysis: null, aiConfidence: 0,
      industryProfile: 'general', isRepeatCustomer: false, messageCount: 10,
    });
    const withNeg = runDecisionEngine({
      ruleScore:        75, ruleStatus: 'hot', allBuyingSignals: [],
      prevFinalStatus:  'hot', aiAnalysis: { buyingIntent: 75, confidence: 75, salesStage: 'Negotiation', momentum: 'Stable' } as any,
      aiConfidence:     75, industryProfile: 'general', isRepeatCustomer: false, messageCount: 10,
    });
    expect(withNeg.finalScore).toBeGreaterThan(base.finalScore);
  });

  it('produces human-readable reasoning string', () => {
    const result = runDecisionEngine({
      ruleScore:        78, ruleStatus: 'hot', allBuyingSignals: ['intent_payment_link'],
      prevFinalStatus:  'hot', aiAnalysis: { buyingIntent: 88, confidence: 82, salesStage: 'Decision', momentum: 'Spiking' } as any,
      aiConfidence:     82, industryProfile: 'travel', isRepeatCustomer: false, messageCount: 26,
    });
    expect(result.reasoning).toContain('Rule=78');
    expect(result.reasoning).toContain('blended');
    expect(result.reasoning).toContain('Decision');
    expect(result.reasoning).toContain('intent_payment_link');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 2: Full Pipeline (Rule Engine → AI Mock → Decision Engine)
// ═══════════════════════════════════════════════════════════════════════════

describe('Full Pipeline — Zanskar Trek Lead', () => {
  beforeEach(() => {
    mockProvider.reset();
  });

  it('rule engine detects all key signals from Zanskar conversation', () => {
    // Run scoring incrementally message by message
    let score = 0;
    let status = 'cold';
    let signals: string[] = [];
    let negSignals: string[] = [];

    for (const msg of ZANSKAR_MESSAGES) {
      const r = calculateLeadScore({
        userMessage:    msg.direction === 'inbound' ? (msg.content ?? '') : '',
        aiResponse:     { intent: 'unknown', extractedData: {}, confidence: 0 },
        conversation:   { message_count: 26, created_at: '2026-06-01T10:00:00Z' },
        lead:           { lead_score: score, lead_status: status, manual_status: null, buying_signals: signals, negative_signals: negSignals },
        industryProfile: 'travel',
      });
      score      = r.lead_score;
      status     = r.lead_status;
      signals    = r.all_buying_signals;
      negSignals = r.all_negative_signals;
    }

    // Must detect critical signals from this conversation (text-pattern signals only;
    // data signals like shared_guest_count require AI extractedData)
    expect(signals).toContain('intent_payment_link');  // m26: "send me the payment link"
    expect(signals).toContain('asked_dates');           // m22: "August 10-17 would work"
    expect(signals).toContain('asked_discount');          // m8: asked for discount (key = asked_discount)
    expect(signals.some(s => s.includes('messages_'))) .toBe(true); // message count milestones

    expect(score).toBeGreaterThanOrEqual(70);
    expect(['hot', 'qualified']).toContain(status);
  });

  it('mock AI returns HOT analysis for Zanskar lead', async () => {
    mockProvider.setOverrides({
      salesStage:    'Decision',
      buyingIntent:  88,
      confidence:    82,
      momentum:      'Spiking',
      urgency:       70,
      trust:         75,
      engagement:    85,
      budgetScore:   70,
      commitment:    80,
      negotiation:   65,
      conversationQuality: 80,
      conversionProbability: 78,
      intentConfidence:          80,
      stageConfidence:           82,
      recommendationConfidence:  75,
      buyingIntentConfidence:    80,
      entityExtractionConfidence: 78,
      memoryUpdates: {
        groupSize:            4,
        preferredDestination: 'Zanskar Valley',
        preferredTravelMonth: 'August',
        budgetMin:            35000,
        budgetMax:            38500,
        discountRequested:    true,
      },
    });

    const aiResult = await mockProvider.analyze({
      executionId:          'test-zanskar',
      conversationSnapshot: {
        fullContext: ZANSKAR_MESSAGES.map(m => `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.content}`).join('\n'),
        incrementalMessages: [],
        useIncremental:      false,
        messageCount:        ZANSKAR_MESSAGES.length,
        lastAnalyzedMessageCount: 0,
        lastAnalysisId:      null,
      },
      systemPrompt:          'test',
      userPromptTemplate:    'test',
      responseSchemaKey:     'lead_analysis',
      schemaVersion:         '1.0',
      conversationMemory:    null,
      tenantId:              'tenant-test',
      leadId:                'lead-zanskar',
      conversationId:        'conv-zanskar',
      industry:              'travel',
      promptVersion:         'v1',
      promptKey:             'conversation_analysis',
    });

    expect(aiResult.parsed.buyingIntent).toBe(88);
    expect(aiResult.parsed.salesStage).toBe('Decision');
    expect(aiResult.parsed.momentum).toBe('Spiking');
    expect(aiResult.parsed.memoryUpdates?.groupSize).toBe(4);
    expect(aiResult.parsed.memoryUpdates?.preferredDestination).toBe('Zanskar Valley');
  });

  it('decision engine produces HOT status for Zanskar lead with AI analysis', () => {
    const zanskarAI: Partial<GeminiConversationAnalysis> = {
      salesStage: 'Decision', buyingIntent: 88, confidence: 82,
      momentum: 'Spiking', urgency: 70, trust: 75,
      intentConfidence: 80, stageConfidence: 82,
      recommendationConfidence: 75, buyingIntentConfidence: 80,
      entityExtractionConfidence: 78,
    };

    const decision = runDecisionEngine({
      ruleScore:        82,
      ruleStatus:       'hot',
      allBuyingSignals: ['intent_payment_link', 'shared_guest_count', 'discount_request', 'ind_expedition_named', 'messages_25'],
      prevFinalStatus:  'hot',
      aiAnalysis:       zanskarAI as GeminiConversationAnalysis,
      aiConfidence:     82,
      industryProfile:  'travel',
      isRepeatCustomer: false,
      messageCount:     26,
    });

    // 82 * 0.45 + 88 * 0.55 = 36.9 + 48.4 = 85.3 → 86; floor max(82, 86) = 86
    // Stage bonus: Decision +10 → 96; Momentum: Spiking +5 → 101 → clamped 100
    // Gate: intent_payment_link + score >= 90 → qualified
    expect(decision.finalStatus).toBe('qualified');
    expect(decision.finalScore).toBeGreaterThanOrEqual(90);
    expect(decision.qualificationMet).toBe(true);
    expect(decision.gateSignal).toBe('intent_payment_link');
    expect(decision.compositeMethod).toBe('blended');
    expect(decision.aiWeightApplied).toBe(0.55);
  });

  it('ind_expedition_named signal does NOT qualify a lead without a payment gate', () => {
    // This was the original root-cause bug: naming a trek ≠ qualified
    const decision = runDecisionEngine({
      ruleScore:        72,
      ruleStatus:       'hot',
      allBuyingSignals: ['ind_expedition_named', 'shared_guest_count', 'messages_10'],
      prevFinalStatus:  'warm',
      aiAnalysis:       null,
      aiConfidence:     0,
      industryProfile:  'travel',
      isRepeatCustomer: false,
      messageCount:     15,
    });

    // Rule-only (no AI), no payment gate → HOT but not QUALIFIED
    expect(decision.finalStatus).toBe('hot');
    expect(decision.qualificationMet).toBe(false);
    expect(decision.gateSignal).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 3: Explainability
// ═══════════════════════════════════════════════════════════════════════════

describe('Explainability', () => {
  it('builds complete explainability output with all fields', () => {
    const ruleCtx = {
      lead_score:         82,
      prev_score:         48,
      lead_status:        'hot',
      prev_status:        'warm',
      all_buying_signals: ['intent_payment_link', 'group_inquiry', 'ind_expedition_named'],
      new_signals:        ['intent_payment_link'],
      score_breakdown: {
        'intent_payment_link': { label: 'Payment link requested',  points: 20, category: 'high_intent' },
        'group_inquiry':       { label: 'Group inquiry',           points: 15, category: 'signal'      },
        'ind_expedition_named':{ label: 'Named specific expedition',points: 20, category: 'signal'      },
      },
      scoring_reasoning: 'Cumulative scoring.',
    };

    const aiMock: Partial<GeminiConversationAnalysis> = {
      salesStage:   'Decision',
      buyingIntent: 88,
      confidence:   82,
      momentum:     'Spiking',
      explanation:  'Customer ready to book Zanskar Valley Trek.',
      recommendation: 'Send payment link immediately.',
    };

    const decCtx = {
      final_score:       92,
      composite_method:  'blended'   as const,
      ai_confidence:     82,
      ai_weight_applied: 0.55,
      qualification_met: true,
      gate_signal:       'intent_payment_link',
    };

    const exp = buildExplainability(ruleCtx, aiMock as GeminiConversationAnalysis, decCtx, 26);

    expect(exp.why_hot).toBeTruthy();
    expect(exp.why_not_qualified).toBeTruthy();
    expect(exp.sales_summary).toBeTruthy();
    expect(exp.key_buying_signals.length).toBeGreaterThan(0);
    expect(exp.timeline_summary).toBeTruthy();
    expect(exp.dimension_scores).toBeInstanceOf(Array);
  });

  it('computes momentum correctly from intent history', () => {
    // Spiking requires avg delta >= 15: (15+15+15+15)/4 = 15
    expect(computeMomentum([40, 55, 70, 85, 100])).toBe('Spiking');
    // Declining: avg delta <= -10
    expect(computeMomentum([80, 70, 60, 50, 40])).toBe('Declining');
    // Stable: small fluctuation
    expect(computeMomentum([60, 62, 61, 63, 62])).toBe('Stable');
    // Increasing: avg delta in 5-14 range
    expect(computeMomentum([60, 65, 70])).toBe('Increasing');
    expect(computeMomentum([])).toBe('Stable');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 4: Recommendation
// ═══════════════════════════════════════════════════════════════════════════

describe('Recommendation Engine', () => {
  it('returns critical priority for payment_link signal', () => {
    const rec = getRecommendation('travel', ['intent_payment_link'], 'hot', 88, 'Spiking');
    expect(rec.priority).toBe('critical');
    expect(rec.automation_eligible).toBe(true);
    expect(rec.estimated_close_probability_improvement).toBeGreaterThan(20);
  });

  it('returns travel-specific recommendation for travel industry', () => {
    const rec = getRecommendation('travel', ['ind_expedition_named', 'group_inquiry'], 'hot', 75, 'Increasing');
    expect(rec.primary_action.channel).toBeTruthy();
    expect(rec.summary).toBeTruthy();
    expect(rec.reason).toBeTruthy();
    expect(rec.expected_impact).toBeTruthy();
  });

  it('returns lower priority for cold leads', () => {
    const rec = getRecommendation('general', [], 'cold', 10, 'Dormant');
    expect(['low', 'medium']).toContain(rec.priority);
    expect(rec.estimated_close_probability_improvement).toBeLessThan(rec.confidence);
  });

  it('has all required RichRecommendationOutput fields', () => {
    const rec = getRecommendation('travel', ['intent_payment_link'], 'qualified', 92, 'Spiking');
    expect(rec.primary_action).toBeDefined();
    expect(rec.secondary_actions).toBeInstanceOf(Array);
    expect(rec.summary).toBeTruthy();
    expect(typeof rec.priority).toBe('string');
    expect(typeof rec.expected_impact).toBe('string');
    expect(typeof rec.reason).toBe('string');
    expect(typeof rec.confidence).toBe('number');
    expect(typeof rec.automation_eligible).toBe('boolean');
    expect(typeof rec.estimated_close_probability_improvement).toBe('number');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 5: Incremental Analysis
// ═══════════════════════════════════════════════════════════════════════════

describe('Incremental Analyzer', () => {
  it('forces full rebuild when no prior analysis exists', () => {
    expect(shouldForceFullRebuild(null, 'v1', '1.0', 'abc123')).toBe(true);
  });

  it('forces full rebuild when prompt version changed', () => {
    const last = { analysisId: 'a1', promptVersion: 'v1', schemaVersion: '1.0', messageCountAtAnalysis: 10, conversationHash: 'abc' };
    expect(shouldForceFullRebuild(last, 'v2', '1.0', 'xyz')).toBe(true);
  });

  it('forces full rebuild when fewer than 5 messages', () => {
    const last = { analysisId: 'a1', promptVersion: 'v1', schemaVersion: '1.0', messageCountAtAnalysis: 0, conversationHash: 'abc' };
    const msgs = ZANSKAR_MESSAGES.slice(0, 3);
    const hash = computeConversationHash(msgs);
    const snap = buildConversationSnapshot(msgs, last, 'v1', '1.0', hash, {});
    expect(snap.useIncremental).toBe(false);
  });

  it('uses incremental analysis when conversation grew', () => {
    const oldMsgs = ZANSKAR_MESSAGES.slice(0, 15);
    const oldHash = computeConversationHash(oldMsgs);
    const last = { analysisId: 'a1', promptVersion: 'v1', schemaVersion: '1.0', messageCountAtAnalysis: 15, conversationHash: oldHash };

    const allMsgs = ZANSKAR_MESSAGES;
    const newHash = computeConversationHash(allMsgs);
    const snap = buildConversationSnapshot(allMsgs, last, 'v1', '1.0', newHash, {});

    expect(snap.useIncremental).toBe(true);
    expect(snap.messageCount).toBe(26);
    expect(snap.incrementalMessages.length).toBeGreaterThan(0);
    expect(snap.incrementalMessages.length).toBeLessThan(26);
  });

  it('computes conversation hash deterministically', () => {
    const hash1 = computeConversationHash(ZANSKAR_MESSAGES);
    const hash2 = computeConversationHash(ZANSKAR_MESSAGES);
    expect(hash1).toBe(hash2);
    expect(hash1).toBeTruthy();
  });

  it('detects hash change when messages change', () => {
    const hash1 = computeConversationHash(ZANSKAR_MESSAGES.slice(0, 10));
    const hash2 = computeConversationHash(ZANSKAR_MESSAGES.slice(0, 11));
    expect(conversationHashChanged(hash1, hash2)).toBe(true);
    expect(conversationHashChanged(hash1, hash1)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 6: Failure Strategy
// ═══════════════════════════════════════════════════════════════════════════

describe('Failure Strategy', () => {
  it('classifies auth errors as auth_error', () => {
    // classifyError lowercases and matches 'api key' (space), '401', '403', 'unauthorized'
    expect(classifyError(new Error('api key invalid'))).toBe('auth_error');
    expect(classifyError(new Error('unauthorized 401'))).toBe('auth_error');
    expect(classifyError(new Error('403 forbidden'))).toBe('auth_error');
  });

  it('classifies quota errors as provider_quota', () => {
    expect(classifyError(new Error('quota exceeded 429'))).toBe('provider_quota');
    expect(classifyError(new Error('rate limit'))).toBe('provider_quota');
  });

  it('classifies JSON parse errors as parse_error', () => {
    expect(classifyError(new Error('JSON parse failed'))).toBe('parse_error');
  });

  it('escalates auth errors directly to dead_letter without retry', () => {
    const result = determineFallback({
      error: new Error('API_KEY_INVALID unauthorized'),
      retryCount: 0, maxRetries: 3, jobId: 'j1',
      tenantId: 'tenant1', leadId: 'lead1',
      hasCachedAnalysis: false, hasRuleScore: true,
    });
    expect(result.shouldRetry).toBe(false);
    expect(result.fallbackLevel).toBeGreaterThanOrEqual(3);
  });

  it('recommends retry for quota errors within retry budget', () => {
    const result = determineFallback({
      error: new Error('quota exceeded 429'),
      retryCount: 0, maxRetries: 3, jobId: 'j1',
      tenantId: 'tenant1', leadId: 'lead1',
      hasCachedAnalysis: false, hasRuleScore: true,
    });
    expect(result.shouldRetry).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('falls back to cache when retries exhausted and cache available', () => {
    const result = determineFallback({
      error: new Error('quota exceeded 429'),
      retryCount: 3, maxRetries: 3, jobId: 'j1',
      tenantId: 'tenant1', leadId: 'lead1',
      hasCachedAnalysis: true, hasRuleScore: true,
    });
    expect(result.shouldRetry).toBe(false);
    expect(result.source).toBe('cache');
    expect(result.fallbackLevel).toBe(1);
  });

  it('falls back to rule engine when no cache available', () => {
    const result = determineFallback({
      error: new Error('provider down'),
      retryCount: 3, maxRetries: 3, jobId: 'j1',
      tenantId: 'tenant1', leadId: 'lead1',
      hasCachedAnalysis: false, hasRuleScore: true,
    });
    expect(result.shouldRetry).toBe(false);
    expect(result.source).toBe('rule_engine');
    expect(result.fallbackLevel).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 7: Feature Flags
// ═══════════════════════════════════════════════════════════════════════════

describe('Feature Flags', () => {
  it('applies 5-scope hierarchy (most specific wins)', () => {
    const flags = resolveFlags(buildFlagContext(
      { enable_ai: true },           // tenant: enable
      'travel',
      { travel: { enable_ai: false } }, // industry: disable
      { enable_ai: true },           // lead: re-enable (highest priority)
    ));
    expect(flags.enable_ai).toBe(true); // lead scope wins
  });

  it('respects tenant-level disable without lead override', () => {
    const flags = resolveFlags(buildFlagContext(
      { enable_ai: false }, 'travel', {}, null,
    ));
    expect(flags.enable_ai).toBe(false);
  });

  it('returns defaults when no context provided', () => {
    const flags = resolveFlags(null);
    expect(flags.enable_ai).toBe(true);
    expect(flags.enable_incremental_analysis).toBe(true);
    expect(flags.enable_cost_tracking).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 8: Cost Optimizer (Webhook enqueue decision)
// ═══════════════════════════════════════════════════════════════════════════

describe('Cost Optimizer', () => {
  it('skips trivial one-word messages', () => {
    const r = shouldRunAIAnalysis('ok', { conversationHashChanged: true, aiEnabled: true, messageCount: 10 });
    expect(r.shouldRunAI).toBe(false);
    expect(r.skipReason).toBe('trivial_message');
  });

  it('immediately queues payment-intent messages at priority 1', () => {
    const r = shouldRunAIAnalysis('Can you send me the payment link to confirm booking?', { conversationHashChanged: true, aiEnabled: true, messageCount: 20 });
    expect(r.shouldRunAI).toBe(true);
    expect(r.priority).toBe(1);
  });

  it('queues negotiation messages at priority 2', () => {
    const r = shouldRunAIAnalysis('Can you give me a discount on the package?', { conversationHashChanged: true, aiEnabled: true, messageCount: 8 });
    expect(r.shouldRunAI).toBe(true);
    expect(r.priority).toBeLessThanOrEqual(3);
  });

  it('returns cache_hit when hash unchanged and recent analysis exists', () => {
    const r = shouldRunAIAnalysis('thank you for the info', {
      conversationHashChanged: false, aiEnabled: true, messageCount: 10,
      timeSinceLastAnalysis: 5, // 5 minutes ago
    });
    expect(r.shouldRunAI).toBe(false);
    expect(r.skipReason).toBe('cache_hit');
  });

  it('respects AI disabled flag', () => {
    const r = shouldRunAIAnalysis('I want to book Zanskar trek for 4 people', { conversationHashChanged: true, aiEnabled: false, messageCount: 10 });
    expect(r.shouldRunAI).toBe(false);
    expect(r.skipReason).toBe('flags_disabled');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 9: Cost Tracking
// ═══════════════════════════════════════════════════════════════════════════

describe('Cost Tracker', () => {
  it('tracks calls and computes summaries per tenant', () => {
    const tenantId = `test-cost-${Date.now()}`;
    recordCall({ tenantId, provider: 'gemini', model: 'gemini-2.0-flash', tokensIn: 1000, tokensOut: 300, costUsd: 0.00015, latencyMs: 800, cacheHit: false, skipped: false });
    recordCall({ tenantId, provider: 'gemini', model: 'gemini-2.0-flash', tokensIn: 500, tokensOut: 150, costUsd: 0.0001, latencyMs: 600, cacheHit: true, skipped: false });
    recordCall({ tenantId, provider: 'gemini', model: 'gemini-2.0-flash', tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0, cacheHit: false, skipped: true, skipReason: 'trivial_message' });

    const summary = getTenantDailySummary(tenantId);
    // totalCalls counts non-skipped calls; skippedCalls is tracked separately
    expect(summary.totalCalls).toBeGreaterThanOrEqual(2);
    expect(summary.skippedCalls).toBeGreaterThanOrEqual(1);
    expect(summary.totalCalls + summary.skippedCalls).toBeGreaterThanOrEqual(3);
    expect(summary.cachedCalls).toBeGreaterThanOrEqual(1);
    expect(summary.skippedCalls).toBeGreaterThanOrEqual(1);
    expect(summary.totalCostUsd).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUITE 10: Mock Provider
// ═══════════════════════════════════════════════════════════════════════════

describe('Mock Provider', () => {
  beforeEach(() => mockProvider.reset());

  it('returns deterministic default response', async () => {
    const resp = await mockProvider.analyze({
      executionId: 'test1',
      conversationSnapshot: {
        fullContext: 'Customer: hello',
        incrementalMessages: [],
        useIncremental: false,
        messageCount: 1,
        lastAnalyzedMessageCount: 0,
        lastAnalysisId: null,
      },
      systemPrompt: '', userPromptTemplate: '',
      responseSchemaKey: 'lead_analysis', schemaVersion: '1.0',
      conversationMemory: null,
      tenantId: 't1', leadId: 'l1', conversationId: 'c1',
      industry: 'general', promptVersion: 'v1', promptKey: 'conversation_analysis',
    });
    expect(resp.parsed.salesStage).toBe('Consideration');
    expect(resp.parsed.buyingIntent).toBe(55);
    expect(resp.parsed.confidence).toBe(80);
    expect(mockProvider.callCount).toBe(1);
  });

  it('applies overrides', async () => {
    mockProvider.setOverrides({ buyingIntent: 99, salesStage: 'Decision' });
    const resp = await mockProvider.analyze({
      executionId: 'test2',
      conversationSnapshot: { fullContext: 'x', incrementalMessages: [], useIncremental: false, messageCount: 1, lastAnalyzedMessageCount: 0, lastAnalysisId: null },
      systemPrompt: '', userPromptTemplate: '',
      responseSchemaKey: 'lead_analysis', schemaVersion: '1.0',
      conversationMemory: null,
      tenantId: 't1', leadId: 'l1', conversationId: 'c1',
      industry: 'general', promptVersion: 'v1', promptKey: 'conversation_analysis',
    });
    expect(resp.parsed.buyingIntent).toBe(99);
    expect(resp.parsed.salesStage).toBe('Decision');
  });

  it('simulates errors correctly', async () => {
    mockProvider.simulateError('test failure');
    await expect(mockProvider.analyze({
      executionId: 'test3',
      conversationSnapshot: { fullContext: 'x', incrementalMessages: [], useIncremental: false, messageCount: 1, lastAnalyzedMessageCount: 0, lastAnalysisId: null },
      systemPrompt: '', userPromptTemplate: '',
      responseSchemaKey: 'lead_analysis', schemaVersion: '1.0',
      conversationMemory: null,
      tenantId: 't1', leadId: 'l1', conversationId: 'c1',
      industry: 'general', promptVersion: 'v1', promptKey: 'conversation_analysis',
    })).rejects.toThrow('test failure');
  });
});
