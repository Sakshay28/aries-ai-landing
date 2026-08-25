import { describe, it, expect } from 'vitest';
import { shouldAutoResumeBotPause } from '@/lib/webhook/decisions';

// Fixed reference so the tests are deterministic — imagine "now" is this moment
// and pick lastOutboundAt values relative to it.
const NOW = new Date('2026-08-24T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe('shouldAutoResumeBotPause', () => {
  const CREATED = hoursAgo(200); // long-lived conversation

  it('returns false when autoResumeHours is null (opt-out default)', () => {
    expect(shouldAutoResumeBotPause({
      autoResumeHours: null,
      lastOutboundAt: hoursAgo(1000),
      createdAt: CREATED,
      now: NOW,
    })).toBe(false);
  });

  it('returns false when autoResumeHours is undefined (column not selected)', () => {
    expect(shouldAutoResumeBotPause({
      autoResumeHours: undefined,
      lastOutboundAt: hoursAgo(1000),
      createdAt: CREATED,
      now: NOW,
    })).toBe(false);
  });

  it('treats 0 the same as null (never auto-resume)', () => {
    expect(shouldAutoResumeBotPause({
      autoResumeHours: 0,
      lastOutboundAt: hoursAgo(1000),
      createdAt: CREATED,
      now: NOW,
    })).toBe(false);
  });

  it('rejects negative thresholds (defensive against a fat-fingered write)', () => {
    expect(shouldAutoResumeBotPause({
      autoResumeHours: -1,
      lastOutboundAt: hoursAgo(1000),
      createdAt: CREATED,
      now: NOW,
    })).toBe(false);
  });

  it('resumes when last outbound is older than the threshold', () => {
    expect(shouldAutoResumeBotPause({
      autoResumeHours: 72,
      lastOutboundAt: hoursAgo(73),
      createdAt: CREATED,
      now: NOW,
    })).toBe(true);
  });

  it('keeps the pause when last outbound is fresher than the threshold', () => {
    // Agent replied 12h ago on a 72h threshold — still actively engaged.
    expect(shouldAutoResumeBotPause({
      autoResumeHours: 72,
      lastOutboundAt: hoursAgo(12),
      createdAt: CREATED,
      now: NOW,
    })).toBe(false);
  });

  it('resumes exactly at the threshold boundary', () => {
    expect(shouldAutoResumeBotPause({
      autoResumeHours: 72,
      lastOutboundAt: hoursAgo(72),
      createdAt: CREATED,
      now: NOW,
    })).toBe(true);
  });

  it('falls back to createdAt when the conversation has no outbound yet', () => {
    // Paused-at-birth by a flow handoff on the welcome message — createdAt is
    // the only anchor we have.
    expect(shouldAutoResumeBotPause({
      autoResumeHours: 24,
      lastOutboundAt: null,
      createdAt: hoursAgo(48),
      now: NOW,
    })).toBe(true);

    expect(shouldAutoResumeBotPause({
      autoResumeHours: 24,
      lastOutboundAt: null,
      createdAt: hoursAgo(6),
      now: NOW,
    })).toBe(false);
  });

  it('returns false when both timestamps are missing (no anchor to measure against)', () => {
    expect(shouldAutoResumeBotPause({
      autoResumeHours: 24,
      lastOutboundAt: null,
      createdAt: null,
      now: NOW,
    })).toBe(false);
  });

  it('accepts Date objects for the timestamps, not just strings', () => {
    expect(shouldAutoResumeBotPause({
      autoResumeHours: 12,
      lastOutboundAt: hoursAgo(24),
      createdAt: hoursAgo(200),
      now: NOW,
    })).toBe(true);
  });

  it('handles a garbled ISO string gracefully (no accidental resume)', () => {
    expect(shouldAutoResumeBotPause({
      autoResumeHours: 12,
      lastOutboundAt: 'not-a-date',
      createdAt: null,
      now: NOW,
    })).toBe(false);
  });

  it('REGRESSION: reproduces the 2026-07-18 → 2026-08-24 Romeo Lane stuck-thread case', () => {
    // The customer whose "Hello" got no reply — conversation was paused after
    // a July 18 escalation alert, customer messaged today (Aug 24). With a
    // 72-hour opt-in the bot would have resumed itself instead of ghosting them.
    expect(shouldAutoResumeBotPause({
      autoResumeHours: 72,
      lastOutboundAt: '2026-07-18T09:15:18.290454+00:00',
      createdAt: '2026-05-22T08:29:34.523762+00:00',
      now: new Date('2026-08-24T06:21:02.930000+00:00'),
    })).toBe(true);
  });
});
