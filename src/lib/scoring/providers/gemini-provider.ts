// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Gemini AI Provider (REQ 5)
//
// First concrete AIProvider implementation.
// Business logic never imports this file — always go through ai-provider.ts.
// ═══════════════════════════════════════════════════════════════════════════

import type { AIProvider, AIAnalysisRequest, AIAnalysisResponse, CostEstimate, ProviderHealthStatus } from '../ai-provider';
import { renderPrompt, registerProvider } from '../ai-provider';
import { validateResponse, extractJSON } from '../schema-registry';
import type { MultiDimensionalConfidence, FallbackLevel } from '../types';

// Gemini 2.0 Flash pricing (as of 2026-06)
// Input:  $0.075 / 1M tokens
// Output: $0.30  / 1M tokens
const COST_PER_1M_IN  = 0.075;
const COST_PER_1M_OUT = 0.30;

function estimateCostForTokens(tokensIn: number, tokensOut: number): number {
  return (tokensIn / 1_000_000) * COST_PER_1M_IN + (tokensOut / 1_000_000) * COST_PER_1M_OUT;
}

function approximateTokenCount(text: string): number {
  // Conservative: 1 token ≈ 3.5 chars for mixed English/Hindi text
  return Math.ceil(text.length / 3.5);
}

export class GeminiProvider implements AIProvider {
  readonly id   = 'gemini';
  readonly name = 'Google Gemini';
  readonly defaultModel: string;

  private readonly apiKey: string;

  constructor(apiKey: string, model = 'gemini-2.0-flash') {
    this.apiKey = apiKey;
    this.defaultModel = model;
  }

  async analyze(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
    const start = Date.now();

    // Build user prompt from template + conversation snapshot
    const { conversationSnapshot: snap, conversationMemory } = request;
    const conversationText = snap.useIncremental
      ? `[Previous analysis context retained]\n\nNEW MESSAGES:\n${snap.incrementalMessages.join('\n')}`
      : snap.fullContext;

    const memoryText = conversationMemory
      ? buildMemoryContext(conversationMemory)
      : 'No prior facts known about this customer yet.';

    const userPrompt = renderPrompt(request.userPromptTemplate, {
      conversation:      conversationText,
      memory:            memoryText,
      industry_context:  '',
      signals:           '',
      business_type:     request.businessType ?? 'General',
      knowledge_base:    request.knowledgeBase ?? 'None',
      past_history:      request.pastHistory ?? 'None',
      campaign_source:   request.campaignSource ?? 'None',
      customer_metadata: request.customerMetadata ?? 'None',
      message_timing:    request.messageTiming ?? 'None',
    });

    const payload = {
      contents: [
        { role: 'user', parts: [{ text: userPrompt }] },
      ],
      systemInstruction: { parts: [{ text: request.systemPrompt }] },
      generationConfig: {
        temperature:     0.1,  // low variance — we need deterministic structured output
        topP:            0.95,
        maxOutputTokens: request.maxTokens ?? 2048,
        responseMimeType: 'application/json',
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.defaultModel}:generateContent?key=${this.apiKey}`;

    let raw: unknown;
    let tokensIn  = approximateTokenCount(request.systemPrompt + userPrompt);
    let tokensOut = 0;
    const parsingErrors: string[] = [];

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const geminiResponse = await res.json() as GeminiApiResponse;

    const candidate = geminiResponse.candidates?.[0];
    if (!candidate) throw new Error('Gemini returned no candidates');

    const textPart = candidate.content?.parts?.[0]?.text ?? '';
    tokensIn  = geminiResponse.usageMetadata?.promptTokenCount     ?? tokensIn;
    tokensOut = geminiResponse.usageMetadata?.candidatesTokenCount ?? approximateTokenCount(textPart);

    try {
      raw = extractJSON(textPart);
    } catch (e) {
      parsingErrors.push(`JSON parse failed: ${(e as Error).message}`);
      // Return a safe fallback rather than throwing — failure strategy handles next steps
      throw new Error(`Gemini response JSON parse failed: ${(e as Error).message}`);
    }

    const validation = validateResponse(request.responseSchemaKey, request.schemaVersion, raw);
    if (!validation.valid || !validation.parsed) {
      parsingErrors.push(...validation.errors);
      throw new Error(`Schema validation failed (${validation.errors.length} errors): ${validation.errors.slice(0, 3).join('; ')}`);
    }
    parsingErrors.push(...validation.warnings.map(w => `WARN: ${w}`));

    const parsed = validation.parsed;
    const latencyMs = Date.now() - start;

    let confidence: MultiDimensionalConfidence;
    if (parsed && 'stage' in parsed) {
      const v2 = parsed as any;
      confidence = {
        overall:           v2.confidence ?? 0,
        intent:            v2.confidence ?? 0,
        stage:             v2.confidence ?? 0,
        recommendation:    v2.confidence ?? 0,
        buying_intent:     v2.confidence ?? 0,
        entity_extraction: v2.confidence ?? 0,
      };
    } else {
      confidence = {
        overall:           parsed.confidence,
        intent:            parsed.intentConfidence,
        stage:             parsed.stageConfidence,
        recommendation:    parsed.recommendationConfidence,
        buying_intent:     parsed.buyingIntentConfidence,
        entity_extraction: parsed.entityExtractionConfidence,
      };
    }

    return {
      parsed,
      confidence,
      tokensIn,
      tokensOut,
      latencyMs,
      estimatedCostUsd: estimateCostForTokens(tokensIn, tokensOut),
      cacheHit:         false,
      provider:         this.id,
      model:            this.defaultModel,
      fallbackLevel:    0 as FallbackLevel,
      parsingErrors,
    };
  }

  estimateCost(inputText: string, expectedOutputTokens = 800): CostEstimate {
    const tokensIn  = approximateTokenCount(inputText);
    const tokensOut = expectedOutputTokens;
    return {
      estimatedTokensIn:   tokensIn,
      estimatedTokensOut:  tokensOut,
      estimatedCostUsd:    estimateCostForTokens(tokensIn, tokensOut),
      model:               this.defaultModel,
      provider:            this.id,
    };
  }

  async isHealthy(): Promise<ProviderHealthStatus> {
    const start = Date.now();
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;
      const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return {
        healthy:      res.ok,
        latencyMs:    Date.now() - start,
        errorMessage: res.ok ? null : `HTTP ${res.status}`,
        checkedAt:    new Date().toISOString(),
      };
    } catch (e) {
      return {
        healthy:      false,
        latencyMs:    Date.now() - start,
        errorMessage: (e as Error).message,
        checkedAt:    new Date().toISOString(),
      };
    }
  }
}

// ── Memory context builder ────────────────────────────────────────────────

function buildMemoryContext(memory: import('../types').ConversationMemory): string {
  const facts: string[] = [];
  if (memory.customer_name)       facts.push(`Customer name: ${memory.customer_name}`);
  if (memory.language)            facts.push(`Language: ${memory.language}`);
  if (memory.group_size)          facts.push(`Group size: ${memory.group_size}`);
  if (memory.group_composition)   facts.push(`Group: ${memory.group_composition}`);
  if (memory.preferred_destination) facts.push(`Preferred destination: ${memory.preferred_destination}`);
  if (memory.preferred_travel_month) facts.push(`Travel month: ${memory.preferred_travel_month}`);
  if (memory.budget_range_min || memory.budget_range_max) {
    facts.push(`Budget: ${memory.budget_range_min ?? '?'}–${memory.budget_range_max ?? '?'} ${memory.budget_currency}`);
  }
  if (memory.discount_requested)  facts.push('Customer has requested a discount');
  if (memory.fitness_concern)     facts.push('Customer mentioned fitness concerns');
  if (memory.airport_pickup_needed) facts.push('Airport pickup needed');
  if (memory.dietary_requirements) facts.push(`Dietary: ${memory.dietary_requirements}`);
  if (memory.known_objections.length) facts.push(`Known objections: ${memory.known_objections.join(', ')}`);
  if (memory.known_preferences.length) facts.push(`Known preferences: ${memory.known_preferences.join(', ')}`);

  // Industry-specific discovered facts
  const df = memory.discovered_facts;
  if (df && typeof df === 'object') {
    for (const [k, v] of Object.entries(df)) {
      facts.push(`${k}: ${v}`);
    }
  }

  return facts.length ? facts.join('\n') : 'No prior facts known about this customer yet.';
}

// ── Gemini API response shape ─────────────────────────────────────────────

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount:      number;
    candidatesTokenCount:  number;
    totalTokenCount:       number;
  };
}

// ── Factory: auto-register if env var is set ──────────────────────────────

export function createGeminiProvider(apiKey?: string, model?: string): GeminiProvider {
  const key = apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY ?? '';
  const provider = new GeminiProvider(key, model);
  registerProvider(provider);
  return provider;
}
