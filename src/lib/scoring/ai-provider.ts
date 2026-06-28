// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — AI Provider Interface (REQ 5)
//
// All AI providers implement this interface. Business logic never references
// Gemini, Claude, or OpenAI directly — only AIProvider.
// Swapping providers requires zero changes to business logic.
// ═══════════════════════════════════════════════════════════════════════════

import type { GeminiConversationAnalysis, MultiDimensionalConfidence, FallbackLevel } from './types';
import type { IndustryProfile } from './industry-profiles';
import type { ConversationMemory } from './types';

// ── Conversation Snapshot (REQ 7: Incremental Analysis) ───────────────────

export interface ConversationSnapshot {
  /** Full conversation transcript for initial / forced analysis */
  fullContext: string;
  /** Only messages added since last analysis (for incremental) */
  incrementalMessages: string[];
  /** Whether to use incremental (true) or full rebuild (false) */
  useIncremental: boolean;
  /** Total messages in conversation now */
  messageCount: number;
  /** Message count at last successful analysis */
  lastAnalyzedMessageCount: number;
  /** Message count at last successful analysis (for incremental delta) */
  lastAnalysisId: string | null;
}

// ── Request ───────────────────────────────────────────────────────────────

export interface AIAnalysisRequest {
  executionId:       string;
  conversationSnapshot: ConversationSnapshot;
  systemPrompt:      string;
  userPromptTemplate: string;  // with {{conversation}}, {{memory}}, etc. tokens
  responseSchemaKey: string;   // key into SchemaRegistry
  schemaVersion:     string;
  conversationMemory: ConversationMemory | null;
  tenantId:          string;
  leadId:            string;
  conversationId:    string;
  industry:          IndustryProfile;
  promptVersion:     string;
  promptKey:         string;
  maxTokens?:        number;
}

// ── Response ──────────────────────────────────────────────────────────────

export interface AIAnalysisResponse {
  /** Parsed and validated AI output */
  parsed:          GeminiConversationAnalysis;
  /** Multi-dimensional confidence (REQ 9) */
  confidence:      MultiDimensionalConfidence;
  tokensIn:        number;
  tokensOut:       number;
  latencyMs:       number;
  estimatedCostUsd: number;
  cacheHit:        boolean;
  provider:        string;
  model:           string;
  fallbackLevel:   FallbackLevel;
  parsingErrors:   string[];
}

// ── Health Check ──────────────────────────────────────────────────────────

export interface ProviderHealthStatus {
  healthy:      boolean;
  latencyMs:    number;
  errorMessage: string | null;
  checkedAt:    string;
}

// ── Cost Estimation ───────────────────────────────────────────────────────

export interface CostEstimate {
  estimatedTokensIn:   number;
  estimatedTokensOut:  number;
  estimatedCostUsd:    number;
  model:               string;
  provider:            string;
}

// ── The Core Interface ────────────────────────────────────────────────────

export interface AIProvider {
  /** Unique provider identifier (e.g. 'gemini', 'claude', 'openai', 'mock') */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Default model this provider uses */
  readonly defaultModel: string;

  /**
   * Analyze a conversation and return multi-dimensional intelligence.
   * Must: validate response against schema, return structured errors in parsingErrors.
   */
  analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse>;

  /**
   * Estimate cost for a request before sending it.
   * Used by cost optimizer to skip low-value analyses.
   */
  estimateCost(inputText: string, expectedOutputTokens?: number): CostEstimate;

  /** Health check — called by failure strategy before attempting analysis */
  isHealthy(): Promise<ProviderHealthStatus>;
}

// ── Provider Registry ─────────────────────────────────────────────────────

const _registry = new Map<string, AIProvider>();

export function registerProvider(provider: AIProvider): void {
  _registry.set(provider.id, provider);
}

export function getProvider(id: string): AIProvider {
  const p = _registry.get(id);
  if (!p) throw new Error(`AI provider "${id}" not registered. Call registerProvider() first.`);
  return p;
}

export function getDefaultProvider(): AIProvider {
  // Preference order: gemini → claude → mock
  for (const id of ['gemini', 'claude', 'mock']) {
    const p = _registry.get(id);
    if (p) return p;
  }
  throw new Error('No AI provider registered. Call registerProvider() before using the AI layer.');
}

export function listProviders(): string[] {
  return [..._registry.keys()];
}

// ── Prompt Template Renderer ──────────────────────────────────────────────

export function renderPrompt(
  template: string,
  tokens: Record<string, string>,
): string {
  return Object.entries(tokens).reduce(
    (acc, [key, value]) => acc.replace(new RegExp(`{{${key}}}`, 'g'), value),
    template,
  );
}
