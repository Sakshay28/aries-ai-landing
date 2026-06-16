'use client';

import {
  CalendarPlus, UtensilsCrossed, Footprints, CheckCircle2, Sparkles,
  Ban, ShieldOff, XCircle, Plus, RefreshCw, type LucideIcon,
} from 'lucide-react';
import { elapsed } from './status-config';
import type { ActivityItem } from './use-tables-api';

const ACTION_META: Record<string, { icon: LucideIcon; verb: string; color: string }> = {
  reserved:      { icon: CalendarPlus,     verb: 'Reserved',              color: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40' },
  seated:        { icon: UtensilsCrossed,  verb: 'Seated',                color: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/40' },
  walk_in:       { icon: Footprints,       verb: 'Walk-in seated',        color: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/40' },
  freed:         { icon: CheckCircle2,     verb: 'Freed',                 color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40' },
  cleaning:      { icon: Sparkles,         verb: 'Marked cleaning',       color: 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/40' },
  blocked:       { icon: Ban,              verb: 'Blocked',               color: 'text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-800' },
  unblocked:     { icon: ShieldOff,        verb: 'Unblocked',             color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40' },
  cancelled:     { icon: XCircle,          verb: 'Reservation cancelled', color: 'text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/40' },
  created:       { icon: Plus,             verb: 'Table added',           color: 'text-muted-foreground bg-muted' },
  status_change: { icon: RefreshCw,        verb: 'Status changed',        color: 'text-muted-foreground bg-muted' },
};

export function ActivityTimeline({ items, compact = false }: { items: ActivityItem[]; compact?: boolean }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No activity yet.</p>;
  }
  return (
    <ol className="space-y-1">
      {items.map((it) => {
        const meta = ACTION_META[it.action] || ACTION_META.status_change;
        const Icon = meta.icon;
        const who = it.guest_name || it.detail || '';
        return (
          <li key={it.id} className="flex items-start gap-3 py-2">
            <span className={`mt-0.5 h-7 w-7 shrink-0 rounded-full flex items-center justify-center ${meta.color}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 grow">
              <p className="text-sm text-foreground leading-snug">
                <span className="font-medium">{meta.verb}</span>
                {it.table_name && <span className="text-muted-foreground"> · {it.table_name}</span>}
                {who && <span className="text-muted-foreground"> · {who}</span>}
                {it.guest_count != null && <span className="text-muted-foreground"> · {it.guest_count}p</span>}
              </p>
              {!compact && (
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  {elapsed(it.created_at)} ago{it.actor && it.actor !== 'system' ? ` · ${it.actor.split('@')[0]}` : it.actor === 'system' ? ' · auto' : ''}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
