// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Mock AI Provider (for tests + local dev)
// Returns deterministic, configurable responses. Zero external calls.
// ═══════════════════════════════════════════════════════════════════════════

import type { AIProvider, AIAnalysisRequest, AIAnalysisResponse, CostEstimate, ProviderHealthStatus } from '../ai-provider';
import type { GeminiConversationAnalysis } from '../types';
import { registerProvider } from '../ai-provider';

const DEFAULT_MOCK_RESPONSE: GeminiConversationAnalysis = {
  buyingIntent:          55,
  urgency:               30,
  trust:                 60,
  engagement:            65,
  budgetScore:           50,
  commitment:            40,
  negotiation:           20,
  conversionProbability: 45,
  conversationQuality:   60,

  confidence:                   80,
  intentConfidence:             75,
  stageConfidence:              70,
  recommendationConfidence:     72,
  buyingIntentConfidence:       78,
  entityExtractionConfidence:   65,

  budgetSensitivity:  'Medium',
  salesStage:         'Consideration',
  momentum:           'Stable',
  negotiationState:   'none',

  intentHistory:   ['general_enquiry'],
  groupBooking:    false,
  groupSize:       null,
  objections:      [],
  detectedSignals: [],
  missingSignals:  ['No payment or booking signal yet'],
  keyMoments:      [],

  explanation:     'Lead is in Consideration stage, asking questions without strong commitment signals.',
  recommendation:  'Send detailed product/service information and ask about specific requirements.',
  whyHot:          'Engagement is active but no closing signal yet.',
  whyNotQualified: 'No payment link, invoice, or booking confirmation requested.',
  salesSummary:    'Active lead exploring options. Follow up with more information.',

  recommendationPriority: 'medium',
  expectedImpact:         'Lead will likely progress to Evaluation if information is sent promptly.',
  recommendationReason:   'Consideration stage leads need more information before deciding.',
  automationEligible:     false,
  estimatedCloseProbImprovement: 5,

  memoryUpdates: {},
};

export class MockProvider implements AIProvider {
  readonly id   = 'mock';
  readonly name = 'Mock Provider (Testing)';
  readonly defaultModel = 'mock-v1';

  private _overrides: Partial<GeminiConversationAnalysis> = {};
  private _simulateLatencyMs = 50;
  private _simulateError: string | null = null;
  private _callCount = 0;

  /** Call this in tests to customize the response for specific scenarios. */
  setOverrides(overrides: Partial<GeminiConversationAnalysis>): this {
    this._overrides = overrides;
    return this;
  }

  simulateLatency(ms: number): this {
    this._simulateLatencyMs = ms;
    return this;
  }

  simulateError(message: string): this {
    this._simulateError = message;
    return this;
  }

  reset(): this {
    this._overrides = {};
    this._simulateLatencyMs = 50;
    this._simulateError = null;
    this._callCount = 0;
    return this;
  }

  get callCount(): number { return this._callCount; }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    this._callCount++;
    const start = Date.now();

    await new Promise(r => setTimeout(r, this._simulateLatencyMs));

    if (this._simulateError) {
      throw new Error(this._simulateError);
    }

    const parsed: GeminiConversationAnalysis = { ...DEFAULT_MOCK_RESPONSE, ...this._overrides };
    const latencyMs = Date.now() - start;

    return {
      parsed,
      confidence: {
        overall:           parsed.confidence,
        intent:            parsed.intentConfidence,
        stage:             parsed.stageConfidence,
        recommendation:    parsed.recommendationConfidence,
        buying_intent:     parsed.buyingIntentConfidence,
        entity_extraction: parsed.entityExtractionConfidence,
      },
      tokensIn:         200,
      tokensOut:        800,
      latencyMs,
      estimatedCostUsd: 0.0,
      cacheHit:         false,
      provider:         this.id,
      model:            this.defaultModel,
      fallbackLevel:    0,
      parsingErrors:    [],
    };
  }

  estimateCost(_inputText: string, _expectedOutputTokens = 800): CostEstimate {
    return {
      estimatedTokensIn:   200,
      estimatedTokensOut:  800,
      estimatedCostUsd:    0,
      model:               this.defaultModel,
      provider:            this.id,
    };
  }

  async isHealthy(): Promise<ProviderHealthStatus> {
    return { healthy: true, latencyMs: 1, errorMessage: null, checkedAt: new Date().toISOString() };
  }
}

export const mockProvider = new MockProvider();
registerProvider(mockProvider);
