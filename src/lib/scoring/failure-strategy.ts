// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — AI Failure Strategy (REQ 8)
//
// The platform NEVER fails because an AI provider is unavailable.
// Five fallback levels ensure graceful degradation in every failure mode.
//
// Level 1: Cached Analysis   — return last successful analysis
// Level 2: Rule Engine Only  — drop AI, use deterministic rule score
// Level 3: Retry Queue       — re-enqueue for processing in 2–5 min
// Level 4: Dead Letter Queue — escalate for investigation
// Level 5: Manual Review     — notify sales team + create escalation task
// ═══════════════════════════════════════════════════════════════════════════

import type { FallbackLevel } from './types';

// ── Fallback Result ───────────────────────────────────────────────────────

export type FallbackSource = 'cache' | 'rule_engine' | 'retry_queue' | 'dead_letter' | 'manual_review';

export interface FallbackResult {
  fallbackLevel: FallbackLevel;
  source:        FallbackSource;
  reason:        string;
  shouldPersist: boolean;  // should this result be written to lead_ai_analysis?
  shouldRetry:   boolean;  // should the job be re-enqueued?
  retryAfterMs:  number;   // how long to wait before retry (0 = no retry)
  notifyAdmin:   boolean;  // should the operator be notified?
}

// ── Error Classification ──────────────────────────────────────────────────

export type FailureCategory =
  | 'provider_unavailable'   // API down or timeout
  | 'provider_quota'         // rate limit or quota exceeded
  | 'parse_error'            // AI returned invalid JSON
  | 'schema_violation'       // JSON valid but failed schema validation
  | 'auth_error'             // API key invalid or expired
  | 'context_too_long'       // conversation exceeds token limit
  | 'unknown';

export interface FailureContext {
  error:             Error;
  retryCount:        number;
  maxRetries:        number;
  jobId:             string;
  tenantId:          string;
  leadId:            string;
  hasCachedAnalysis: boolean;
  hasRuleScore:      boolean;
}

export function classifyError(error: Error): FailureCategory {
  const msg = error.message.toLowerCase();
  if (msg.includes('401') || msg.includes('403') || msg.includes('api key') || msg.includes('unauthorized')) return 'auth_error';
  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit')) return 'provider_quota';
  if (msg.includes('json parse') || msg.includes('unexpected token')) return 'parse_error';
  if (msg.includes('schema validation') || msg.includes('validation failed')) return 'schema_violation';
  if (msg.includes('context') || msg.includes('token') || msg.includes('too long')) return 'context_too_long';
  if (msg.includes('503') || msg.includes('502') || msg.includes('504') || msg.includes('timeout') || msg.includes('unavailable')) return 'provider_unavailable';
  return 'unknown';
}

// ── Retry Backoff Schedule ────────────────────────────────────────────────

const RETRY_DELAYS_MS = [
  30_000,   // retry 1: 30 seconds
  120_000,  // retry 2: 2 minutes
  300_000,  // retry 3: 5 minutes
];

function retryDelayFor(retryCount: number): number {
  return RETRY_DELAYS_MS[retryCount - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

// ── Main Strategy ─────────────────────────────────────────────────────────

export function determineFallback(ctx: FailureContext): FallbackResult {
  const category = classifyError(ctx.error);

  // Auth errors escalate immediately — retrying won't help
  if (category === 'auth_error') {
    return {
      fallbackLevel: 4,
      source:        'dead_letter',
      reason:        `Auth failure (${ctx.error.message.slice(0, 100)}) — API key may be invalid or expired`,
      shouldPersist: false,
      shouldRetry:   false,
      retryAfterMs:  0,
      notifyAdmin:   true,
    };
  }

  // If still within retry budget, try again with backoff
  if (ctx.retryCount < ctx.maxRetries && category !== 'context_too_long') {
    return {
      fallbackLevel: 3,
      source:        'retry_queue',
      reason:        `${category} on attempt ${ctx.retryCount + 1}/${ctx.maxRetries} — retrying in ${retryDelayFor(ctx.retryCount + 1) / 1000}s`,
      shouldPersist: false,
      shouldRetry:   true,
      retryAfterMs:  retryDelayFor(ctx.retryCount + 1),
      notifyAdmin:   false,
    };
  }

  // Retries exhausted — fall back to cache or rule engine
  if (ctx.hasCachedAnalysis) {
    return {
      fallbackLevel: 1,
      source:        'cache',
      reason:        `${category} — retries exhausted, serving cached analysis`,
      shouldPersist: false,
      shouldRetry:   false,
      retryAfterMs:  0,
      notifyAdmin:   false,
    };
  }

  if (ctx.hasRuleScore) {
    return {
      fallbackLevel: 2,
      source:        'rule_engine',
      reason:        `${category} — no cache available, rule engine only (no AI dimensions)`,
      shouldPersist: true,
      shouldRetry:   false,
      retryAfterMs:  0,
      notifyAdmin:   false,
    };
  }

  // Nothing available — dead letter
  return {
    fallbackLevel: 4,
    source:        'dead_letter',
    reason:        `${category} — no cache, no rule score, no retries left`,
    shouldPersist: false,
    shouldRetry:   false,
    retryAfterMs:  0,
    notifyAdmin:   true,
  };
}

// ── Escalation Checker ────────────────────────────────────────────────────

export function shouldEscalateToManualReview(
  fallbackResult: FallbackResult,
  consecutiveFailuresForTenant: number,
): boolean {
  if (fallbackResult.fallbackLevel >= 4) return true;
  if (consecutiveFailuresForTenant >= 10) return true;
  return false;
}

// ── Log Entry Builder ─────────────────────────────────────────────────────

export interface FailureLogEntry {
  jobId:         string;
  tenantId:      string;
  leadId:        string;
  category:      FailureCategory;
  message:       string;
  retryCount:    number;
  fallbackLevel: FallbackLevel;
  source:        FallbackSource;
  timestamp:     string;
}

export function buildFailureLog(ctx: FailureContext, result: FallbackResult): FailureLogEntry {
  return {
    jobId:         ctx.jobId,
    tenantId:      ctx.tenantId,
    leadId:        ctx.leadId,
    category:      classifyError(ctx.error),
    message:       ctx.error.message.slice(0, 500),
    retryCount:    ctx.retryCount,
    fallbackLevel: result.fallbackLevel,
    source:        result.source,
    timestamp:     new Date().toISOString(),
  };
}
