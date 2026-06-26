// ═══════════════════════════════════════════════════════════
// 🧪 Broadcast pacing + Meta-tier + retry-classification unit tests
// Run: npx vitest run tests/broadcast-rate-limiter.test.ts
// ═══════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import {
  TokenBucket,
  metaTierCap,
  remainingTierBudget,
  safeThroughputPerSecond,
  META_TIER_CAPS,
} from '@/lib/broadcast/services/rate-limiter';
import { MetaApiError, isRetryableMetaError } from '@/lib/meta/service';

describe('TokenBucket — per-number pacing', () => {
  it('starts full and drains', () => {
    const b = new TokenBucket(10, 10, 0);
    expect(b.tryRemove(10, 0)).toBe(true);   // consume the full second of capacity
    expect(b.tryRemove(1, 0)).toBe(false);   // now empty
  });

  it('reports correct wait time when empty', () => {
    const b = new TokenBucket(10, 10, 0);
    b.tryRemove(10, 0);
    // 1 token at 10/sec = 100ms
    expect(b.msUntilAvailable(1, 0)).toBe(100);
  });

  it('refills over elapsed time', () => {
    const b = new TokenBucket(10, 10, 0);
    b.tryRemove(10, 0);
    expect(b.tryRemove(1, 100)).toBe(true);  // 100ms later → 1 token back
    expect(b.tryRemove(1, 100)).toBe(false); // consumed it
  });

  it('never refills past capacity', () => {
    const b = new TokenBucket(5, 5, 0);
    // 10 seconds elapse but capacity is 5
    expect(b.tryRemove(5, 10_000)).toBe(true);
    expect(b.tryRemove(1, 10_000)).toBe(false);
  });

  it('rejects invalid construction', () => {
    expect(() => new TokenBucket(0, 10)).toThrow();
    expect(() => new TokenBucket(10, 0)).toThrow();
  });
});

describe('Meta messaging-tier budget', () => {
  it('maps known tiers', () => {
    expect(metaTierCap('TIER_250')).toBe(250);
    expect(metaTierCap('TIER_1K')).toBe(1_000);
    expect(metaTierCap('TIER_100K')).toBe(100_000);
    expect(metaTierCap('TIER_UNLIMITED')).toBe(Infinity);
  });

  it('manual override always wins', () => {
    expect(metaTierCap('TIER_250', 5_000)).toBe(5_000);
  });

  it('defaults conservatively for unknown/missing tiers', () => {
    expect(metaTierCap(undefined)).toBe(META_TIER_CAPS.TIER_1K);
    expect(metaTierCap('TIER_BOGUS')).toBe(META_TIER_CAPS.TIER_1K);
    expect(metaTierCap(null)).toBe(META_TIER_CAPS.TIER_1K);
  });

  it('computes remaining budget and never goes negative', () => {
    expect(remainingTierBudget(1_000, 200)).toBe(800);
    expect(remainingTierBudget(1_000, 1_500)).toBe(0);
    expect(remainingTierBudget(Infinity, 999_999)).toBe(Infinity);
  });
});

describe('safeThroughputPerSecond — clamps DB values into Meta-safe range', () => {
  it('defaults to 10 when unset/invalid', () => {
    expect(safeThroughputPerSecond(undefined)).toBe(10);
    expect(safeThroughputPerSecond(null)).toBe(10);
    expect(safeThroughputPerSecond(0)).toBe(10);
    expect(safeThroughputPerSecond(-5)).toBe(10);
  });
  it('never exceeds Meta 80/sec ceiling', () => {
    expect(safeThroughputPerSecond(1000)).toBe(80);
  });
  it('passes through sane values', () => {
    expect(safeThroughputPerSecond(25)).toBe(25);
  });
});

describe('Meta error retry classification', () => {
  it('retries 429 and 5xx', () => {
    expect(isRetryableMetaError(new MetaApiError('x', 429))).toBe(true);
    expect(isRetryableMetaError(new MetaApiError('x', 503))).toBe(true);
  });

  it('does NOT retry genuine 4xx (auth/payload)', () => {
    expect(isRetryableMetaError(new MetaApiError('bad token', 401))).toBe(false);
    expect(isRetryableMetaError(new MetaApiError('bad template', 400))).toBe(false);
  });

  it('treats Meta throttle error codes as retryable even on a 400-shaped body', () => {
    const e = new MetaApiError('rate limit', 400, { code: 131056 });
    expect(e.isRateLimited).toBe(true);
    expect(e.isTierLimited).toBe(true);
    expect(isRetryableMetaError(e)).toBe(true);
  });

  it('retries transient network errors (non-MetaApiError)', () => {
    expect(isRetryableMetaError(new Error('fetch failed'))).toBe(true);
  });

  it('captures Retry-After hint', () => {
    const e = new MetaApiError('slow down', 429, { retryAfterMs: 3000 });
    expect(e.retryAfterMs).toBe(3000);
  });
});
