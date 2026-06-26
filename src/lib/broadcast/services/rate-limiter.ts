// ═══════════════════════════════════════════════════════════════════════════
// Broadcast rate limiting — per-number token bucket + Meta messaging-tier budget
// ═══════════════════════════════════════════════════════════════════════════
// Two independent guards the worker applies before every send:
//
//   1. TokenBucket  → paces SUSTAINED send rate to the number's safe msgs/sec
//      (Meta allows up to 80/sec; we default to a conservative 10/sec/number).
//
//   2. Meta tier budget → caps UNIQUE business-initiated recipients per rolling
//      24h to the number's messaging tier (250 / 1k / 10k / 100k / unlimited).
//      Exceeding the tier is what tanks the quality rating and gets numbers
//      disabled, so we stop at the budget and defer the rest to the next window.
//
// All functions here are pure / self-contained so they can be unit-tested
// without a DB or network.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classic token bucket. `capacity` tokens, refilled at `refillPerSec`.
 * Used as one bucket per WhatsApp number to smooth the outbound send rate.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    now: number = Date.now()
  ) {
    if (capacity <= 0) throw new Error('TokenBucket capacity must be > 0');
    if (refillPerSec <= 0) throw new Error('TokenBucket refillPerSec must be > 0');
    this.tokens = capacity;
    this.lastRefill = now;
  }

  private refill(now: number): void {
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    this.lastRefill = now;
  }

  /** Take a token if one is available right now. Non-blocking. */
  tryRemove(n = 1, now: number = Date.now()): boolean {
    this.refill(now);
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  /** Milliseconds until `n` tokens would be available. 0 if available now. */
  msUntilAvailable(n = 1, now: number = Date.now()): number {
    this.refill(now);
    if (this.tokens >= n) return 0;
    return Math.ceil(((n - this.tokens) / this.refillPerSec) * 1000);
  }

  /** Block until `n` tokens are available, then consume them. */
  async remove(n = 1): Promise<void> {
    // Loop guards against timer jitter / multiple concurrent waiters.
    for (let guard = 0; guard < 10_000; guard++) {
      if (this.tryRemove(n)) return;
      const wait = this.msUntilAvailable(n);
      await new Promise((r) => setTimeout(r, Math.max(5, wait)));
    }
    throw new Error('TokenBucket.remove: exceeded wait guard');
  }
}

// ── Meta messaging tiers → 24h unique-recipient cap ──
export const META_TIER_CAPS: Record<string, number> = {
  TIER_250: 250,
  TIER_1K: 1_000,
  TIER_10K: 10_000,
  TIER_100K: 100_000,
  TIER_UNLIMITED: Infinity,
};

const DEFAULT_TIER = 'TIER_1K';

/**
 * Resolve the 24h business-initiated recipient cap for a number.
 * A manual `override` (tenants.wa_daily_conversation_cap) always wins; otherwise
 * map the stored tier, defaulting conservatively when unknown.
 */
export function metaTierCap(tier?: string | null, override?: number | null): number {
  if (override != null && override > 0) return override;
  if (!tier) return META_TIER_CAPS[DEFAULT_TIER];
  return META_TIER_CAPS[tier] ?? META_TIER_CAPS[DEFAULT_TIER];
}

/** Remaining 24h tier budget given how many unique recipients were already sent. */
export function remainingTierBudget(cap: number, sentUnique24h: number): number {
  if (!Number.isFinite(cap)) return Infinity;
  return Math.max(0, cap - Math.max(0, sentUnique24h));
}

/**
 * Safe per-number send rate (msgs/sec) for the TokenBucket. Clamped to a sane
 * range so a bad DB value can neither stall sending nor blow past Meta's 80/sec.
 */
export function safeThroughputPerSecond(configured?: number | null): number {
  const v = configured ?? 10;
  if (!Number.isFinite(v) || v <= 0) return 10;
  return Math.min(80, Math.max(1, Math.floor(v)));
}
