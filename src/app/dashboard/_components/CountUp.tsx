"use client";

import { useEffect, useRef, useState } from 'react';

// Lightweight count-up. No external lib, ease-out cubic, ~1s.
export function CountUp({
  end,
  duration = 1000,
  format = (n: number) => Math.round(n).toLocaleString('en-IN'),
  prefix = '',
  suffix = '',
  className = '',
}: {
  end: number;
  duration?: number;
  format?: (n: number) => string;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(end * eased);
      if (t < 1) raf = requestAnimationFrame(step);
      else setValue(end);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);

  return (
    <span className={className}>
      {prefix}
      {format(value)}
      {suffix}
    </span>
  );
}
