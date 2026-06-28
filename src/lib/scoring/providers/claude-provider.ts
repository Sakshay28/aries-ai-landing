// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Claude AI Provider (REQ 5)
//
// Stub implementation. Phase E will fill in the Anthropic API call.
// All interface contracts are satisfied — business logic works unchanged
// when this provider is selected.
// ═══════════════════════════════════════════════════════════════════════════

import type { AIProvider, AIAnalysisRequest, AIAnalysisResponse, CostEstimate, ProviderHealthStatus } from '../ai-provider';
import type { FallbackLevel } from '../types';

// Claude 3.5 Sonnet pricing (approximate, 2026)
const COST_PER_1M_IN  = 3.0;
const COST_PER_1M_OUT = 15.0;

export class ClaudeProvider implements AIProvider {
  readonly id   = 'claude';
  readonly name = 'Anthropic Claude';
  readonly defaultModel: string;

  private readonly apiKey: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-6') {
    this.apiKey = apiKey;
    this.defaultModel = model;
  }

  async analyze(_request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    // Phase E: implement Anthropic Messages API call here.
    // The request/response contracts are identical to GeminiProvider.
    throw new Error('ClaudeProvider.analyze() not yet implemented. Use GeminiProvider or MockProvider.');
  }

  estimateCost(inputText: string, expectedOutputTokens = 800): CostEstimate {
    const tokensIn  = Math.ceil(inputText.length / 4);
    const tokensOut = expectedOutputTokens;
    return {
      estimatedTokensIn:   tokensIn,
      estimatedTokensOut:  tokensOut,
      estimatedCostUsd:    (tokensIn / 1_000_000) * COST_PER_1M_IN + (tokensOut / 1_000_000) * COST_PER_1M_OUT,
      model:               this.defaultModel,
      provider:            this.id,
    };
  }

  async isHealthy(): Promise<ProviderHealthStatus> {
    return {
      healthy:      false,
      latencyMs:    0,
      errorMessage: 'ClaudeProvider not yet implemented',
      checkedAt:    new Date().toISOString(),
    };
  }
}

export function createClaudeProvider(apiKey?: string, model?: string): ClaudeProvider {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  return new ClaudeProvider(key, model);
}
