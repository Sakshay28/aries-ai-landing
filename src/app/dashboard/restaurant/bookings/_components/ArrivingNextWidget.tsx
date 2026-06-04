'use client';

import { useState, useEffect } from 'react';
import { Phone, MessageCircle, Clock } from 'lucide-react';
import type { RestaurantBooking } from '@/lib/types';

interface Props {
  bookings: RestaurantBooking[];
  selectedDate: string;
  todayIST: string;
}

function getISTTimeStr(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}:00`;
}

function slotDiffMins(slotTime: string, currentTime: string): number {
  const [sh, sm] = slotTime.split(':').map(Number);
  const [ch, cm] = currentTime.split(':').map(Number);
  return (sh * 60 + sm) - (ch * 60 + cm);
}

function formatSlotTime(timeStr?: string | null): string {
  if (!timeStr) return '—';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return timeStr; }
}

function formatCurrentTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

type ArrivalTag = 'late' | 'now' | 'next' | 'soon';

interface Arrival {
  booking: RestaurantBooking;
  diff: number;
  tag: ArrivalTag;
}

export function ArrivingNextWidget({ bookings, selectedDate, todayIST }: Props) {
  const [currentTime, setCurrentTime] = useState(getISTTimeStr());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getISTTimeStr()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Only show for today
  if (selectedDate !== todayIST) return null;

  const confirmed = bookings.filter(b => b.booking_status === 'confirmed' && b.slot_time);

  if (confirmed.length === 0) return null;

  // Classify each confirmed booking
  const arrivals: Arrival[] = confirmed
    .map(b => {
      const diff = slotDiffMins(b.slot_time!, currentTime);
      let tag: ArrivalTag;
      if (diff < -30) tag = 'late';          // overdue by >30 min
      else if (diff <= 20) tag = 'now';       // within 20 min (before or slight late)
      else if (diff <= 90) tag = 'next';      // 20–90 min out
      else tag = 'soon';                      // >90 min out
      return { booking: b, diff, tag };
    })
    .filter(a => a.tag !== 'late')             // hide heavily overdue
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 4);

  if (arrivals.length === 0) return null;

  const tagConfig: Record<ArrivalTag, { label: string; bg: string; dot: string; text: string }> = {
    now:  { label: 'ARRIVING NOW', bg: 'bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-500 animate-pulse', text: 'text-emerald-700 dark:text-emerald-400' },
    next: { label: 'NEXT UP',      bg: 'bg-primary/5 border-primary/20',          dot: 'bg-primary',                   text: 'text-primary' },
    soon: { label: 'SOON',         bg: 'bg-muted border-border',                  dot: 'bg-muted-foreground',          text: 'text-muted-foreground' },
    late: { label: 'OVERDUE',      bg: 'bg-amber-500/10 border-amber-500/30',     dot: 'bg-amber-500',                 text: 'text-amber-700 dark:text-amber-400' },
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Arriving Next</span>
        </div>
        <span className="text-xs text-muted-foreground font-mono">{formatCurrentTime(currentTime)}</span>
      </div>

      {/* Arrival cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {arrivals.map(({ booking, diff, tag }) => {
          const cfg = tagConfig[tag];
          const diffLabel = diff <= 0
            ? `${Math.abs(diff)}m late`
            : diff < 60 ? `in ${diff}m` : `in ${Math.floor(diff/60)}h ${diff%60}m`;

          return (
            <div key={booking.id}
              className={`rounded-lg border p-3 space-y-2 ${cfg.bg}`}
            >
              {/* Tag */}
              <div className="flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                <span className={`text-[10px] font-bold tracking-wider ${cfg.text}`}>{cfg.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{diffLabel}</span>
              </div>

              {/* Guest info */}
              <div>
                <p className="text-sm font-semibold text-foreground leading-tight truncate">{booking.customer_name}</p>
                <p className="text-xs text-muted-foreground">
                  {booking.party_size} cover{booking.party_size !== 1 ? 's' : ''} · {formatSlotTime(booking.slot_time)}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-1.5">
                <a href={`tel:+${booking.customer_phone}`}
                  className="flex-1 flex items-center justify-center gap-1 h-7 rounded-md bg-background border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors">
                  <Phone className="size-3" /> Call
                </a>
                <a href={`https://wa.me/${booking.customer_phone}`} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1 h-7 rounded-md bg-background border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors">
                  <MessageCircle className="size-3" /> WA
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
