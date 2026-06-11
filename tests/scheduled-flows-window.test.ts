import { describe, it, expect } from 'vitest';
import { scheduledOccurrenceInWindow } from '../src/lib/flows/engine';

// Helper: build a UTC Date succinctly
const utc = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(Date.UTC(y, mo - 1, d, h, mi));

describe('scheduledOccurrenceInWindow', () => {
  it('fires a daily schedule whose time falls inside the window', () => {
    const occ = scheduledOccurrenceInWindow(
      '14:30', 'daily', 1, 1,
      utc(2026, 6, 11, 14, 25), utc(2026, 6, 11, 14, 35),
    );
    expect(occ).not.toBeNull();
    expect(occ!.toISOString()).toBe(utc(2026, 6, 11, 14, 30).toISOString());
  });

  it('does not fire when the time is outside the window', () => {
    expect(scheduledOccurrenceInWindow(
      '14:30', 'daily', 1, 1,
      utc(2026, 6, 11, 9, 0), utc(2026, 6, 11, 9, 10),
    )).toBeNull();
  });

  it('REGRESSION: a 14:30 flow under the old daily-09:00 invocation now fires in its own window', () => {
    // Old behavior: only invocation of the day was 09:00 UTC, "09:00" !== "14:30",
    // so this flow never fired. New behavior: the 14:25→14:35 tick catches it.
    const at9am = scheduledOccurrenceInWindow(
      '14:30', 'daily', 1, 1,
      utc(2026, 6, 11, 8, 50), utc(2026, 6, 11, 9, 0),
    );
    expect(at9am).toBeNull(); // 09:00 tick correctly skips it…
    const atOwnTime = scheduledOccurrenceInWindow(
      '14:30', 'daily', 1, 1,
      utc(2026, 6, 11, 14, 25), utc(2026, 6, 11, 14, 35),
    );
    expect(atOwnTime).not.toBeNull(); // …and its own window fires it
  });

  it('window is half-open: excludes windowStart, includes windowEnd', () => {
    // occurrence exactly AT windowStart was already covered by the previous tick
    expect(scheduledOccurrenceInWindow(
      '14:30', 'daily', 1, 1,
      utc(2026, 6, 11, 14, 30), utc(2026, 6, 11, 14, 40),
    )).toBeNull();
    // occurrence exactly AT windowEnd belongs to this tick
    expect(scheduledOccurrenceInWindow(
      '14:30', 'daily', 1, 1,
      utc(2026, 6, 11, 14, 20), utc(2026, 6, 11, 14, 30),
    )).not.toBeNull();
  });

  it('catches schedules across a midnight-crossing window', () => {
    const occ = scheduledOccurrenceInWindow(
      '23:55', 'daily', 1, 1,
      utc(2026, 6, 11, 23, 50), utc(2026, 6, 12, 0, 5),
    );
    expect(occ).not.toBeNull();
    expect(occ!.getUTCDate()).toBe(11);
  });

  it('weekly fires only on the matching UTC day-of-week', () => {
    // 2026-06-11 is a Thursday (UTC day 4)
    expect(scheduledOccurrenceInWindow(
      '10:00', 'weekly', 4, 1,
      utc(2026, 6, 11, 9, 55), utc(2026, 6, 11, 10, 5),
    )).not.toBeNull();
    expect(scheduledOccurrenceInWindow(
      '10:00', 'weekly', 1, 1, // Monday — wrong day
      utc(2026, 6, 11, 9, 55), utc(2026, 6, 11, 10, 5),
    )).toBeNull();
  });

  it('monthly fires only on the matching day-of-month', () => {
    expect(scheduledOccurrenceInWindow(
      '10:00', 'monthly', 1, 11,
      utc(2026, 6, 11, 9, 55), utc(2026, 6, 11, 10, 5),
    )).not.toBeNull();
    expect(scheduledOccurrenceInWindow(
      '10:00', 'monthly', 1, 15, // 15th — wrong day
      utc(2026, 6, 11, 9, 55), utc(2026, 6, 11, 10, 5),
    )).toBeNull();
  });

  it('rejects malformed or out-of-range time strings', () => {
    const start = utc(2026, 6, 11, 0, 0);
    const end = utc(2026, 6, 12, 0, 0);
    expect(scheduledOccurrenceInWindow('not-a-time', 'daily', 1, 1, start, end)).toBeNull();
    expect(scheduledOccurrenceInWindow('25:00', 'daily', 1, 1, start, end)).toBeNull();
    expect(scheduledOccurrenceInWindow('10:75', 'daily', 1, 1, start, end)).toBeNull();
    expect(scheduledOccurrenceInWindow('', 'daily', 1, 1, start, end)).toBeNull();
  });

  it('single-digit hour format "9:00" is accepted', () => {
    expect(scheduledOccurrenceInWindow(
      '9:00', 'daily', 1, 1,
      utc(2026, 6, 11, 8, 55), utc(2026, 6, 11, 9, 5),
    )).not.toBeNull();
  });
});
