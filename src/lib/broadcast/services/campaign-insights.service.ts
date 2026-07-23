// ═══════════════════════════════════════════════════════════════════════════
// 📊 Campaign Insights — pure aggregation logic (no DB / no framework deps)
// ═══════════════════════════════════════════════════════════════════════════
// Everything here is a pure function so it can be unit-tested against fixtures.
// The API route (src/app/api/broadcast/campaign/[id]/insights/route.ts) is the
// only place that touches the database; it feeds rows into these functions.
//
// Powers three Overview-tab insights:
//   1. Delivery funnel (Sent → Delivered → Read, plus Failed) with drop-off.
//   2. Failure breakdown — normalized Meta failure reasons, grouped.
//   3. Speed-to-read — median / p90 latency from delivered → read, bucketed.

// ── Types ────────────────────────────────────────────────────────────────────

export interface FunnelStage {
  key: 'sent' | 'delivered' | 'read';
  label: string;
  count: number;
  /** Percentage of the `sent` cohort that reached this stage (0–100). */
  pctOfSent: number;
}

export interface FunnelResult {
  stages: FunnelStage[];
  failed: number;
  failedPctOfSent: number;
}

export interface FailureCategory {
  /** Stable grouping key, safe for React keys. */
  key: string;
  label: string;
  count: number;
  /** Share of all failures in this campaign (0–100). */
  pct: number;
}

export interface LatencyBucket {
  key: string;
  label: string;
  count: number;
}

export interface ReadLatencyStats {
  /** Number of delivered→read pairs that contributed to the stats. */
  sampleSize: number;
  medianSeconds: number | null;
  p90Seconds: number | null;
  buckets: LatencyBucket[];
}

export interface CampaignInsights {
  funnel: FunnelResult;
  failures: FailureCategory[];
  readLatency: ReadLatencyStats;
}

// ── 1. Delivery funnel ───────────────────────────────────────────────────────

/**
 * Build a monotonic funnel from cumulative counts.
 *
 * `delivered` and `read` come from broadcast_analytics, which is incremented
 * per webhook event and can drift slightly above the true value on duplicate
 * Meta callbacks. We clamp so the funnel never shows an impossible shape
 * (read > delivered > sent) — a stage can never exceed the one before it.
 */
export function buildFunnel(input: {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}): FunnelResult {
  const sent = Math.max(0, Math.floor(input.sent || 0));
  const deliveredRaw = Math.max(0, Math.floor(input.delivered || 0));
  const readRaw = Math.max(0, Math.floor(input.read || 0));
  const failed = Math.max(0, Math.floor(input.failed || 0));

  const delivered = sent > 0 ? Math.min(deliveredRaw, sent) : deliveredRaw;
  const read = Math.min(readRaw, delivered);

  const pct = (n: number) => (sent > 0 ? Math.round((n / sent) * 100) : 0);

  return {
    stages: [
      { key: 'sent', label: 'Sent', count: sent, pctOfSent: sent > 0 ? 100 : 0 },
      { key: 'delivered', label: 'Delivered', count: delivered, pctOfSent: pct(delivered) },
      { key: 'read', label: 'Read', count: read, pctOfSent: pct(read) },
    ],
    failed,
    failedPctOfSent: pct(failed),
  };
}

// ── 2. Failure normalization ─────────────────────────────────────────────────

interface NormalizedFailure {
  key: string;
  label: string;
}

const UNKNOWN_FAILURE: NormalizedFailure = { key: 'unknown', label: 'Unknown error' };

/**
 * Map a raw Meta/queue failure string to a stable, human-readable category.
 * Order matters: the most specific / most actionable patterns are checked first.
 */
export function normalizeFailureReason(raw: string | null | undefined): NormalizedFailure {
  if (!raw || !raw.trim()) return UNKNOWN_FAILURE;
  const s = raw.toLowerCase();

  // 24-hour customer-service window closed (the single most common broadcast
  // failure). Meta code 131047; our send path maps it to SESSION_EXPIRED.
  if (/\b131047\b/.test(s) || s.includes('session_expired') || /re-?engag/.test(s) || /24-?\s*hour|24h\s*window/.test(s)) {
    return { key: 'window_closed', label: '24-hour window closed' };
  }

  // Meta throttling / tier & pair-rate limits — "slow down", not a bad recipient.
  if (/\b(130429|131056|368)\b/.test(s) || /rate.?limit|throttl|tier limit|too many messages|spam rate/.test(s)) {
    return { key: 'rate_limited', label: 'Meta rate limit' };
  }

  // Recipient opted out / unsubscribed / consent withdrawn.
  if (/opt(ed)?[-\s]?out|unsubscrib|consent|\bstop\b/.test(s)) {
    return { key: 'opted_out', label: 'Recipient opted out' };
  }

  // Number not on WhatsApp / invalid recipient.
  if (/\b(131026|131052|470)\b/.test(s) || /not.*(on )?whatsapp|invalid.*(number|recipient|wa_id)|receiver.*incapable|does not exist on whatsapp/.test(s)) {
    return { key: 'invalid_number', label: 'Not on WhatsApp / invalid number' };
  }

  // Template problem — paused, rejected, params mismatch, missing.
  if (/\b(132000|132001|132005|132007|132012|132015|132016|132068|132069)\b/.test(s) || /template.*(paused|not exist|rejected|mismatch|param)|paused template|number of parameters/.test(s)) {
    return { key: 'template_issue', label: 'Template issue' };
  }

  // Frequency cap enforced by our own engine (not a Meta failure).
  if (/frequency cap/.test(s)) {
    return { key: 'frequency_cap', label: 'Frequency cap reached' };
  }

  // Missing / broken campaign configuration.
  if (/config|missing|not configured/.test(s)) {
    return { key: 'config_error', label: 'Configuration error' };
  }

  // Fallback: surface a bare Meta error code if we can find one, else generic.
  const code = raw.match(/\b(\d{3,6})\b/);
  if (code) {
    return { key: `meta_${code[1]}`, label: `Meta error ${code[1]}` };
  }
  return { key: 'other', label: 'Other error' };
}

/**
 * Group a flat list of raw failure reasons into sorted categories with shares.
 */
export function summarizeFailures(rawReasons: (string | null | undefined)[]): FailureCategory[] {
  const total = rawReasons.length;
  if (total === 0) return [];

  const groups = new Map<string, FailureCategory>();
  for (const raw of rawReasons) {
    const { key, label } = normalizeFailureReason(raw);
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { key, label, count: 1, pct: 0 });
    }
  }

  const list = Array.from(groups.values());
  for (const g of list) g.pct = Math.round((g.count / total) * 100);

  // Most frequent first; ties broken alphabetically for deterministic output.
  list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return list;
}

// ── 3. Speed-to-read ─────────────────────────────────────────────────────────

/**
 * Linear-interpolated percentile over an ascending-sorted array.
 * `p` is a fraction in [0, 1]. Returns null for an empty input.
 */
export function percentile(sortedAsc: number[], p: number): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0];
  const clamped = Math.min(1, Math.max(0, p));
  const idx = clamped * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

const LATENCY_BUCKET_DEFS: { key: string; label: string; maxSeconds: number }[] = [
  { key: 'under_1m', label: 'Under 1 min', maxSeconds: 60 },
  { key: '1_10m', label: '1–10 min', maxSeconds: 600 },
  { key: '10_60m', label: '10–60 min', maxSeconds: 3600 },
  { key: '1_24h', label: '1–24 hrs', maxSeconds: 86400 },
  { key: 'over_24h', label: 'Over 24 hrs', maxSeconds: Infinity },
];

/**
 * Compute read-latency stats from delivered→read timestamp pairs.
 *
 * Pairs missing either timestamp are ignored. A read_at strictly before
 * delivered_at (possible when Meta delivers the `read` webhook before the
 * `delivered` one) is dropped as unreliable rather than clamped, so it can't
 * skew the median toward zero.
 */
export function computeReadLatency(
  pairs: { deliveredAt: string | null | undefined; readAt: string | null | undefined }[]
): ReadLatencyStats {
  const seconds: number[] = [];
  for (const { deliveredAt, readAt } of pairs) {
    if (!deliveredAt || !readAt) continue;
    const d = new Date(deliveredAt).getTime();
    const r = new Date(readAt).getTime();
    if (!Number.isFinite(d) || !Number.isFinite(r)) continue;
    const diff = (r - d) / 1000;
    if (diff < 0) continue; // out-of-order webhook — unreliable
    seconds.push(diff);
  }

  seconds.sort((a, b) => a - b);

  const buckets: LatencyBucket[] = LATENCY_BUCKET_DEFS.map((b) => ({ key: b.key, label: b.label, count: 0 }));
  for (const sec of seconds) {
    const i = LATENCY_BUCKET_DEFS.findIndex((b) => sec < b.maxSeconds);
    buckets[i === -1 ? buckets.length - 1 : i].count += 1;
  }

  const median = percentile(seconds, 0.5);
  const p90 = percentile(seconds, 0.9);

  return {
    sampleSize: seconds.length,
    medianSeconds: median === null ? null : Math.round(median),
    p90Seconds: p90 === null ? null : Math.round(p90),
    buckets,
  };
}

/**
 * Format a duration in seconds into a compact human string (e.g. "1m 14s",
 * "3h 2m", "2d"). Used by the UI; kept here so it is covered by unit tests.
 */
export function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) return '—';
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) {
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rem = m % 60;
    return rem ? `${h}h ${rem}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d}d ${remH}h` : `${d}d`;
}
