// ═══════════════════════════════════════════════════════════════════════════
// Lead Intelligence Platform — AI Cost Tracker (REQ 6)
//
// Tracks every token spent, every call skipped, every cache hit.
// Powers: cost per tenant, per lead, per day, monthly totals, cache savings.
// AI ROI becomes measurable — not just cost, but what was saved.
// ═══════════════════════════════════════════════════════════════════════════

export interface AICallRecord {
  tenantId:       string;
  provider:       string;
  model:          string;
  tokensIn:       number;
  tokensOut:      number;
  costUsd:        number;
  latencyMs:      number;
  cacheHit:       boolean;
  skipped:        boolean;
  skipReason?:    string;
  leadId?:        string;
  conversationId?: string;
  executionId?:   string;
}

// ── Per-tenant in-memory aggregation ─────────────────────────────────────
// For production, flush() writes these to the tenant_ai_costs table.
// The in-memory buffer absorbs bursts before the DB write.

interface TenantBucket {
  tenantId:        string;
  provider:        string;
  model:           string;
  date:            string;  // YYYY-MM-DD
  totalCalls:      number;
  skippedCalls:    number;
  cachedCalls:     number;
  failedCalls:     number;
  totalTokensIn:   number;
  totalTokensOut:  number;
  totalCostUsd:    number;
  cacheSavingsUsd: number;
  skipSavingsUsd:  number;
  totalLatencyMs:  number;
}

const _buckets: Map<string, TenantBucket> = new Map();

function bucketKey(tenantId: string, provider: string, model: string, date: string): string {
  return `${tenantId}:${provider}:${model}:${date}`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Cost estimator (offline — no API call) ────────────────────────────────

// Pricing table (per 1M tokens)
const PROVIDER_PRICING: Record<string, { input: number; output: number }> = {
  'gemini:gemini-2.0-flash':         { input: 0.075,  output: 0.30 },
  'gemini:gemini-1.5-pro':           { input: 1.25,   output: 5.00 },
  'claude:claude-sonnet-4-6':        { input: 3.0,    output: 15.0 },
  'openai:gpt-4o':                   { input: 2.5,    output: 10.0 },
  'openai:gpt-4o-mini':              { input: 0.15,   output: 0.60 },
};

export function estimateCost(provider: string, model: string, tokensIn: number, tokensOut: number): number {
  const pricing = PROVIDER_PRICING[`${provider}:${model}`] ?? { input: 0.5, output: 1.5 };
  return (tokensIn / 1_000_000) * pricing.input + (tokensOut / 1_000_000) * pricing.output;
}

// ── Record a call ─────────────────────────────────────────────────────────

export function recordCall(record: AICallRecord): void {
  const date = todayStr();
  const k    = bucketKey(record.tenantId, record.provider, record.model, date);

  let bucket = _buckets.get(k);
  if (!bucket) {
    bucket = {
      tenantId: record.tenantId, provider: record.provider, model: record.model, date,
      totalCalls: 0, skippedCalls: 0, cachedCalls: 0, failedCalls: 0,
      totalTokensIn: 0, totalTokensOut: 0, totalCostUsd: 0,
      cacheSavingsUsd: 0, skipSavingsUsd: 0, totalLatencyMs: 0,
    };
    _buckets.set(k, bucket);
  }

  if (record.skipped) {
    bucket.skippedCalls++;
    // Estimate what a real call would have cost (for savings tracking)
    const wouldHaveCost = estimateCost(record.provider, record.model, 1500, 800);
    bucket.skipSavingsUsd += wouldHaveCost;
    return;
  }

  bucket.totalCalls++;
  if (record.cacheHit) {
    bucket.cachedCalls++;
    const wouldHaveCost = estimateCost(record.provider, record.model, record.tokensIn, record.tokensOut);
    bucket.cacheSavingsUsd += wouldHaveCost;
    return;
  }

  bucket.totalTokensIn   += record.tokensIn;
  bucket.totalTokensOut  += record.tokensOut;
  bucket.totalCostUsd    += record.costUsd;
  bucket.totalLatencyMs  += record.latencyMs;
}

// ── Stats ─────────────────────────────────────────────────────────────────

export interface TenantCostSummary {
  tenantId:             string;
  period:               string;
  totalCalls:           number;
  skippedCalls:         number;
  cachedCalls:          number;
  totalCostUsd:         number;
  cacheSavingsUsd:      number;
  skipSavingsUsd:       number;
  totalSavingsUsd:      number;
  avgCostPerCallUsd:    number;
  avgLatencyMs:         number;
  effectiveCostReductionPct: number;
}

export function getTenantDailySummary(tenantId: string, date?: string): TenantCostSummary {
  const d = date ?? todayStr();
  const matching = [..._buckets.values()].filter(b => b.tenantId === tenantId && b.date === d);

  const agg = matching.reduce((acc, b) => ({
    totalCalls:      acc.totalCalls      + b.totalCalls,
    skippedCalls:    acc.skippedCalls    + b.skippedCalls,
    cachedCalls:     acc.cachedCalls     + b.cachedCalls,
    totalCostUsd:    acc.totalCostUsd    + b.totalCostUsd,
    cacheSavingsUsd: acc.cacheSavingsUsd + b.cacheSavingsUsd,
    skipSavingsUsd:  acc.skipSavingsUsd  + b.skipSavingsUsd,
    totalLatencyMs:  acc.totalLatencyMs  + b.totalLatencyMs,
  }), { totalCalls: 0, skippedCalls: 0, cachedCalls: 0, totalCostUsd: 0, cacheSavingsUsd: 0, skipSavingsUsd: 0, totalLatencyMs: 0 });

  const totalSavings = agg.cacheSavingsUsd + agg.skipSavingsUsd;
  const realCalls    = agg.totalCalls - agg.cachedCalls;
  return {
    tenantId,
    period:                      d,
    totalCalls:                  agg.totalCalls,
    skippedCalls:                agg.skippedCalls,
    cachedCalls:                 agg.cachedCalls,
    totalCostUsd:                Number(agg.totalCostUsd.toFixed(6)),
    cacheSavingsUsd:             Number(agg.cacheSavingsUsd.toFixed(6)),
    skipSavingsUsd:              Number(agg.skipSavingsUsd.toFixed(6)),
    totalSavingsUsd:             Number(totalSavings.toFixed(6)),
    avgCostPerCallUsd:           realCalls > 0 ? Number((agg.totalCostUsd / realCalls).toFixed(6)) : 0,
    avgLatencyMs:                realCalls > 0 ? Math.round(agg.totalLatencyMs / realCalls) : 0,
    effectiveCostReductionPct:   totalSavings > 0
      ? Math.round(totalSavings / (totalSavings + agg.totalCostUsd) * 100)
      : 0,
  };
}

/** Drain buckets and return DB upsert payloads for tenant_ai_costs. */
export function flushBuckets(): TenantBucket[] {
  const rows = [..._buckets.values()];
  _buckets.clear();
  return rows;
}
