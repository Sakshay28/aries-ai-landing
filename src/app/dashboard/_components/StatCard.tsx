// KPI card — Tailwind only, no inline style objects.
import type { ReactNode } from 'react';

type Trend = 'up' | 'down' | 'flat';

export function StatCard({
  label,
  value,
  delta,
  trend = 'flat',
  icon,
  hint,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: Trend;
  icon?: ReactNode;
  hint?: string;
}) {
  const trendColor =
    trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-rose-500' : 'text-zinc-500';
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '·';

  return (
    <div className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</span>
        {icon ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 group-hover:bg-zinc-900 group-hover:text-white transition">
            {icon}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[34px] font-semibold tracking-tight text-zinc-900 leading-none">{value}</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {delta ? <span className={`font-semibold ${trendColor}`}>{arrow} {delta}</span> : null}
        {hint ? <span className="text-zinc-500">{hint}</span> : null}
      </div>
    </div>
  );
}
