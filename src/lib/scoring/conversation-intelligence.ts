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
import { contactDisplayName }        from '@/lib/utils/contact-name';
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
  GeminiConversationAnalysis, GeminiConversationAnalysisV2, ConversationState, ConversationMemory,
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
  aiAnalysis:    GeminiConversationAnalysis | GeminiConversationAnalysisV2 | null;

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
  sender_id: string | null;
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
  channel?: string;
  source_detail?: string;
  name?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  manual_override?: boolean;
  manual_stage?: string;
  last_activity_at?: string;
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
  const promptVersion = 'v2';
  const schemaKey     = 'lead_analysis';
  const schemaVersion = 'v2';

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
    .select('id, content, direction, sender_id, created_at')
    .eq('conversation_id', input.conversationId)
    .order('created_at', { ascending: true });

  if (msgErr || !messages?.length) {
    return failResult(executionId, startTs, queueWaitMs, 0, `No messages found: ${msgErr?.message ?? 'empty'}`);
  }

  const messageCount = messages.length;
  const currentHash  = computeConversationHash(
    messages.map((m: MessageRow) => ({ id: m.id, content: m.content, direction: m.direction }))
  );

  // ── STEP 2: Load lead + conversation rows + metadata ─────────────────────
  const [leadResult, convResult, profileResult, knowledgeDocsRes, bookingsRes, shopifyRes] = await Promise.all([
    db.from('leads').select('id, lead_score, lead_status, buying_signals, negative_signals, manual_status, ai_confidence, channel, source_detail, name, phone, email, tags, manual_override, manual_stage, last_activity_at').eq('id', input.leadId).single(),
    db.from('conversations').select('id, message_count, created_at').eq('id', input.conversationId).single(),
    db.from('lead_profiles').select('is_repeat_customer').eq('lead_id', input.leadId).maybeSingle(),
    db.from('knowledge_docs').select('filename, content_text').eq('tenant_id', input.tenantId),
    db.from('bookings').select('booking_date, booking_time, guest_count, status').eq('lead_id', input.leadId).order('booking_date', { ascending: false }),
    db.from('shopify_events').select('event_type, order_value, created_at').eq('lead_id', input.leadId).order('created_at', { ascending: false }),
  ]);

  const lead: LeadRow = leadResult.data ?? { id: input.leadId, lead_score: 0, lead_status: 'cold', buying_signals: [], negative_signals: [], manual_status: null, ai_confidence: null };
  const conv: ConversationRow = convResult.data ?? { id: input.conversationId, message_count: messageCount, created_at: new Date().toISOString() };
  const isRepeatCustomer = profileResult.data?.is_repeat_customer ?? false;

  const knowledgeBase = knowledgeDocsRes.data?.map(k => `[File: ${k.filename}]\n${k.content_text}`).join('\n\n') || 'No business knowledge docs loaded.';
  const pastHistoryBookings = bookingsRes.data?.map(b => `- Date: ${b.booking_date} ${b.booking_time}, Guest count: ${b.guest_count}, Status: ${b.status}`).join('\n') || 'None';
  const pastHistoryOrders = shopifyRes.data?.map(s => `- Event: ${s.event_type}, Value: ${s.order_value}, Date: ${s.created_at}`).join('\n') || 'None';
  const pastHistory = `Bookings:\n${pastHistoryBookings}\n\nOrders/Shopify Events:\n${pastHistoryOrders}`;
  const campaignSource = `Channel: ${lead.channel || 'unknown'}, Detail: ${lead.source_detail || 'none'}`;
  const customerMetadata = `Name: ${contactDisplayName(lead.name, lead.phone)}, Phone: ${lead.phone || 'Unknown'}, Email: ${lead.email || 'Unknown'}, Tags: ${JSON.stringify(lead.tags || [])}`;

  // Calculate average response delay
  let avgDelayMins = null;
  let totalDelayMs = 0;
  let delayCount = 0;
  for (let i = 1; i < messages.length; i++) {
    const prev = new Date(messages[i-1].created_at).getTime();
    const curr = new Date(messages[i].created_at).getTime();
    if (messages[i].direction === 'inbound' && messages[i-1].direction === 'outbound') {
      totalDelayMs += (curr - prev);
      delayCount++;
    }
  }
  if (delayCount > 0) {
    avgDelayMins = Math.round(totalDelayMs / (delayCount * 60000));
  }
  const messageTiming = `Total Messages: ${messages.length}, Avg Response Delay: ${avgDelayMins !== null ? avgDelayMins + ' minutes' : 'Unknown'}`;

  // ── STEP 3: Load industry profile ────────────────────────────────────────
  const { data: bizProfile } = await db.from('business_profiles').select('industry').eq('tenant_id', input.tenantId).maybeSingle();
  const industryProfile = normalizeIndustry(bizProfile?.industry);

  // ── STEP 4: Run Tier 1 Rule Engine ───────────────────────────────────────
  // Run rule engine with latest loaded metadata to compute the score delta correctly
  const ruleEngineResult = calculateLeadScore({
    userMessage: messages[messages.length - 1]?.content ?? '',
    aiResponse: {
      stage: lead.lead_status as any,
      score: lead.lead_score ?? 0,
      confidence: lead.ai_confidence ?? 0,
      intent: 'unknown',
    },
    conversation: {
      message_count: messageCount,
      created_at: conv.created_at,
    },
    lead: {
      lead_score: lead.lead_score,
      lead_status: lead.lead_status,
      manual_status: lead.manual_status,
      manual_override: lead.manual_override,
      manual_stage: lead.manual_stage,
      buying_signals: lead.buying_signals,
      negative_signals: lead.negative_signals,
      tags: lead.tags,
      is_repeat_customer: isRepeatCustomer,
      past_bookings_count: bookingsRes.data?.length || 0,
      last_activity_at: lead.last_activity_at,
    },
    industryProfile,
  });

  const ruleScore      = ruleEngineResult.lead_score;
  const allSignals     = ruleEngineResult.all_buying_signals;
  const ruleStatus     = ruleEngineResult.lead_status;

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
    messages.map((m: MessageRow) => ({ id: m.id, content: m.content, direction: m.direction, senderName: m.sender_id, createdAt: m.created_at })),
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
  let aiAnalysis:       GeminiConversationAnalysis | GeminiConversationAnalysisV2 | null = null;
  let isV2              = false;
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
      businessType:          industryProfile,
      knowledgeBase,
      pastHistory,
      campaignSource,
      customerMetadata,
      messageTiming,
    });

    aiLatencyMs      = aiResponse.latencyMs;
    tokensIn         = aiResponse.tokensIn;
    tokensOut        = aiResponse.tokensOut;
    estimatedCostUsd = aiResponse.estimatedCostUsd;
    parsingErrors    = aiResponse.parsingErrors;
    cacheHit         = aiResponse.cacheHit;
    aiAnalysis       = aiResponse.parsed;

    isV2 = !!(aiAnalysis && 'stage' in aiAnalysis);
    safeLog(executionId, 'AI complete', {
      latencyMs: aiLatencyMs, tokens: tokensIn + tokensOut,
      cost: estimatedCostUsd.toFixed(5), 
      stage: isV2 ? (aiAnalysis as any).stage : (aiAnalysis as any)?.salesStage,
      buyingIntent: isV2 ? (aiAnalysis as any).score : (aiAnalysis as any)?.buyingIntent,
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
    decision.finalScore, isV2 ? 'Stable' : (aiAnalysis as GeminiConversationAnalysis)?.momentum ?? 'Stable',
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
  if (aiAnalysis) intentValues.push(isV2 ? (aiAnalysis as GeminiConversationAnalysisV2).score : (aiAnalysis as GeminiConversationAnalysis).buyingIntent);
  const computedMomentum = computeMomentum(intentValues);

  const v1 = isV2 ? null : (aiAnalysis as GeminiConversationAnalysis);
  const v2 = isV2 ? (aiAnalysis as GeminiConversationAnalysisV2) : null;

  const buyingIntentVal = isV2 ? v2!.score : v1?.buyingIntent ?? 0;
  const urgencyVal = isV2 ? 0 : v1?.urgency ?? 0;
  const trustVal = isV2 ? 0 : v1?.trust ?? 0;
  const engagementVal = isV2 ? v2!.score : v1?.engagement ?? 0;
  const budgetVal = isV2 ? 0 : v1?.budgetScore ?? 0;
  const commitmentVal = isV2 ? 0 : v1?.commitment ?? 0;
  const negotiationVal = isV2 ? 0 : v1?.negotiation ?? 0;
  const qualityVal = isV2 ? 0 : v1?.conversationQuality ?? 0;
  const conversionVal = isV2 ? v2!.booking_probability : v1?.conversionProbability ?? 0;
  const salesStageVal = isV2 ? v2!.stage : v1?.salesStage ?? 'Unknown';
  const intentHistoryVal = isV2 ? [v2!.intent] : v1?.intentHistory ?? [];
  const objectionsVal = isV2 ? [] : v1?.objections ?? [];
  const detectedSignalsVal = isV2 ? [] : v1?.detectedSignals ?? [];
  const missingSignalsVal = isV2 ? [] : v1?.missingSignals ?? [];
  const keyMomentsVal = isV2 ? [] : v1?.keyMoments ?? [];
  const groupBookingVal = false;
  const groupSizeVal = null;
  const explanationVal = isV2 ? v2!.explanation : v1?.explanation ?? '';
  const confidenceVal = isV2 ? v2!.confidence : v1?.confidence ?? 0;
  const negotiationStateVal = isV2 ? 'none' : v1?.negotiationState ?? 'none';

  // ── STEP 15: Persist lead_ai_analysis ───────────────────────────────────
  try {
    const analysisRow = {
      tenant_id:       input.tenantId,
      lead_id:         input.leadId,
      conversation_id: input.conversationId,
      analysis_type:   'conversation' as const,
      analysis_trigger: input.triggeredBy,

      buying_intent:          buyingIntentVal,
      urgency_score:          urgencyVal,
      trust_score:            trustVal,
      engagement_score:       engagementVal,
      budget_score:           budgetVal,
      commitment_score:       commitmentVal,
      negotiation_score:      negotiationVal,
      conversation_quality:   qualityVal,
      conversion_probability: conversionVal,

      budget_sensitivity: 'Unknown',
      sales_stage:        salesStageVal,
      momentum:           computedMomentum,

      intent_history:    intentHistoryVal,
      objections:        objectionsVal,
      detected_signals:  detectedSignalsVal,
      missing_signals:   missingSignalsVal,
      key_moments:       keyMomentsVal,
      group_booking:     groupBookingVal,
      group_size:        groupSizeVal,

      explanation:       explanationVal || explainability.sales_summary,
      recommendation:    recommendation.summary,
      why_hot:           explainability.why_hot,
      why_not_qualified: explainability.why_not_qualified,
      sales_summary:     explainability.sales_summary,

      confidence:                   confidenceVal,
      intent_confidence:            isV2 ? confidenceVal : v1?.intentConfidence ?? 0,
      stage_confidence:             isV2 ? confidenceVal : v1?.stageConfidence ?? 0,
      recommendation_confidence:    isV2 ? confidenceVal : v1?.recommendationConfidence ?? 0,
      buying_intent_confidence:     isV2 ? confidenceVal : v1?.buyingIntentConfidence ?? 0,
      entity_extraction_confidence: isV2 ? confidenceVal : v1?.entityExtractionConfidence ?? 0,
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
      is_replay:                  false,
    };

    const { data: row, error: insertErr } = await db
      .from('lead_ai_analysis')
      .insert(analysisRow)
      .select('id')
      .single();

    if (insertErr) throw insertErr;
    analysisId = row.id;
  } catch (e) {
    safeLog(executionId, `lead_ai_analysis insert error: ${(e as Error).message}`);
  }

  // ── STEP 16: Update conversation_state (ephemeral — overwrite) ──────────
  try {
    await db.from('conversation_state').upsert({
      tenant_id:       input.tenantId,
      lead_id:         input.leadId,
      conversation_id: input.conversationId,
      current_stage:   salesStageVal ?? convState?.current_stage ?? 'Awareness',
      current_momentum: computedMomentum,
      momentum_trend:  intentValues.slice(-5),
      current_intent:  intentHistoryVal[0] ?? null,
      current_buying_intent: buyingIntentVal,
      negotiation_state:    negotiationStateVal,
      current_objections:   objectionsVal,
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
  if (!isV2 && v1?.memoryUpdates && Object.keys(v1.memoryUpdates).length > 0) {
    try {
      const mu = v1.memoryUpdates;
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
    isV2 = !!(aiAnalysis && 'stage' in aiAnalysis);
    const v2_stage = isV2 ? (aiAnalysis as any).stage : (aiAnalysis as any)?.salesStage;
    const v2_score = isV2 ? (aiAnalysis as any).score : decision.finalScore;
    const v2_confidence = isV2 ? (aiAnalysis as any).confidence : aiConfidence;
    const v2_reason = isV2 ? (aiAnalysis as any).reason : decision.reasoning;
    const v2_summary = isV2 ? (aiAnalysis as any).summary : (aiAnalysis as any)?.salesSummary;
    const v2_intent = isV2 ? (aiAnalysis as any).intent : ((aiAnalysis as any)?.intentHistory?.[0] || '');
    const v2_sentiment = isV2 ? (aiAnalysis as any).sentiment : 'neutral';
    const v2_qualification = isV2 ? (aiAnalysis as any).qualification : ((aiAnalysis as any)?.whyNotQualified || 'unqualified');
    const v2_next_action = isV2 ? (aiAnalysis as any).next_action : (aiAnalysis as any)?.recommendation;
    const v2_booking_probability = isV2 ? (aiAnalysis as any).booking_probability : (aiAnalysis as any)?.conversionProbability;
    const v2_human_probability = isV2 ? (aiAnalysis as any).human_probability : 0;
    const v2_engagement_score = isV2 ? v2_score : (aiAnalysis as any)?.engagement;

    const lastMsg = messages[messages.length - 1];
    const lastActivityType = lastMsg ? (lastMsg.direction === 'inbound' ? 'inbound' : 'outbound') : 'system';
    const lastCustomerMsg = [...messages].reverse().find(m => m.direction === 'inbound')?.content || null;

    await db.from('leads').update({
      lead_score:              v2_score,
      lead_status:             decision.finalStatus,
      auto_status:             decision.finalStatus,
      ai_buying_intent:        isV2 ? (aiAnalysis as any).score : (aiAnalysis as any)?.buyingIntent,
      ai_urgency:              isV2 ? 0 : (aiAnalysis as any)?.urgency,
      ai_trust:                isV2 ? 0 : (aiAnalysis as any)?.trust,
      ai_engagement:           v2_engagement_score,
      ai_conversion_probability: v2_booking_probability,
      ai_sales_stage:          v2_stage,
      ai_confidence:           v2_confidence,
      ai_momentum:             isV2 ? 'Stable' : computedMomentum,
      ai_objections:           isV2 ? [] : (aiAnalysis as any)?.objections,
      ai_recommendation:       v2_next_action,
      ai_explanation:          isV2 ? (aiAnalysis as any).explanation : (aiAnalysis as any)?.explanation,
      ai_last_analyzed_at:     new Date().toISOString(),
      ai_group_booking:        isV2 ? false : (aiAnalysis as any)?.groupBooking,
      ai_group_size:           isV2 ? null : (aiAnalysis as any)?.groupSize,
      
      // New Enterprise CRM AI Columns
      ai_score:                v2_score,
      ai_summary:              v2_summary,
      ai_reason:               v2_reason,
      buying_intent:           isV2 ? (aiAnalysis as any).score : (aiAnalysis as any)?.buyingIntent,
      last_intent:             v2_intent,
      last_ai_scan:            new Date().toISOString(),
      recommended_action:      v2_next_action,
      qualification_status:    v2_qualification,
      booking_probability:     v2_booking_probability,
      human_intervention_probability: v2_human_probability,
      last_activity_type:      lastActivityType,
      last_customer_message:   lastCustomerMsg,
      sentiment:               v2_sentiment,
      engagement_score:        v2_score,
      conversation_depth:      messageCount,
      ai_stage:                decision.finalStatus,
      classification_version:  '2.0',
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
      label:           `AI analysis: ${isV2 ? (aiAnalysis as any).stage : (aiAnalysis as any)?.salesStage ?? 'Unknown'} stage, intent=${isV2 ? (aiAnalysis as any).score : (aiAnalysis as any)?.buyingIntent ?? 0}`,
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
    buyingIntent:     isV2 ? (aiAnalysis as any).score : (aiAnalysis as any)?.buyingIntent ?? 0,
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
  aiAnalysis: GeminiConversationAnalysis | GeminiConversationAnalysisV2 | null,
  industryProfile: import('./industry-profiles').IndustryProfile,
  isRepeatCustomer: boolean, allSignals: string[], messageCount: number, cacheHit: boolean,
): ConversationIntelligenceResult {
  const isV2 = aiAnalysis && 'stage' in aiAnalysis;
  const decision = runDecisionEngine({
    ruleScore, ruleStatus, allBuyingSignals: allSignals, prevFinalStatus: lead.lead_status,
    aiAnalysis, aiConfidence: isV2 ? (aiAnalysis as any).confidence : (aiAnalysis as any)?.confidence ?? 0,
    industryProfile, isRepeatCustomer, messageCount,
  });
  const computedMomentum = isV2 ? 'Stable' : (aiAnalysis as any)?.momentum ?? 'Stable';
  const recommendation = getRecommendation(industryProfile, allSignals, decision.finalStatus, decision.finalScore, computedMomentum);
  return {
    success: true, executionId, fallbackLevel: 1,
    ruleScore, finalScore: decision.finalScore, finalStatus: decision.finalStatus,
    buyingIntent: isV2 ? (aiAnalysis as any).score : (aiAnalysis as any)?.buyingIntent ?? 0,
    decision, aiAnalysis, explainability: null, recommendation,
    analysisId: null, recommendationId: null,
    totalLatencyMs: Date.now() - startTs, aiLatencyMs: 0, queueWaitMs,
    estimatedCostUsd: 0, tokensUsed: 0, cacheHit,
    wasIncremental: false, messageCount, parsingErrors: [], errorMessage: null,
  };
}
