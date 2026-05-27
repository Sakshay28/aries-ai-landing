// ═══════════════════════════════════════════════════════════
// 🧪 Phase 2 Production Hardening Tests
// ═══════════════════════════════════════════════════════════
// Run: npx vitest run tests/hardening-phase2.test.ts
// ═══════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';

import { encryptTokenV2, decryptTokenV2, needsRotation, isCurrentVersion } from '@/lib/security/keyManager';
import { withIdempotency, checkIdempotency, outboundMessageKey, metaWebhookKey, razorpayEventKey, followupJobKey, hashContent } from '@/lib/idempotency/index';
import { checkAICostLimit, checkDailyAICostLimit } from '@/lib/billing/costProtection';
import { setHealthFlag, getHealthFlags, GEMINI_FAILSAFE_RESPONSE } from '@/lib/failsafe/index';

// ─── Setup: set required env vars ────────────────────────────
process.env.ENCRYPTION_KEYS = JSON.stringify({ v1: 'old-test-key-32chars-padpadpad!', v2: 'new-test-key-32chars-padpadpad!' });
process.env.CURRENT_ENCRYPTION_VERSION = 'v2';

// ════════════════════════════════════════
// 1. SECRET ROTATION & KEY MANAGER
// ════════════════════════════════════════
describe('Key Manager — Encryption Versioning', () => {
  it('encrypts with current version (v2)', () => {
    const enc = encryptTokenV2('my-secret-token');
    expect(enc).toBeTruthy();
    expect(enc!.startsWith('enc:v2:')).toBe(true);
  });

  it('decrypts v2 ciphertext back to plaintext', () => {
    const enc = encryptTokenV2('test-whatsapp-token-123');
    expect(decryptTokenV2(enc)).toBe('test-whatsapp-token-123');
  });

  it('decrypts v1 ciphertext using v1 key', () => {
    // Temporarily set v1 as current to encrypt with v1 key
    const origVersion = process.env.CURRENT_ENCRYPTION_VERSION;
    process.env.CURRENT_ENCRYPTION_VERSION = 'v1';
    const encV1 = encryptTokenV2('old-token-value');
    process.env.CURRENT_ENCRYPTION_VERSION = origVersion;

    expect(encV1!.startsWith('enc:v1:')).toBe(true);
    const decrypted = decryptTokenV2(encV1);
    expect(decrypted).toBe('old-token-value');
  });

  it('returns plaintext as-is for non-encrypted strings', () => {
    expect(decryptTokenV2('plain-text-token')).toBe('plain-text-token');
  });

  it('returns null for null input', () => {
    expect(encryptTokenV2(null)).toBeNull();
    expect(decryptTokenV2(null)).toBeNull();
  });

  it('needsRotation returns true for v1 token when v2 is current', () => {
    process.env.CURRENT_ENCRYPTION_VERSION = 'v1';
    const encV1 = encryptTokenV2('some-token');
    process.env.CURRENT_ENCRYPTION_VERSION = 'v2';
    expect(needsRotation(encV1!)).toBe(true);
  });

  it('needsRotation returns false for already-current-version token', () => {
    const enc = encryptTokenV2('some-token');
    expect(needsRotation(enc!)).toBe(false);
  });

  it('isCurrentVersion returns true for v2 token', () => {
    const enc = encryptTokenV2('abc');
    expect(isCurrentVersion(enc!)).toBe(true);
  });

  it('handles unknown key version gracefully (returns null, does not throw)', () => {
    const fakeToken = 'enc:v99:aabbccdd:eeff1122:deadbeef';
    expect(() => decryptTokenV2(fakeToken)).not.toThrow();
    expect(decryptTokenV2(fakeToken)).toBeNull();
  });
});

// ════════════════════════════════════════
// 2. IDEMPOTENCY LAYER
// ════════════════════════════════════════
describe('Idempotency — Key Builders', () => {
  it('outboundMessageKey produces stable key', () => {
    const k = outboundMessageKey('t1', 'c1', 'hash1');
    expect(k).toBe('idem:msg:t1:c1:hash1');
  });

  it('metaWebhookKey produces correct format', () => {
    expect(metaWebhookKey('wamid.ABC123')).toBe('idem:meta:webhook:wamid.ABC123');
  });

  it('razorpayEventKey produces correct format', () => {
    expect(razorpayEventKey('evt_XYZ')).toBe('idem:payment:webhook:evt_XYZ');
  });

  it('followupJobKey produces correct format', () => {
    expect(followupJobKey('t1', 'c1', 'camp1')).toBe('idem:followup:t1:c1:camp1');
  });

  it('hashContent produces stable hash for same input', () => {
    expect(hashContent('Hello World')).toBe(hashContent('Hello World'));
  });

  it('hashContent produces different hash for different input', () => {
    expect(hashContent('Hello')).not.toBe(hashContent('World'));
  });
});

describe('Idempotency — withIdempotency (memory fallback)', () => {
  it('executes fn on first call', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const uniqueKey = `test:${Date.now()}:${Math.random()}`;
    const result = await withIdempotency(uniqueKey, 60, fn);
    expect(fn).toHaveBeenCalledOnce();
    expect(result).toBe('result');
  });

  it('skips fn on duplicate key', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const uniqueKey = `test:dedup:${Date.now()}:${Math.random()}`;
    await withIdempotency(uniqueKey, 60, fn);
    const result2 = await withIdempotency(uniqueKey, 60, fn);
    expect(fn).toHaveBeenCalledOnce(); // only once
    expect(result2).toBeUndefined();
  });

  it('different keys execute independently', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const base = `test:diff:${Date.now()}`;
    await withIdempotency(`${base}:a`, 60, fn);
    await withIdempotency(`${base}:b`, 60, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ════════════════════════════════════════
// 3. AI COST PROTECTION
// ════════════════════════════════════════
describe('AI Cost Protection', () => {
  it('enterprise plan is always allowed', async () => {
    const result = await checkAICostLimit('tenant-1', 'enterprise');
    expect(result.allowed).toBe(true);
    expect(result.status).toBe('ok');
  });

  it('pro plan is always allowed', async () => {
    const result = await checkAICostLimit('tenant-1', 'pro');
    expect(result.allowed).toBe(true);
  });

  it('unknown plan defaults to starter limits', async () => {
    const result = await checkAICostLimit('tenant-fresh', 'unknown_plan');
    expect(result.allowed).toBe(true); // usage is 0 → ok
    expect(result.limitTokens).toBe(50_000_000);
  });

  it('daily check passes for fresh tenant', async () => {
    const allowed = await checkDailyAICostLimit('tenant-fresh-2', 'starter');
    expect(allowed).toBe(true);
  });
});

// ════════════════════════════════════════
// 4. DISASTER RECOVERY FAILSAFE
// ════════════════════════════════════════
describe('Failsafe Mode — Health Flags', () => {
  it('all services default to healthy', () => {
    const flags = getHealthFlags();
    expect(flags.redis).toBe(true);
    expect(flags.db).toBe(true);
    expect(flags.metaApi).toBe(true);
    expect(flags.gemini).toBe(true);
  });

  it('setHealthFlag marks service as down', () => {
    setHealthFlag('redis', false);
    expect(getHealthFlags().redis).toBe(false);
    setHealthFlag('redis', true); // restore
  });

  it('setHealthFlag recovery restores to true', () => {
    setHealthFlag('db', false);
    setHealthFlag('db', true);
    expect(getHealthFlags().db).toBe(true);
  });

  it('GEMINI_FAILSAFE_RESPONSE has required fields', () => {
    expect(GEMINI_FAILSAFE_RESPONSE.reply).toBeTruthy();
    expect(GEMINI_FAILSAFE_RESPONSE.intent).toBe('unknown');
    expect(GEMINI_FAILSAFE_RESPONSE.shouldEscalate).toBe(false);
    expect(typeof GEMINI_FAILSAFE_RESPONSE.confidence).toBe('number');
  });
});
