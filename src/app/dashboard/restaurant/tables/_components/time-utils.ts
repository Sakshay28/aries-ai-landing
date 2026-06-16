// Pure time helpers for the Tables reservation picker.
// Slots are generated from restaurant operating hours + a configurable
// interval — no hardcoded time buttons anywhere.

export interface TimeSlot {
  value: string; // "19:30" (24h, for storage / submit)
  label: string; // "7:30 PM" (display)
}

/** "HH:MM" | "HH:MM:SS" -> minutes since midnight. Invalid -> null. */
export function parseToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** minutes since midnight -> "HH:MM" (24h). */
export function minutesToHHMM(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "HH:MM" | "HH:MM:SS" -> "7:30 PM". */
export function formatTime12h(t: string): string {
  const mins = parseToMinutes(t);
  if (mins === null) return t;
  const h = Math.floor(mins / 60);
  const min = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
}

/**
 * Generate selectable reservation slots between open and close at `interval`
 * minutes. Handles past-midnight close times (e.g. 11:00 -> 02:00).
 * Falls back to sane defaults if inputs are malformed.
 */
export function generateTimeSlots(
  openTime: string,
  closeTime: string,
  intervalMin: number
): TimeSlot[] {
  const interval = [15, 30, 60].includes(Math.round(intervalMin)) ? Math.round(intervalMin) : 30;
  const start = parseToMinutes(openTime) ?? 11 * 60;
  let end = parseToMinutes(closeTime) ?? 23 * 60;
  if (end <= start) end += 1440; // close after midnight

  const slots: TimeSlot[] = [];
  for (let m = start; m <= end; m += interval) {
    const hhmm = minutesToHHMM(m);
    slots.push({ value: hhmm, label: formatTime12h(hhmm) });
    if (slots.length > 200) break; // safety
  }
  return slots;
}

/**
 * Whether two time windows overlap, given start (minutes since midnight) and
 * duration (minutes). Mirrors the double-booking guard in reserve_specific_table
 * (SQL): existingStart < newEnd AND newStart < existingEnd.
 */
export function rangesOverlap(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  return aStart < bStart + bDur && bStart < aStart + aDur;
}

/**
 * Default time to pre-select: the next upcoming slot from `now`, else the
 * first slot. `nowMinutes` defaults to the current local time.
 */
export function defaultSlotValue(slots: TimeSlot[], nowMinutes?: number): string {
  if (slots.length === 0) return '';
  const now = nowMinutes ?? (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const upcoming = slots.find((s) => (parseToMinutes(s.value) ?? 0) >= now);
  return (upcoming ?? slots[0]).value;
}
