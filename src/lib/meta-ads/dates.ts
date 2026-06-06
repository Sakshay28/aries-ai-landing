import type { DateFilter } from './types';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function resolveDateRange(
  filter: DateFilter,
  customFrom?: string,
  customTo?: string
): DateRange {
  const now = new Date();
  const today = fmt(now);

  switch (filter) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: fmt(y), to: fmt(y) };
    }
    case 'last_7_days': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: fmt(from), to: today };
    }
    case 'last_30_days': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: fmt(from), to: today };
    }
    case 'custom':
      return {
        from: customFrom || today,
        to: customTo || today,
      };
    default: {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: fmt(from), to: today };
    }
  }
}

/** Build an array of every YYYY-MM-DD in [from, to] inclusive. */
export function enumerateDays(from: string, to: string): string[] {
  const days: string[] = [];
  const start = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(fmt(new Date(d)));
  }
  return days;
}
