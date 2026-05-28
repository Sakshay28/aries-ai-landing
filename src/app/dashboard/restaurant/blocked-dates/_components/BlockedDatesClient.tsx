'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RestaurantBlockedDate } from '@/lib/types';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// ── Calendar Grid Component ───────────────────────────────────────────────
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Fill leading empty days (Mon-aligned)
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // convert to Mon=0
  for (let i = 0; i < startDow; i++) days.push(new Date(0)); // placeholder

  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toMonthStr(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function BlockedDatesClient() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [blockedDates, setBlockedDates] = useState<RestaurantBlockedDate[]>([]);
  const [loading, setLoading] = useState(true);

  // Block form
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const blockedSet = useMemo(() => {
    const s = new Set<string>();
    blockedDates.forEach((b) => s.add(b.blocked_date));
    return s;
  }, [blockedDates]);

  const blockedByDate = useMemo(() => {
    const m: Record<string, RestaurantBlockedDate> = {};
    blockedDates.forEach((b) => { m[b.blocked_date] = b; });
    return m;
  }, [blockedDates]);

  const fetchBlocked = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/restaurant/blocked-dates?month=${toMonthStr(year, month)}`);
      if (!res.ok) throw new Error('Failed to load blocked dates');
      const { data } = await res.json();
      setBlockedDates(data ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchBlocked(); }, [fetchBlocked]);

  const handleDayClick = (date: Date) => {
    if (!date.getTime()) return; // placeholder
    const dateStr = toDateStr(date);
    if (blockedSet.has(dateStr)) {
      // Show detail for already-blocked date
      setSelectedDate(dateStr);
      setBlockReason('');
    } else {
      setSelectedDate(dateStr);
      setBlockReason('');
    }
  };

  const blockDate = async () => {
    if (!selectedDate) return;
    setBlocking(true);
    try {
      const res = await fetch('/api/restaurant/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocked_date: selectedDate, reason: blockReason || null }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Failed to block date');
      }
      toast.success(`${selectedDate} blocked`);
      setSelectedDate(null);
      await fetchBlocked();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBlocking(false);
    }
  };

  const unblockDate = async (id: string, date: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/restaurant/blocked-dates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to unblock date');
      toast.success(`${date} unblocked`);
      setSelectedDate(null);
      await fetchBlocked();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  };

  const calendarDays = getDaysInMonth(year, month);
  const todayStr = toDateStr(now);
  const selectedIsBlocked = selectedDate ? blockedSet.has(selectedDate) : false;
  const selectedBlockRecord = selectedDate ? blockedByDate[selectedDate] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Blocked Dates</h1>
        <p className="text-sm text-muted-foreground mt-1">Click a date to block or unblock it for reservations.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
        {/* Calendar */}
        <Card className="bg-card border-border shadow-none rounded-xl">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button id="prev-month" variant="ghost" size="icon" className="size-8" onClick={prevMonth}>
                <ChevronLeft className="size-4" />
              </Button>
              <CardTitle className="text-sm font-semibold">
                {MONTH_NAMES[month]} {year}
              </CardTitle>
              <Button id="next-month" variant="ghost" size="icon" className="size-8" onClick={nextMonth}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : (
              <>
                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 mb-2">
                  {DAYS_OF_WEEK.map((d) => (
                    <div key={d} className="text-center text-[10px] font-bold text-muted-foreground uppercase py-1">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((date, idx) => {
                    if (!date.getTime()) {
                      return <div key={`empty-${idx}`} />;
                    }
                    const dateStr = toDateStr(date);
                    const isBlocked = blockedSet.has(dateStr);
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    const isPast = dateStr < todayStr;

                    return (
                      <button
                        key={dateStr}
                        id={`cal-day-${dateStr}`}
                        onClick={() => handleDayClick(date)}
                        className={[
                          'relative flex items-center justify-center rounded-lg text-sm h-10 transition-colors font-medium',
                          isPast && !isBlocked ? 'text-muted-foreground/40 cursor-default' : 'cursor-pointer',
                          isBlocked
                            ? 'bg-destructive/15 text-destructive border border-destructive/20'
                            : isSelected
                              ? 'bg-primary text-primary-foreground'
                              : isToday
                                ? 'border-2 border-primary text-primary'
                                : 'hover:bg-muted text-foreground',
                        ].join(' ')}
                      >
                        {date.getDate()}
                        {isBlocked && (
                          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-destructive/60" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded bg-destructive/15 border border-destructive/20" />
                    Blocked
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded border-2 border-primary" />
                    Today
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Side panel: selected date actions */}
        {selectedDate ? (
          <Card className="bg-card border-border shadow-none rounded-xl">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </CardTitle>
                <Button
                  id="close-date-panel"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setSelectedDate(null)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedIsBlocked && selectedBlockRecord ? (
                <>
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                    <p className="text-xs font-medium text-destructive">This date is blocked</p>
                    {selectedBlockRecord.reason && (
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedBlockRecord.reason}</p>
                    )}
                  </div>
                  <Button
                    id={`unblock-${selectedDate}`}
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={deletingId === selectedBlockRecord.id}
                    onClick={() => unblockDate(selectedBlockRecord.id, selectedDate)}
                  >
                    {deletingId === selectedBlockRecord.id ? 'Unblocking…' : 'Unblock This Date'}
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Reason (optional)</label>
                    <input
                      id="block-reason"
                      type="text"
                      value={blockReason}
                      onChange={(e) => setBlockReason(e.target.value)}
                      placeholder="e.g. Private event, Holiday"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <Button
                    id={`block-${selectedDate}`}
                    size="sm"
                    className="w-full"
                    disabled={blocking}
                    onClick={blockDate}
                  >
                    {blocking ? 'Blocking…' : 'Block This Date'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card border-border shadow-none rounded-xl">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Click a date on the calendar to block or unblock it.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Blocked dates list */}
      {blockedDates.length > 0 && (
        <Card className="bg-card border-border shadow-none rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Blocked This Month ({blockedDates.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {blockedDates.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {new Date(b.blocked_date + 'T00:00:00').toLocaleDateString('en-IN', {
                        weekday: 'short', day: 'numeric', month: 'short',
                      })}
                    </p>
                    {b.reason && (
                      <p className="text-xs text-muted-foreground">{b.reason}</p>
                    )}
                  </div>
                  <Button
                    id={`unblock-list-${b.id}`}
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive hover:text-destructive"
                    disabled={deletingId === b.id}
                    onClick={() => unblockDate(b.id, b.blocked_date)}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
