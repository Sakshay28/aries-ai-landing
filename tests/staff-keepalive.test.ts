import { describe, it, expect } from 'vitest';
import { shouldPingForKeepalive } from '../src/lib/whatsapp/session';

// ═══════════════════════════════════════
// Tier 1 — hardened staff/manager keepalive cadence
// ═══════════════════════════════════════
describe('shouldPingForKeepalive', () => {
  const now = new Date('2026-07-01T12:00:00Z').getTime();
  const LOOKAHEAD_MS = 12 * 3_600_000; // 12h, matches session-keepalive/route.ts

  it('never-opened window (null) always needs a ping (template fallback path)', () => {
    expect(shouldPingForKeepalive(null, LOOKAHEAD_MS, now)).toBe(true);
  });

  it('window with >12h left — no ping needed yet', () => {
    const farOut = new Date(now + 20 * 3_600_000).toISOString();
    expect(shouldPingForKeepalive(farOut, LOOKAHEAD_MS, now)).toBe(false);
  });

  it('window with exactly 12h left — needs a ping (boundary is inclusive)', () => {
    const exact = new Date(now + LOOKAHEAD_MS).toISOString();
    expect(shouldPingForKeepalive(exact, LOOKAHEAD_MS, now)).toBe(true);
  });

  it('window with <12h left — needs a ping', () => {
    const soon = new Date(now + 5 * 3_600_000).toISOString();
    expect(shouldPingForKeepalive(soon, LOOKAHEAD_MS, now)).toBe(true);
  });

  it('window already expired — needs a ping (template fallback path)', () => {
    const past = new Date(now - 3_600_000).toISOString();
    expect(shouldPingForKeepalive(past, LOOKAHEAD_MS, now)).toBe(true);
  });

  it('two safety windows per 24h cycle: a miss at the 12h mark is still caught by a later tick', () => {
    // Simulates: window opened at t=0 (expires at t=24h). A cron tick at
    // t=11h should NOT yet fire (>12h remaining); a tick at t=13h SHOULD
    // fire (<12h remaining) — i.e. a single missed tick around the first
    // threshold doesn't blow through the deadline before the next one.
    const windowExpiresAt = new Date(now + 24 * 3_600_000).toISOString();
    const tick11h = now + 11 * 3_600_000;
    const tick13h = now + 13 * 3_600_000;
    expect(shouldPingForKeepalive(windowExpiresAt, LOOKAHEAD_MS, tick11h)).toBe(false);
    expect(shouldPingForKeepalive(windowExpiresAt, LOOKAHEAD_MS, tick13h)).toBe(true);
  });
});
