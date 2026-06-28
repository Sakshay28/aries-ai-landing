// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — Conversation Intelligence Orchestrator
//
// Single entry point for all AI analysis.
// Execution flow:
//   Load messages → Build snapshot → Get prompt/schema → Call AI →
//   Validate → Decision Engine → Explainability → Recommendation →
//   Persist all → Track costs → Return
//
// Never throws. Always returns a result (may be a fallback level).
// Every execution has an execution_id for end-to-end tracing.
// ═══════════════════════════════════════════════════════════════════════════

import { randomUUID }               from 'crypto';
import { supabaseAdmin }             from '@/lib/supabase/admin';
import type { LeadStatus }           from '@/lib/types';
import type { SupabaseClient }       from '@supabase/supabase-js';

import { calculateLeadScore }        from './lead-scoring-engine';
import { runDecisionEngine, toDecisionContext } from './decision-engine';
import { buildExplainability }       from './explainability';
import { getRecommendation }         from './recommendations';
import { getPrompt }                 from './prompt-registry';
import { getLatestSchemaVersion, validateResponse, extractJSON } from './schema-registry';
import { getDefaultProvider }        from './ai-provider';
import { shouldRunAIAnalysis }       from './cost-optimizer';
import { computeConversationHash, conversationHashChanged } from './conversation-hash';
import { buildConversationSnapshot, shouldForceFullRebuild } from './incremental-analyzer';
import { computeMomentum }           from './explainability';
import { determineFallback }          from './failure-strategy';
import { recordCall }                 from './cost-tracker';
import { currentVersionSnapshot }    from './versions';
import { normalizeIndustry }         from './industry-profiles';

import type {
  GeminiConversationAnalysis, ConversationState, ConversationMemory,
  FallbackLevel, TriggerType,
} from './types';
import type { RichRecommendationOutput } from './recommendations';
import type { ExplainabilityOutput }     from './explainability';
import type { DecisionEngineResult }     from './decision-engine';

// ── Public Input / Output ─────────────────────────────────────────────────

export interface ConversationIntelligenceInput {
  tenantId:       string;
  leadId:         string;
  conversationId: string;
  triggeredBy:    TriggerType;
  jobId?:         string;
  executionId?:   string;   // caller may supply; generated if absent
  jobEnqueuedAt?: string;   // ISO timestamp for queue wait measurement
  // Dependency injection — for testing; production uses supabaseAdmin
  db?: SupabaseClient;
}

export interface ConversationIntelligenceResult {
  success:       boolean;
  executionId:   string;
  fallbackLevel: FallbackLevel;

  // Scores
  ruleScore:     number;
  finalScore:    number;
  finalStatus:   LeadStatus;
  buyingIntent:  number;

  // Decision engine
  decision:      DecisionEngineResult | null;

  // Full AI output (null on total failure)
  aiAnalysis:    GeminiConversationAnalysis | null;

  // Downstream outputs
  explainability:    ExplainabilityOutput | null;
  recommendation:    RichRecommendationOutput | null;

  // IDs written to DB
  analysisId:        string | null;
  recommendationId:  string | null;

  // Performance
  totalLatencyMs: number;
  aiLatencyMs:    number;
  queueWaitMs:    number | null;

  // Cost
  estimatedCostUsd: number;
  tokensUsed:       number;
  cacheHit:         boolean;

  // Diagnostics
  wasIncremental: boolean;
  messageCount:   number;
  parsingErrors:  string[];
  errorMessage:   string | null;
}

// ── Internal helpers ──────────────────────────────────────────────────────

interface MessageRow {
  id: string;
  content: string | null;
  direction: 'inbound' | 'outbound';
  sender_name: string | null;
  created_at: string;
}

interface LeadRow {
  id: string;
  lead_score: number;
  lead_status: string;
  buying_signals: string[];
  negative_signals: string[];
  manual_status: string | null;
  ai_confidence: number | null;
  is_repeat_customer?: boolean;
}

interface ConversationRow {
  id: string;
  message_count: number | null;
  created_at: string;
}

function safeLog(executionId: string, msg: string, data?: unknown): void {
  const payload = data ? ` | ${JSON.stringify(data)}` : '';
  console.log(`[conv-intel:${executionId}] ${msg}${payload}`);
}

// ── Main Orchestrator ─────────────────────────────────────────────────────

export async function runConversationIntelligence(
  input: ConversationIntelligenceInput,
): Promise<ConversationIntelligenceResult> {
  const executionId = input.executionId ?? randomUUID().replace(/-/g, '').slice(0, 16);
  const startTs     = Date.now();
  const db          = (input.db ?? supabaseAdmin) as SupabaseClient;

  const versions = currentVersionSnapshot();
  const promptVersion = 'v1';
  const schemaKey     = 'lead_analysis';
  const schemaVersion = getLatestSchemaVersion(schemaKey);

  const queueWaitMs = input.jobEnqueuedAt
    ? Date.now() - new Date(input.jobEnqueuedAt).getTime()
    : null;

  safeLog(executionId, 'start', {
    tenantId: input.tenantId, leadId: input.leadId,
    conversationId: input.conversationId, trigger: input.triggeredBy,
  });

  // ── STEP 1: Load conversation messages ──────────────────────────────────
  const { data: messages, error: msgErr } = await db
    .from('messages')
    .select('id, content, direction, sender_name, created_at')
    .eq('conversation_id', input.conversationId)
    .order('created_at', { ascending: true });

  if (msgErr || !messages?.length) {
    return failResult(executionId, startTs, queueWaitMs, 0, `No messages found: ${msgErr?.message ?? 'empty'}`);
  }

  const messageCount = messages.length;
  const currentHash  = computeConversationHash(
    messages.map((m: MessageRow) => ({ id: m.id, content: m.content, direction: m.direction }))
  );

  // ── STEP 2: Load lead + conversation rows ────────────────────────────────
  const [leadResult, convResult, profileResult] = await Promise.all([
    db.from('leads').select('id, lead_score, lead_status, buying_signals, negative_signals, manual_status, ai_confidence').eq('id', input.leadId).single(),
    db.from('conversations').select('id, message_count, created_at').eq('id', input.conversationId).single(),
    db.from('lead_profiles').select('is_repeat_customer').eq('lead_id', input.leadId).maybeSingle(),
  ]);

  const lead: LeadRow = leadResult.data ?? { id: input.leadId, lead_score: 0, lead_status: 'cold', buying_signals: [], negative_signals: [], manual_status: null, ai_confidence: null };
  const conv: ConversationRow = convResult.data ?? { id: input.conversationId, message_count: messageCount, created_at: new Date().toISOString() };
  const isRepeatCustomer = profileResult.data?.is_repeat_customer ?? false;

  // ── STEP 3: Load industry profile ────────────────────────────────────────
  const { data: bizProfile } = await db.from('business_profiles').select('industry').eq('tenant_id', input.tenantId).maybeSingle();
  const industryProfile = normalizeIndustry(bizProfile?.industry);

  // ── STEP 4: Run Tier 1 Rule Engine (no user message — full signal re-eval not applicable here;
  //   rule engine already ran in webhook. We just need existing scores.) ────
  const ruleScore      = lead.lead_score;
  const allSignals     = lead.buying_signals ?? [];
  const ruleStatus     = (lead.lead_status as LeadStatus) ?? 'cold';

  // ── STEP 5: Load existing AI state for incremental analysis ─────────────
  const { data: lastAnalysis } = await db
    .from('lead_ai_analysis')
    .select('id, prompt_version, schema_version, conversation_hash, buying_intent, confidence, created_at')
    .eq('conversation_id', input.conversationId)
    .eq('is_replay', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: convState } = await db
    .from('conversation_state')
    .select('*')
    .eq('conversation_id', input.conversationId)
    .maybeSingle();

  // ── STEP 6: Check cost optimizer ─────────────────────────────────────────
  const hashChanged  = conversationHashChanged(lastAnalysis?.conversation_hash, currentHash);
  const costDecision = shouldRunAIAnalysis('', {
    conversationHashChanged: hashChanged,
    aiEnabled:               true,
    messageCount,
    timeSinceLastAnalysis:   lastAnalysis
      ? Math.floor((Date.now() - new Date(lastAnalysis.created_at).getTime()) / 60000)
      : undefined,
  });

  if (!costDecision.shouldRunAI) {
    safeLog(executionId, `skipped by cost optimizer: ${costDecision.skipReason}`);
    recordCall({ tenantId: input.tenantId, provider: 'gemini', model: 'gemini-2.0-flash', tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0, cacheHit: costDecision.skipReason === 'cache_hit', skipped: true, skipReason: costDecision.skipReason ?? undefined });

    // Still run decision engine with existing data
    const lastAI = await loadLastAIAnalysis(db, input.conversationId);
    return buildSkippedResult(executionId, startTs, queueWaitMs, ruleScore, ruleStatus, lead, lastAI, industryProfile, isRepeatCustomer, allSignals, messageCount, costDecision.skipReason === 'cache_hit');
  }

  // ── STEP 7: Build conversation snapshot ──────────────────────────────────
  const lastCtx = lastAnalysis ? {
    analysisId:              lastAnalysis.id,
    promptVersion:           lastAnalysis.prompt_version,
    schemaVersion:           lastAnalysis.schema_version,
    messageCountAtAnalysis:  convState?.message_count_at_analysis ?? 0,
    conversationHash:        lastAnalysis.conversation_hash,
  } : null;

  const forceRebuild = shouldForceFullRebuild(lastCtx, promptVersion, schemaVersion, currentHash);
  const snapshot = buildConversationSnapshot(
    messages.map((m: MessageRow) => ({ id: m.id, content: m.content, direction: m.direction, senderName: m.sender_name, createdAt: m.created_at })),
    lastCtx,
    promptVersion,
    schemaVersion,
    currentHash,
    { forceFullRebuild: forceRebuild },
  );

  // ── STEP 8: Load conversation memory ────────────────────────────────────
  const { data: convMemory } = await db
    .from('conversation_memory')
    .select('*')
    .eq('conversation_id', input.conversationId)
    .maybeSingle();

  // ── STEP 9: Load prompt + schema ────────────────────────────────────────
  const promptRecord = getPrompt(industryProfile, 'conversation_analysis', promptVersion);

  // ── STEP 10: Call AI provider ────────────────────────────────────────────
  let aiAnalysis:       GeminiConversationAnalysis | null = null;
  let aiLatencyMs       = 0;
  let tokensIn          = 0;
  let tokensOut         = 0;
  let estimatedCostUsd  = 0;
  let parsingErrors:    string[] = [];
  let cacheHit          = false;
  let fallbackLevel:    FallbackLevel = 0;
  let errorMessage:     string | null = null;
  let analysisId:       string | null = null;

  try {
    const provider = getDefaultProvider();
    const aiStart  = Date.now();

    const aiResponse = await provider.analyze({
      executionId,
      conversationSnapshot:  snapshot,
      systemPrompt:          promptRecord.systemPrompt,
      userPromptTemplate:    promptRecord.userPromptTemplate,
      responseSchemaKey:     schemaKey,
      schemaVersion,
      conversationMemory:    convMemory ?? null,
      tenantId:              input.tenantId,
      leadId:                input.leadId,
      conversationId:        input.conversationId,
      industry:              industryProfile,
      promptVersion,
      promptKey:             'conversation_analysis',
    });

    aiLatencyMs      = aiResponse.latencyMs;
    tokensIn         = aiResponse.tokensIn;
    tokensOut        = aiResponse.tokensOut;
    estimatedCostUsd = aiResponse.estimatedCostUsd;
    parsingErrors    = aiResponse.parsingErrors;
    cacheHit         = aiResponse.cacheHit;
    aiAnalysis       = aiResponse.parsed;

    safeLog(executionId, 'AI complete', {
      latencyMs: aiLatencyMs, tokens: tokensIn + tokensOut,
      cost: estimatedCostUsd.toFixed(5), stage: aiAnalysis?.salesStage,
      buyingIntent: aiAnalysis?.buyingIntent,
    });

  } catch (err) {
    const error = err as Error;
    errorMessage = error.message;
    safeLog(executionId, `AI error: ${error.message}`);

    const fallback = determineFallback({
      error,
      retryCount:        0,
      maxRetries:        3,
      jobId:             input.jobId ?? executionId,
      tenantId:          input.tenantId,
      leadId:            input.leadId,
      hasCachedAnalysis: !!lastAnalysis,
      hasRuleScore:      ruleScore > 0,
    });
    fallbackLevel = fallback.fallbackLevel;

    // Use cached AI analysis if available
    if (fallback.source === 'cache' && lastAnalysis) {
      aiAnalysis = await loadLastAIAnalysis(db, input.conversationId);
      cacheHit   = true;
    }

    if (fallback.shouldRetry) {
      throw new Error(`RETRY:${fallback.retryAfterMs}:${error.message}`);
    }
  }

  // ── STEP 11: Run Decision Engine ─────────────────────────────────────────
  const aiConfidence = aiAnalysis?.confidence ?? 0;
  const decision     = runDecisionEngine({
    ruleScore,
    ruleStatus,
    allBuyingSignals: allSignals,
    prevFinalStatus:  lead.lead_status,
    aiAnalysis,
    aiConfidence,
    industryProfile,
    isRepeatCustomer,
    messageCount,
  });

  safeLog(executionId, 'decision', {
    rule: ruleScore, composite: decision.finalScore,
    status: decision.finalStatus, method: decision.compositeMethod,
  });

  // ── STEP 12: Build explainability ────────────────────────────────────────
  const { data: scoreBreakdownRow } = await db
    .from('leads')
    .select('score_breakdown, scoring_reasoning')
    .eq('id', input.leadId)
    .single();

  const ruleCtx = {
    lead_score:          ruleScore,
    prev_score:          ruleScore,
    lead_status:         decision.finalStatus,
    prev_status:         lead.lead_status,
    all_buying_signals:  allSignals,
    new_signals:         [],
    score_breakdown:     scoreBreakdownRow?.score_breakdown ?? {},
    scoring_reasoning:   scoreBreakdownRow?.scoring_reasoning ?? '',
  };

  const explainability = buildExplainability(ruleCtx, aiAnalysis, toDecisionContext(decision), messageCount);

  // ── STEP 13: Generate recommendation ────────────────────────────────────
  const recommendation = getRecommendation(
    industryProfile, allSignals, decision.finalStatus,
    decision.finalScore, aiAnalysis?.momentum ?? 'Stable',
  );

  // ── STEP 14: Compute momentum trend ─────────────────────────────────────
  const { data: recentIntents } = await db
    .from('lead_ai_analysis')
    .select('buying_intent')
    .eq('conversation_id', input.conversationId)
    .eq('is_replay', false)
    .order('created_at', { ascending: false })
    .limit(5);

  const intentValues = (recentIntents ?? []).map((r: { buying_intent: number }) => r.buying_intent).reverse();
  if (aiAnalysis) intentValues.push(aiAnalysis.buyingIntent);
  const computedMomentum = computeMomentum(intentValues);

  // ── STEP 15: Persist lead_ai_analysis ───────────────────────────────────
  try {
    const analysisRow = {
      tenant_id:       input.tenantId,
      lead_id:         input.leadId,
      conversation_id: input.conversationId,
      analysis_type:   'conversation' as const,
      analysis_trigger: input.triggeredBy,

      buying_intent:          aiAnalysis?.buyingIntent          ?? 0,
      urgency_score:          aiAnalysis?.urgency               ?? 0,
      trust_score:            aiAnalysis?.trust                 ?? 0,
      engagement_score:       aiAnalysis?.engagement            ?? 0,
      budget_score:           aiAnalysis?.budgetScore           ?? 0,
      commitment_score:       aiAnalysis?.commitment            ?? 0,
      negotiation_score:      aiAnalysis?.negotiation           ?? 0,
      conversation_quality:   aiAnalysis?.conversationQuality   ?? 0,
      conversion_probability: aiAnalysis?.conversionProbability ?? 0,

      budget_sensitivity: aiAnalysis?.budgetSensitivity ?? 'Unknown',
      sales_stage:        aiAnalysis?.salesStage        ?? 'Unknown',
      momentum:           computedMomentum,

      intent_history:    aiAnalysis?.intentHistory   ?? [],
      objections:        aiAnalysis?.objections      ?? [],
      detected_signals:  aiAnalysis?.detectedSignals ?? [],
      missing_signals:   aiAnalysis?.missingSignals  ?? [],
      key_moments:       aiAnalysis?.keyMoments      ?? [],
      group_booking:     aiAnalysis?.groupBooking    ?? false,
      group_size:        aiAnalysis?.groupSize       ?? null,

      explanation:       aiAnalysis?.explanation      ?? explainability.sales_summary,
      recommendation:    recommendation.summary,
      why_hot:           explainability.why_hot,
      why_not_qualified: explainability.why_not_qualified,
      sales_summary:     explainability.sales_summary,

      confidence:                   aiAnalysis?.confidence                ?? 0,
      intent_confidence:            aiAnalysis?.intentConfidence          ?? 0,
      stage_confidence:             aiAnalysis?.stageConfidence           ?? 0,
      recommendation_confidence:    aiAnalysis?.recommendationConfidence  ?? 0,
      buying_intent_confidence:     aiAnalysis?.buyingIntentConfidence    ?? 0,
      entity_extraction_confidence: aiAnalysis?.entityExtractionConfidence ?? 0,
      decision_confidence:          Math.round(decision.aiWeightApplied * 100),

      ...versions,
      prompt_version: promptVersion,
      schema_version: schemaVersion,

      provider:           'gemini',
      model:              'gemini-2.0-flash',
      tokens_in:          tokensIn,
      tokens_out:         tokensOut,
      estimated_cost_usd: estimatedCostUsd,
      latency_ms:         aiLatencyMs,

      was_incremental:            snapshot.useIncremental,
      incremental_message_count:  snapshot.incrementalMessages.length,
      full_context_message_count: messageCount,

      conversation_hash: currentHash,
      cache_hit:         cacheHit,
      fallback_level:    fallbackLevel,

      execution_id:   executionId,
      queue_wait_ms:  queueWaitMs,
      processing_ms:  Date.now() - startTs,
      retry_count:    0,
      parsing_errors: parsingErrors,
      is_replay:      false,
    };

    const { data: inserted, error: insertErr } = await db
      .from('lead_ai_analysis')
      .insert(analysisRow)
      .select('id')
      .single();

    if (insertErr) {
      safeLog(executionId, `lead_ai_analysis insert error: ${insertErr.message}`);
    } else {
      analysisId = inserted.id;
    }
  } catch (e) {
    safeLog(executionId, `lead_ai_analysis persist error: ${(e as Error).message}`);
  }

  // ── STEP 16: Update conversation_state (ephemeral — overwrite) ──────────
  try {
    await db.from('conversation_state').upsert({
      tenant_id:       input.tenantId,
      lead_id:         input.leadId,
      conversation_id: input.conversationId,
      current_stage:   aiAnalysis?.salesStage        ?? convState?.current_stage ?? 'Awareness',
      current_momentum: computedMomentum,
      momentum_trend:  intentValues.slice(-5),
      current_intent:  aiAnalysis?.intentHistory?.[0] ?? null,
      current_buying_intent: aiAnalysis?.buyingIntent ?? 0,
      negotiation_state:    aiAnalysis?.negotiationState ?? 'none',
      current_objections:   aiAnalysis?.objections      ?? [],
      last_analysis_id:     analysisId,
      last_analyzed_at:     new Date().toISOString(),
      conversation_hash:    currentHash,
      message_count_at_analysis: messageCount,
      updated_at:      new Date().toISOString(),
    }, { onConflict: 'conversation_id' });
  } catch (e) {
    safeLog(executionId, `conversation_state upsert error: ${(e as Error).message}`);
  }

  // ── STEP 17: Update conversation_memory (accumulate — never overwrite) ───
  if (aiAnalysis?.memoryUpdates && Object.keys(aiAnalysis.memoryUpdates).length > 0) {
    try {
      const mu = aiAnalysis.memoryUpdates;
      const memPatch: Record<string, unknown> = {
        tenant_id:       input.tenantId,
        lead_id:         input.leadId,
        conversation_id: input.conversationId,
        facts_extracted_by: 'ai',
        updated_at:      new Date().toISOString(),
      };
      if (mu.customerName)           memPatch.customer_name             = mu.customerName;
      if (mu.language)               memPatch.language                  = mu.language;
      if (mu.communicationPreference) memPatch.communication_preference = mu.communicationPreference;
      if (mu.travellingWithFamily !== undefined) memPatch.travelling_with_family = mu.travellingWithFamily;
      if (mu.groupSize)              memPatch.group_size                = mu.groupSize;
      if (mu.groupComposition)       memPatch.group_composition         = mu.groupComposition;
      if (mu.budgetMin)              memPatch.budget_range_min          = mu.budgetMin;
      if (mu.budgetMax)              memPatch.budget_range_max          = mu.budgetMax;
      if (mu.preferredDestination)   memPatch.preferred_destination     = mu.preferredDestination;
      if (mu.preferredTravelMonth)   memPatch.preferred_travel_month    = mu.preferredTravelMonth;
      if (mu.discountRequested)      memPatch.discount_requested        = mu.discountRequested;
      if (mu.priceSensitivity)       memPatch.price_sensitivity         = mu.priceSensitivity;
      if (mu.knownObjections?.length)   memPatch.known_objections  = mu.knownObjections;
      if (mu.knownPreferences?.length)  memPatch.known_preferences = mu.knownPreferences;

      await db.from('conversation_memory').upsert(memPatch, { onConflict: 'conversation_id' });
    } catch (e) {
      safeLog(executionId, `conversation_memory upsert error: ${(e as Error).message}`);
    }
  }

  // ── STEP 18: Update leads AI summary columns ─────────────────────────────
  try {
    await db.from('leads').update({
      lead_score:              decision.finalScore,
      lead_status:             decision.finalStatus,
      auto_status:             decision.finalStatus,
      ai_buying_intent:        aiAnalysis?.buyingIntent          ?? null,
      ai_urgency:              aiAnalysis?.urgency               ?? null,
      ai_trust:                aiAnalysis?.trust                 ?? null,
      ai_engagement:           aiAnalysis?.engagement            ?? null,
      ai_conversion_probability: aiAnalysis?.conversionProbability ?? null,
      ai_sales_stage:          aiAnalysis?.salesStage            ?? null,
      ai_confidence:           aiConfidence,
      ai_momentum:             computedMomentum,
      ai_objections:           aiAnalysis?.objections            ?? null,
      ai_recommendation:       recommendation.summary,
      ai_explanation:          aiAnalysis?.explanation           ?? null,
      ai_last_analyzed_at:     new Date().toISOString(),
      ai_group_booking:        aiAnalysis?.groupBooking          ?? null,
      ai_group_size:           aiAnalysis?.groupSize             ?? null,
      last_activity_at:        new Date().toISOString(),
    }).eq('id', input.leadId);
  } catch (e) {
    safeLog(executionId, `leads update error: ${(e as Error).message}`);
  }

  // ── STEP 19: Persist recommendation_history ──────────────────────────────
  let recommendationId: string | null = null;
  try {
    const { data: recRow, error: recErr } = await db.from('recommendation_history').insert({
      tenant_id:       input.tenantId,
      lead_id:         input.leadId,
      conversation_id: input.conversationId,
      analysis_id:     analysisId,
      title:           recommendation.primary_action.title,
      summary:         recommendation.summary,
      suggested_action: recommendation.primary_action.description,
      priority:        recommendation.priority,
      expected_impact: recommendation.expected_impact,
      reason:          recommendation.reason,
      confidence:      recommendation.confidence,
      automation_eligible: recommendation.automation_eligible,
      estimated_close_probability_improvement: recommendation.estimated_close_probability_improvement,
      channel:         recommendation.primary_action.channel,
      generated_by:    aiAnalysis ? 'ai' : 'rule_engine',
    }).select('id').single();
    if (!recErr) recommendationId = recRow.id;
  } catch (e) {
    safeLog(executionId, `recommendation_history insert error: ${(e as Error).message}`);
  }

  // ── STEP 20: Append conversation_event ───────────────────────────────────
  try {
    await db.from('conversation_events').insert({
      tenant_id:       input.tenantId,
      lead_id:         input.leadId,
      conversation_id: input.conversationId,
      event_type:      'ai_analysis_complete',
      event_category:  'ai',
      score_delta:     decision.finalScore - ruleScore,
      new_score:       decision.finalScore,
      old_score:       ruleScore,
      new_value:       decision.finalStatus,
      old_value:       lead.lead_status,
      label:           `AI analysis: ${aiAnalysis?.salesStage ?? 'Unknown'} stage, intent=${aiAnalysis?.buyingIntent ?? 0}`,
      metadata:        { executionId, compositeMethod: decision.compositeMethod, aiConfidence, analysisId, fallbackLevel },
      triggered_by:    'ai' as const,
      signal_engine_version:   versions.signal_engine_version,
      decision_engine_version: versions.decision_engine_version,
    });
  } catch (e) {
    safeLog(executionId, `conversation_events insert error: ${(e as Error).message}`);
  }

  // ── STEP 21: Track cost ──────────────────────────────────────────────────
  recordCall({
    tenantId: input.tenantId, provider: 'gemini', model: 'gemini-2.0-flash',
    tokensIn, tokensOut, costUsd: estimatedCostUsd, latencyMs: aiLatencyMs,
    cacheHit, skipped: false, leadId: input.leadId, conversationId: input.conversationId,
    executionId,
  });

  const totalLatencyMs = Date.now() - startTs;
  safeLog(executionId, 'complete', {
    totalMs: totalLatencyMs, aiMs: aiLatencyMs,
    finalStatus: decision.finalStatus, finalScore: decision.finalScore,
    fallback: fallbackLevel,
  });

  return {
    success:          errorMessage === null || fallbackLevel <= 1,
    executionId,
    fallbackLevel,
    ruleScore,
    finalScore:       decision.finalScore,
    finalStatus:      decision.finalStatus,
    buyingIntent:     aiAnalysis?.buyingIntent ?? 0,
    decision,
    aiAnalysis,
    explainability,
    recommendation,
    analysisId,
    recommendationId,
    totalLatencyMs,
    aiLatencyMs,
    queueWaitMs,
    estimatedCostUsd,
    tokensUsed:       tokensIn + tokensOut,
    cacheHit,
    wasIncremental:   snapshot.useIncremental,
    messageCount,
    parsingErrors,
    errorMessage,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function loadLastAIAnalysis(db: SupabaseClient, conversationId: string): Promise<GeminiConversationAnalysis | null> {
  const { data } = await db
    .from('lead_ai_analysis')
    .select('buying_intent, urgency_score, trust_score, engagement_score, budget_score, commitment_score, negotiation_score, conversation_quality, conversion_probability, confidence, sales_stage, momentum, objections, detected_signals, missing_signals, key_moments, intent_history, group_booking, group_size, explanation, recommendation')
    .eq('conversation_id', conversationId)
    .eq('is_replay', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    buyingIntent: data.buying_intent, urgency: data.urgency_score, trust: data.trust_score,
    engagement: data.engagement_score, budgetScore: data.budget_score, commitment: data.commitment_score,
    negotiation: data.negotiation_score, conversationQuality: data.conversation_quality,
    conversionProbability: data.conversion_probability, confidence: data.confidence,
    intentConfidence: 0, stageConfidence: 0, recommendationConfidence: 0,
    buyingIntentConfidence: 0, entityExtractionConfidence: 0,
    budgetSensitivity: 'Unknown', salesStage: data.sales_stage ?? 'Unknown',
    momentum: data.momentum ?? 'Stable', negotiationState: 'none',
    intentHistory: data.intent_history ?? [], groupBooking: data.group_booking ?? false,
    groupSize: data.group_size ?? null, objections: data.objections ?? [],
    detectedSignals: data.detected_signals ?? [], missingSignals: data.missing_signals ?? [],
    keyMoments: data.key_moments ?? [], explanation: data.explanation ?? '',
    recommendation: data.recommendation ?? '', whyHot: '', whyNotQualified: '', salesSummary: '',
    recommendationPriority: 'medium', expectedImpact: '', recommendationReason: '',
    automationEligible: false, estimatedCloseProbImprovement: 0, memoryUpdates: {},
  };
}

function failResult(
  executionId: string, startTs: number, queueWaitMs: number | null,
  ruleScore: number, error: string,
): ConversationIntelligenceResult {
  return {
    success: false, executionId, fallbackLevel: 2,
    ruleScore, finalScore: ruleScore, finalStatus: 'cold', buyingIntent: 0,
    decision: null, aiAnalysis: null, explainability: null, recommendation: null,
    analysisId: null, recommendationId: null,
    totalLatencyMs: Date.now() - startTs, aiLatencyMs: 0, queueWaitMs,
    estimatedCostUsd: 0, tokensUsed: 0, cacheHit: false,
    wasIncremental: false, messageCount: 0,
    parsingErrors: [], errorMessage: error,
  };
}

function buildSkippedResult(
  executionId: string, startTs: number, queueWaitMs: number | null,
  ruleScore: number, ruleStatus: LeadStatus, lead: LeadRow,
  aiAnalysis: GeminiConversationAnalysis | null,
  industryProfile: import('./industry-profiles').IndustryProfile,
  isRepeatCustomer: boolean, allSignals: string[], messageCount: number, cacheHit: boolean,
): ConversationIntelligenceResult {
  const decision = runDecisionEngine({
    ruleScore, ruleStatus, allBuyingSignals: allSignals, prevFinalStatus: lead.lead_status,
    aiAnalysis, aiConfidence: aiAnalysis?.confidence ?? 0,
    industryProfile, isRepeatCustomer, messageCount,
  });
  const recommendation = getRecommendation(industryProfile, allSignals, decision.finalStatus, decision.finalScore, aiAnalysis?.momentum ?? 'Stable');
  return {
    success: true, executionId, fallbackLevel: 1,
    ruleScore, finalScore: decision.finalScore, finalStatus: decision.finalStatus,
    buyingIntent: aiAnalysis?.buyingIntent ?? 0,
    decision, aiAnalysis, explainability: null, recommendation,
    analysisId: null, recommendationId: null,
    totalLatencyMs: Date.now() - startTs, aiLatencyMs: 0, queueWaitMs,
    estimatedCostUsd: 0, tokensUsed: 0, cacheHit,
    wasIncremental: false, messageCount, parsingErrors: [], errorMessage: null,
  };
}
