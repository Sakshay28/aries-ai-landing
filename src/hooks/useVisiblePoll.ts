'use client';

import { useEffect, useRef } from 'react';

// Polls `fn` every `intervalMs`, but only while the tab is visible and never
// while a previous call is still in flight. If `fn` throws or returns false,
// the next tick waits twice as long (capped at `maxBackoffMs`) so a slow
// database is not hammered harder the slower it gets. Resets on success.
//
// Why this exists: 4–5s setInterval polls on the broadcast/Shopify pages kept
// firing in background tabs and stacked up behind a slow Supabase, which is
// what drained the free-plan Disk IO budget on 2026-10-29.
export function useVisiblePoll(
  fn: () => Promise<unknown> | unknown,
  intervalMs: number,
  { enabled = true, immediate = false, maxBackoffMs = 5 * 60_000 }: { enabled?: boolean; immediate?: boolean; maxBackoffMs?: number } = {},
) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let inFlight = false;
    let delay = intervalMs;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms = delay) => {
      if (cancelled) return;
      timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      if (cancelled) return;
      if (document.hidden || inFlight) { schedule(); return; }
      inFlight = true;
      let ok = true;
      try {
        ok = (await fnRef.current()) !== false;
      } catch {
        ok = false;
      } finally {
        inFlight = false;
      }
      delay = ok ? intervalMs : Math.min(delay * 2, maxBackoffMs);
      schedule();
    };

    // Catch up straight away when the user comes back to the tab.
    const onVisible = () => {
      if (document.hidden || inFlight) return;
      if (timer) clearTimeout(timer);
      tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    schedule(immediate ? 0 : delay);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled, immediate, maxBackoffMs]);
}
