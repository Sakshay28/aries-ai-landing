import { describe, it, expect } from 'vitest';
import {
  parseToMinutes, minutesToHHMM, formatTime12h,
  generateTimeSlots, defaultSlotValue, rangesOverlap,
} from '@/app/dashboard/restaurant/tables/_components/time-utils';

describe('parseToMinutes', () => {
  it('parses HH:MM and HH:MM:SS', () => {
    expect(parseToMinutes('00:00')).toBe(0);
    expect(parseToMinutes('11:30')).toBe(690);
    expect(parseToMinutes('23:00:00')).toBe(1380);
  });
  it('rejects junk', () => {
    expect(parseToMinutes('nope')).toBeNull();
    expect(parseToMinutes('')).toBeNull();
    expect(parseToMinutes(null)).toBeNull();
  });
});

describe('minutesToHHMM', () => {
  it('formats and wraps past 24h', () => {
    expect(minutesToHHMM(0)).toBe('00:00');
    expect(minutesToHHMM(690)).toBe('11:30');
    expect(minutesToHHMM(1500)).toBe('01:00'); // 25:00 -> 01:00
  });
});

describe('formatTime12h', () => {
  it('converts 24h to 12h', () => {
    expect(formatTime12h('00:00')).toBe('12:00 AM');
    expect(formatTime12h('12:00')).toBe('12:00 PM');
    expect(formatTime12h('19:30')).toBe('7:30 PM');
    expect(formatTime12h('09:05:00')).toBe('9:05 AM');
  });
});

describe('generateTimeSlots', () => {
  it('generates inclusive slots at the interval', () => {
    const slots = generateTimeSlots('11:00', '13:00', 30);
    expect(slots.map((s) => s.value)).toEqual(['11:00', '11:30', '12:00', '12:30', '13:00']);
    expect(slots[3].label).toBe('12:30 PM');
  });
  it('handles a past-midnight close time', () => {
    const slots = generateTimeSlots('23:00', '01:00', 60);
    expect(slots.map((s) => s.value)).toEqual(['23:00', '00:00', '01:00']);
  });
  it('falls back to 30m for an invalid interval', () => {
    const slots = generateTimeSlots('11:00', '12:00', 45);
    expect(slots.map((s) => s.value)).toEqual(['11:00', '11:30', '12:00']);
  });
  it('falls back to defaults for malformed hours', () => {
    const slots = generateTimeSlots('bad', 'worse', 60);
    expect(slots[0].value).toBe('11:00');
    expect(slots.length).toBeGreaterThan(0);
  });
});

describe('defaultSlotValue', () => {
  const slots = generateTimeSlots('11:00', '23:00', 60);
  it('picks the next upcoming slot', () => {
    expect(defaultSlotValue(slots, 12 * 60 + 15)).toBe('13:00');
    expect(defaultSlotValue(slots, 11 * 60)).toBe('11:00');
  });
  it('falls back to first slot when all are past', () => {
    expect(defaultSlotValue(slots, 23 * 60 + 30)).toBe('11:00');
  });
  it('returns empty for no slots', () => {
    expect(defaultSlotValue([], 600)).toBe('');
  });
});

describe('rangesOverlap (double-booking guard)', () => {
  it('same time overlaps (7pm vs 7pm)', () => {
    expect(rangesOverlap(1140, 120, 1140, 120)).toBe(true);
  });
  it('adjacent-but-inside overlaps (7pm vs 8pm, 2h holds)', () => {
    expect(rangesOverlap(1140, 120, 1200, 120)).toBe(true);
  });
  it('non-overlapping windows are allowed (7pm vs 9:30pm, 2h holds)', () => {
    expect(rangesOverlap(1140, 120, 1290, 120)).toBe(false);
  });
  it('back-to-back windows do not overlap (7pm+2h ends exactly at 9pm)', () => {
    expect(rangesOverlap(1140, 120, 1260, 120)).toBe(false);
  });
});
