import { describe, it, expect } from 'vitest';
import {
  buildFunnel,
  normalizeFailureReason,
  summarizeFailures,
  percentile,
  computeReadLatency,
  formatDuration,
} from '@/lib/broadcast/services/campaign-insights.service';

// ── buildFunnel ──────────────────────────────────────────────────────────────
describe('buildFunnel', () => {
  it('computes stage percentages against sent', () => {
    const f = buildFunnel({ sent: 4, delivered: 3, read: 2, failed: 1 });
    expect(f.stages.map((s) => [s.key, s.count, s.pctOfSent])).toEqual([
      ['sent', 4, 100],
      ['delivered', 3, 75],
      ['read', 2, 50],
    ]);
    expect(f.failed).toBe(1);
    expect(f.failedPctOfSent).toBe(25);
  });

  it('clamps analytics drift so the funnel stays monotonic (read <= delivered <= sent)', () => {
    // Duplicate webhooks over-counted delivered to 10 (true 8) on a 12-send campaign.
    const f = buildFunnel({ sent: 12, delivered: 14, read: 13, failed: 4 });
    const [sent, delivered, read] = f.stages;
    expect(sent.count).toBe(12);
    expect(delivered.count).toBe(12); // clamped to sent
    expect(read.count).toBe(12); // clamped to delivered
    expect(delivered.pctOfSent).toBe(100);
  });

  it('handles a zero-sent campaign without dividing by zero', () => {
    const f = buildFunnel({ sent: 0, delivered: 0, read: 0, failed: 0 });
    expect(f.stages.every((s) => s.pctOfSent === 0)).toBe(true);
    expect(f.failedPctOfSent).toBe(0);
  });

  it('coerces negatives / floats defensively', () => {
    const f = buildFunnel({ sent: 5.9, delivered: -3, read: 2.4, failed: -1 });
    expect(f.stages[0].count).toBe(5);
    expect(f.stages[1].count).toBe(0);
    expect(f.stages[2].count).toBe(0); // read clamped to delivered(0)
    expect(f.failed).toBe(0);
  });
});

// ── normalizeFailureReason ───────────────────────────────────────────────────
describe('normalizeFailureReason', () => {
  const cases: [string, string][] = [
    ['Max attempts reached. Final error: Meta error 131047', '24-hour window closed'],
    ['SESSION_EXPIRED', '24-hour window closed'],
    ['24h re-engagement window closed', '24-hour window closed'],
    ['Meta throttled (2/3): rate limit hit', 'Meta rate limit'],
    ['error 130429 too many messages', 'Meta rate limit'],
    ['Recipient opted out', 'Recipient opted out'],
    ['user sent STOP', 'Recipient opted out'],
    ['131026 receiver incapable / not on whatsapp', 'Not on WhatsApp / invalid number'],
    ['invalid recipient number', 'Not on WhatsApp / invalid number'],
    ['132001 template does not exist', 'Template issue'],
    ['paused template', 'Template issue'],
    ['Frequency cap: 3 broadcasts/day exceeded', 'Frequency cap reached'],
    ['Campaign configuration missing', 'Configuration error'],
  ];
  it.each(cases)('maps %j → %j', (raw, label) => {
    expect(normalizeFailureReason(raw).label).toBe(label);
  });

  it('returns Unknown error for empty/nullish input', () => {
    expect(normalizeFailureReason(null).label).toBe('Unknown error');
    expect(normalizeFailureReason('   ').label).toBe('Unknown error');
    expect(normalizeFailureReason(undefined).key).toBe('unknown');
  });

  it('surfaces a bare Meta code when no keyword matches', () => {
    expect(normalizeFailureReason('failed with 133010').label).toBe('Meta error 133010');
  });

  it('falls back to Other error with no code and no keyword', () => {
    expect(normalizeFailureReason('something weird happened').label).toBe('Other error');
  });

  it('window-closed takes priority over a coincidental rate keyword', () => {
    expect(normalizeFailureReason('131047 window closed after rate check').key).toBe('window_closed');
  });
});

// ── summarizeFailures ────────────────────────────────────────────────────────
describe('summarizeFailures', () => {
  it('groups, counts, and computes shares sorted by frequency', () => {
    const out = summarizeFailures([
      'SESSION_EXPIRED',
      'Meta error 131047',
      'rate limit',
      'Recipient opted out',
      'SESSION_EXPIRED',
    ]);
    expect(out[0]).toMatchObject({ key: 'window_closed', count: 3, pct: 60 });
    // window_closed leads (count 3); the two count-1 categories tie and break
    // alphabetically by label: "Meta rate limit" < "Recipient opted out".
    expect(out.map((c) => c.key)).toEqual(['window_closed', 'rate_limited', 'opted_out']);
    // shares sum to 100 here (60 + 20 + 20)
    expect(out.reduce((s, c) => s + c.pct, 0)).toBe(100);
  });

  it('returns an empty array when there are no failures', () => {
    expect(summarizeFailures([])).toEqual([]);
  });

  it('breaks frequency ties alphabetically by label (deterministic)', () => {
    const out = summarizeFailures(['Recipient opted out', 'rate limit']);
    expect(out.map((c) => c.label)).toEqual(['Meta rate limit', 'Recipient opted out']);
  });
});

// ── percentile ───────────────────────────────────────────────────────────────
describe('percentile', () => {
  it('returns null for empty input', () => {
    expect(percentile([], 0.5)).toBeNull();
  });
  it('returns the single value regardless of p', () => {
    expect(percentile([42], 0.9)).toBe(42);
  });
  it('computes the median of an odd-length set', () => {
    expect(percentile([1, 2, 3], 0.5)).toBe(2);
  });
  it('linearly interpolates between neighbours', () => {
    // p50 of [10,20,30,40] → idx 1.5 → 25
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
  });
  it('clamps p outside [0,1] to the endpoints', () => {
    expect(percentile([5, 10, 15], -1)).toBe(5);
    expect(percentile([5, 10, 15], 2)).toBe(15);
  });
});

// ── computeReadLatency ───────────────────────────────────────────────────────
describe('computeReadLatency', () => {
  it('computes median/p90 and bucket distribution', () => {
    const base = '2026-07-23T10:00:00.000Z';
    const at = (secs: number) => new Date(Date.parse(base) + secs * 1000).toISOString();
    const stats = computeReadLatency([
      { deliveredAt: base, readAt: at(30) },    // under 1m
      { deliveredAt: base, readAt: at(120) },   // 1–10m
      { deliveredAt: base, readAt: at(1800) },  // 10–60m
      { deliveredAt: base, readAt: at(7200) },  // 1–24h
      { deliveredAt: base, readAt: at(200000) },// over 24h
    ]);
    expect(stats.sampleSize).toBe(5);
    expect(stats.medianSeconds).toBe(1800);
    expect(stats.buckets.map((b) => b.count)).toEqual([1, 1, 1, 1, 1]);
  });

  it('ignores pairs missing a timestamp', () => {
    const stats = computeReadLatency([
      { deliveredAt: '2026-07-23T10:00:00.000Z', readAt: null },
      { deliveredAt: null, readAt: '2026-07-23T10:00:00.000Z' },
      { deliveredAt: '2026-07-23T10:00:00.000Z', readAt: '2026-07-23T10:00:45.000Z' },
    ]);
    expect(stats.sampleSize).toBe(1);
    expect(stats.medianSeconds).toBe(45);
  });

  it('drops out-of-order (read before delivered) pairs rather than skewing to zero', () => {
    const stats = computeReadLatency([
      { deliveredAt: '2026-07-23T10:00:10.000Z', readAt: '2026-07-23T10:00:00.000Z' }, // negative → dropped
      { deliveredAt: '2026-07-23T10:00:00.000Z', readAt: '2026-07-23T10:01:00.000Z' }, // 60s
    ]);
    expect(stats.sampleSize).toBe(1);
    expect(stats.medianSeconds).toBe(60);
  });

  it('returns null stats and zeroed buckets when there is no readable data', () => {
    const stats = computeReadLatency([]);
    expect(stats.sampleSize).toBe(0);
    expect(stats.medianSeconds).toBeNull();
    expect(stats.p90Seconds).toBeNull();
    expect(stats.buckets.every((b) => b.count === 0)).toBe(true);
  });

  it('places an exactly-60s read into the 1–10m bucket (boundary is exclusive on the low side)', () => {
    const stats = computeReadLatency([
      { deliveredAt: '2026-07-23T10:00:00.000Z', readAt: '2026-07-23T10:01:00.000Z' },
    ]);
    expect(stats.buckets.find((b) => b.key === 'under_1m')!.count).toBe(0);
    expect(stats.buckets.find((b) => b.key === '1_10m')!.count).toBe(1);
  });
});

// ── formatDuration ───────────────────────────────────────────────────────────
describe('formatDuration', () => {
  it.each([
    [null, '—'],
    [0, '0s'],
    [45, '45s'],
    [60, '1m'],
    [74, '1m 14s'],
    [3600, '1h'],
    [3720, '1h 2m'],
    [90000, '1d 1h'],
    [172800, '2d'],
  ])('formats %j → %j', (secs, out) => {
    expect(formatDuration(secs as number | null)).toBe(out);
  });
});
