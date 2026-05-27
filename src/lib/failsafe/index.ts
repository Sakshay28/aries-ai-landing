// ═══════════════════════════════════════════════════════════
// 🛡️ Disaster Recovery & Failsafe Mode
// ═══════════════════════════════════════════════════════════
// Handles graceful degradation when core infrastructure fails:
//   - Redis down    → in-memory fallback, no crash
//   - Meta API down → exponential backoff, then safe error
//   - Gemini down   → static fallback response
//   - DB down       → alert + health flag, no white-screen
//
// Retry config for Meta API (non-4xx errors):
//   1s → 5s → 15s → fail
// ═══════════════════════════════════════════════════════════

import * as Sentry from '@/lib/sentry-stub';

// ─── System-level health flags (in-memory, single instance) ──
const healthFlags = {
  redis: true,
  db: true,
  metaApi: true,
  gemini: true,
};

export function setHealthFlag(service: keyof typeof healthFlags, healthy: boolean): void {
  const prev = healthFlags[service];
  healthFlags[service] = healthy;
  if (prev && !healthy) {
    console.error(`🚨 [failsafe] ${service} went DOWN`);
    Sentry.captureMessage(`Service degraded: ${service}`, 'error');
  } else if (!prev && healthy) {
    console.log(`✅ [failsafe] ${service} recovered`);
  }
}

export function getHealthFlags() {
  return { ...healthFlags };
}

// ─── Meta API retry with progressive backoff ─────────────────
// Delays: 1s, 5s, 15s — no infinite loops
const META_RETRY_DELAYS = [1000, 5000, 15000];

export async function withMetaFailsafe<T>(
  fn: () => Promise<T>,
  context = 'Meta API call'
): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= META_RETRY_DELAYS.length; attempt++) {
    try {
      const result = await fn();
      setHealthFlag('metaApi', true);
      return result;
    } catch (err) {
      lastError = err as Error;
      const status = (err as any)?.status ?? 0;

      // Don't retry client errors (4xx)
      if (status >= 400 && status < 500) {
        console.error(`❌ ${context} — client error ${status}, no retry`);
        setHealthFlag('metaApi', true); // API is up, request was just bad
        throw err;
      }

      setHealthFlag('metaApi', false);

      if (attempt < META_RETRY_DELAYS.length) {
        const delay = META_RETRY_DELAYS[attempt];
        console.warn(`⚠️ ${context} failed (attempt ${attempt + 1}), retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  console.error(`❌ ${context} failed after all retries:`, lastError.message);
  Sentry.captureException(lastError);
  throw lastError;
}

// ─── Gemini / AI fallback ─────────────────────────────────────
export const GEMINI_FAILSAFE_RESPONSE = {
  reply: "I'm having a moment — please try again shortly or type 'agent' to speak with our team! 🙏",
  intent: 'unknown' as const,
  sentiment: 'neutral' as const,
  shouldEscalate: false,
  extractedData: {},
  nextStep: 'ask_intent',
  confidence: 1.0,
};

export async function withGeminiFailsafe<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    const result = await fn();
    setHealthFlag('gemini', true);
    return result;
  } catch (err) {
    setHealthFlag('gemini', false);
    console.error('❌ Gemini call failed — using fallback response:', (err as Error).message);
    Sentry.captureException(err);
    return fallback;
  }
}

// ─── DB failsafe wrapper ──────────────────────────────────────
export async function withDBFailsafe<T>(
  fn: () => Promise<T>,
  fallback: T,
  context = 'DB query'
): Promise<T> {
  try {
    const result = await fn();
    setHealthFlag('db', true);
    return result;
  } catch (err) {
    setHealthFlag('db', false);
    console.error(`❌ ${context} failed:`, (err as Error).message);
    Sentry.captureException(err);
    return fallback;
  }
}

// ─── Redis failsafe wrapper ───────────────────────────────────
export async function withRedisFailsafe<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    const result = await fn();
    setHealthFlag('redis', true);
    return result;
  } catch (err) {
    setHealthFlag('redis', false);
    console.warn('⚠️ Redis call failed — using fallback:', (err as Error).message);
    return fallback;
  }
}
