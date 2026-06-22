// ─────────────────────────────────────────────────────────────
// Timezone helpers
// The project stores booking date/time as the tenant's LOCAL wall-clock
// (e.g. "2026-06-25" + "20:00:00" in Asia/Kolkata). To schedule anything
// against it we need the matching UTC instant. No tz library is used in
// the repo, so we compute the zone offset via Intl (handles DST correctly).
// ─────────────────────────────────────────────────────────────

/**
 * Convert a local wall-clock date+time in the given IANA timezone to a UTC Date.
 * @param dateStr "YYYY-MM-DD"
 * @param timeStr "HH:MM" or "HH:MM:SS"
 * @param tz IANA timezone, e.g. "Asia/Kolkata"
 * @returns a Date representing the exact UTC instant, or null if inputs are invalid.
 */
export function zonedDateTimeToUtc(dateStr: string, timeStr: string, tz: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const time = timeStr.length === 5 ? `${timeStr}:00` : timeStr.slice(0, 8);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return null;

  // Treat the wall-clock as if it were UTC, then correct by the zone's offset
  // at that instant. offset = (same instant rendered in tz) - (rendered in UTC).
  const asUtc = new Date(`${dateStr}T${time}Z`);
  if (isNaN(asUtc.getTime())) return null;

  try {
    const inTz = new Date(asUtc.toLocaleString('en-US', { timeZone: tz }));
    const inUtc = new Date(asUtc.toLocaleString('en-US', { timeZone: 'UTC' }));
    const offsetMs = inTz.getTime() - inUtc.getTime();
    return new Date(asUtc.getTime() - offsetMs);
  } catch {
    // Unknown timezone — fall back to treating the input as UTC.
    return asUtc;
  }
}
