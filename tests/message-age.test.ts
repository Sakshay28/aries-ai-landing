import { describe, it, expect } from 'vitest';
import { classifyMessageAge, FRESH_MESSAGE_MS, MAX_REDELIVERY_MS } from '@/lib/meta/messageAge';

describe('classifyMessageAge', () => {
  const now = Date.parse('2026-10-31T00:00:00Z');

  it('treats messages up to 15 minutes old as fresh', () => {
    expect(classifyMessageAge(now, now)).toBe('fresh');
    expect(classifyMessageAge(now - FRESH_MESSAGE_MS, now)).toBe('fresh');
  });

  it('keeps Meta re-deliveries after an outage (hours/days late) as delayed, not dropped', () => {
    expect(classifyMessageAge(now - FRESH_MESSAGE_MS - 1, now)).toBe('delayed');
    expect(classifyMessageAge(now - 15.6 * 3600_000, now)).toBe('delayed'); // the Mezo retry seen 2026-10-31
    expect(classifyMessageAge(now - MAX_REDELIVERY_MS, now)).toBe('delayed');
  });

  it('rejects anything older than Meta’s 7-day retry window', () => {
    expect(classifyMessageAge(now - MAX_REDELIVERY_MS - 1, now)).toBe('expired');
  });

  it('treats far-future timestamps symmetrically (clock skew / forged)', () => {
    expect(classifyMessageAge(now + 60_000, now)).toBe('fresh');
    expect(classifyMessageAge(now + MAX_REDELIVERY_MS + 1, now)).toBe('expired');
  });
});
