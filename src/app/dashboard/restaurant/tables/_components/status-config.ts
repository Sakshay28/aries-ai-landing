import type { TableStatus } from './use-tables-api';

export interface StatusStyle {
  label: string;
  dot: string;        // dot / accent bg
  cardBg: string;     // grid card background
  cardBorder: string;
  ring: string;       // hover ring
  text: string;       // strong text on tinted bg
  meta: string;       // muted text on tinted bg
  pill: string;       // filter pill / badge (solid-ish)
  compact: string;    // compact-chip background + text
}

export const STATUS_STYLES: Record<TableStatus, StatusStyle> = {
  available: {
    label: 'Available',
    dot: 'bg-emerald-500',
    cardBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    cardBorder: 'border-emerald-200/70 dark:border-emerald-800/40',
    ring: 'hover:ring-emerald-300/60 dark:hover:ring-emerald-700/50',
    text: 'text-emerald-900 dark:text-emerald-200',
    meta: 'text-emerald-600 dark:text-emerald-400',
    pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    compact: 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-200/60 dark:border-emerald-800/40',
  },
  reserved: {
    label: 'Reserved',
    dot: 'bg-amber-500',
    cardBg: 'bg-amber-50 dark:bg-amber-950/40',
    cardBorder: 'border-amber-200/70 dark:border-amber-800/40',
    ring: 'hover:ring-amber-300/60 dark:hover:ring-amber-700/50',
    text: 'text-amber-900 dark:text-amber-200',
    meta: 'text-amber-600 dark:text-amber-400',
    pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    compact: 'bg-amber-100/80 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200/60 dark:border-amber-800/40',
  },
  occupied: {
    label: 'Occupied',
    dot: 'bg-rose-500',
    cardBg: 'bg-rose-50 dark:bg-rose-950/40',
    cardBorder: 'border-rose-200/70 dark:border-rose-800/40',
    ring: 'hover:ring-rose-300/60 dark:hover:ring-rose-700/50',
    text: 'text-rose-900 dark:text-rose-200',
    meta: 'text-rose-600 dark:text-rose-400',
    pill: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    compact: 'bg-rose-100/80 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200 border-rose-200/60 dark:border-rose-800/40',
  },
  cleaning: {
    label: 'Cleaning',
    dot: 'bg-sky-500',
    cardBg: 'bg-sky-50 dark:bg-sky-950/40',
    cardBorder: 'border-sky-200/70 dark:border-sky-800/40',
    ring: 'hover:ring-sky-300/60 dark:hover:ring-sky-700/50',
    text: 'text-sky-900 dark:text-sky-200',
    meta: 'text-sky-600 dark:text-sky-400',
    pill: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    compact: 'bg-sky-100/80 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200 border-sky-200/60 dark:border-sky-800/40',
  },
  blocked: {
    label: 'Blocked',
    dot: 'bg-slate-400',
    cardBg: 'bg-slate-100 dark:bg-slate-900/50',
    cardBorder: 'border-slate-300/70 dark:border-slate-700/50',
    ring: 'hover:ring-slate-300/60 dark:hover:ring-slate-600/50',
    text: 'text-slate-700 dark:text-slate-300',
    meta: 'text-slate-500 dark:text-slate-400',
    pill: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    compact: 'bg-slate-200/80 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-slate-300/60 dark:border-slate-700/50',
  },
};

export const STATUS_ORDER: TableStatus[] = ['available', 'reserved', 'occupied', 'cleaning', 'blocked'];

export const INTERNAL_LABELS = [
  'VIP Hold',
  'Birthday Setup',
  'Reserved by Manager',
  'Private Event',
  'Staff Hold',
  'Maintenance',
];

/** "45m" / "1h 20m" / "Just now" since a timestamp. */
export function elapsed(ts: string | number | null | undefined): string {
  if (!ts) return '';
  const time = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  if (!Number.isFinite(time)) return '';
  const mins = Math.floor((Date.now() - time) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

/** Local clock like "8:05 pm". */
export function clock(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function isBirthdayToday(birthday?: string | null): boolean {
  if (!birthday) return false;
  const now = new Date();
  const parts = birthday.split('-').map(Number);
  if (parts.length < 3) return false;
  const [, m, d] = parts;
  return now.getMonth() + 1 === m && now.getDate() === d;
}
