import { describe, it, expect } from 'vitest';
import { isWindowOpen, shouldPingForKeepalive } from '../src/lib/whatsapp/session';

// ═══════════════════════════════════════
// Guaranteed Business Delivery — session window boundary math
// ═══════════════════════════════════════
describe('isWindowOpen', () => {
  const now = new Date('2026-07-01T12:00:00Z').getTime();

  it('null/undefined expiry — never opened, always closed', () => {
    expect(isWindowOpen(null, now)).toBe(false);
  });

  it('expiry in the future — open', () => {
    const future = new Date(now + 60_000).toISOString();
    expect(isWindowOpen(future, now)).toBe(true);
  });

  it('expiry in the past — closed', () => {
    const past = new Date(now - 60_000).toISOString();
    expect(isWindowOpen(past, now)).toBe(false);
  });

  it('exact boundary (expires exactly now) — treated as closed, not open', () => {
    const exact = new Date(now).toISOString();
    expect(isWindowOpen(exact, now)).toBe(false);
  });
});
