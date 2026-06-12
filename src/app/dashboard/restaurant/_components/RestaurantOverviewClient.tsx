'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Phone, MessageCircle, Wifi, Star, Clock, Users, CalendarClock, ArrowRight, RefreshCw, Layers } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { RestaurantSlot } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────
interface EnrichedBooking {
  id: string;
  reservation_id: string;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  booking_status: string;
  booking_date: string;
  special_request?: string | null;
  source?: string | null;
  slot_time?: string | null;
  created_at: string;
  updated_at: string;
  is_vip: boolean;
  vip_tags: string[];
  visit_count: number;
  last_visit: string | null;
}

interface WaitlistEntry {
  id: string;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  position: number;
  status: string;
  slot_time?: string | null;
  notes?: string | null;
}

interface OverviewData {
  todaySummary: { confirmed: number; expectedCovers: number; totalReservations: number; waitlistCount: number };
  allBookings: EnrichedBooking[];
  confirmedBookings: EnrichedBooking[];
  vipGuestsToday: EnrichedBooking[];
  waitlistToday: WaitlistEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getISTTimeStr(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return `${String(ist.getUTCHours()).padStart(2,'0')}:${String(ist.getUTCMinutes()).padStart(2,'0')}:00`;
}
function getISTDateStr(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
}
function slotDiffMins(slot: string, now: string): number {
  const [sh, sm] = slot.split(':').map(Number);
  const [nh, nm] = now.split(':').map(Number);
  return (sh * 60 + sm) - (nh * 60 + nm);
}
function fmt(t?: string | null): string {
  if (!t) return '—';
  try {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return t; }
}
function lastVisitLabel(dateStr: string | null): string {
  if (!dateStr) return '';
  const days = Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000);
  if (days === 0) return 'visited today';
  if (days === 1) return 'last visit yesterday';
  if (days < 7)  return `last visit ${days} days ago`;
  if (days < 14) return 'last visit 1 week ago';
  return `last visit ${Math.floor(days / 7)} weeks ago`;
}

type ArrivalTag = 'now' | 'next' | 'soon';
function classify(b: EnrichedBooking, now: string): ArrivalTag | null {
  if (!b.slot_time) return null;
  const d = slotDiffMins(b.slot_time, now);
  if (d < -30) return null;
  if (d <= 20)  return 'now';
  if (d <= 90)  return 'next';
  return 'soon';
}

// ─── Arriving Now Hero ────────────────────────────────────────────────────────
const TAG_CFG = {
  now:  { label: 'ARRIVING NOW', wrap: 'border-emerald-500/40 bg-emerald-500/5', head: 'bg-emerald-500/10', dot: 'bg-emerald-500 animate-pulse', txt: 'text-emerald-700 dark:text-emerald-400' },
  next: { label: 'NEXT UP',      wrap: 'border-primary/30 bg-primary/[0.03]',    head: 'bg-primary/10',      dot: 'bg-primary',                  txt: 'text-primary' },
  soon: { label: 'SOON',         wrap: 'border-border bg-muted/10',              head: 'bg-muted/50',        dot: 'bg-muted-foreground',         txt: 'text-muted-foreground' },
};

function ArrivingNowHero({ bookings, now }: { bookings: EnrichedBooking[]; now: string }) {
  const cards = bookings
    .map(b => ({ b, tag: classify(b, now) }))
    .filter((x): x is { b: EnrichedBooking; tag: ArrivalTag } => x.tag !== null)
    .sort((a, z) => slotDiffMins(a.b.slot_time!, now) - slotDiffMins(z.b.slot_time!, now))
    .slice(0, 6);

  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-3 px-1">
        No arrivals expected in the next 90 minutes.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {cards.map(({ b, tag }) => {
        const cfg = TAG_CFG[tag];
        const diff = slotDiffMins(b.slot_time!, now);
        const diffLabel = diff <= 0 ? `${Math.abs(diff)}m late` : diff < 60 ? `in ${diff}m` : `in ${Math.floor(diff/60)}h ${diff % 60}m`;

        return (
          <div key={b.id} className={`rounded-xl border p-4 space-y-3 ${cfg.wrap}`}>
            {/* Status bar */}
            <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${cfg.head}`}>
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full shrink-0 ${cfg.dot}`} />
                <span className={`text-[10px] font-bold tracking-wider ${cfg.txt}`}>{cfg.label}</span>
                {b.is_vip && <Star className="size-3 text-amber-500 fill-amber-500" />}
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">{diffLabel}</span>
            </div>

            {/* Guest */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-foreground leading-tight">{b.customer_name}</p>
                {b.is_vip && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300/40">
                    VIP
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="size-3" />{fmt(b.slot_time)}</span>
                <span className="flex items-center gap-1"><Users className="size-3" />{b.party_size} cover{b.party_size !== 1 ? 's' : ''}</span>
              </div>
              {b.is_vip && b.visit_count > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-500 font-medium">
                  {b.visit_count} visit{b.visit_count !== 1 ? 's' : ''}
                  {b.last_visit ? ` · ${lastVisitLabel(b.last_visit)}` : ''}
                </p>
              )}
              {b.special_request && (
                <p className="text-[11px] text-muted-foreground italic truncate">"{b.special_request}"</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-1.5">
              <a href={`tel:+${b.customer_phone}`} className="flex-1">
                <Button size="sm" variant="outline" className="w-full h-8 text-xs">
                  <Phone className="size-3 mr-1" /> Call
                </Button>
              </a>
              <a href={`https://wa.me/${b.customer_phone}`} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button size="sm" variant="outline" className="w-full h-8 text-xs">
                  <MessageCircle className="size-3 mr-1" /> WA
                </Button>
              </a>
              <Link href="/dashboard/restaurant/bookings">
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0">
                  <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
const STATUS_DOT: Record<string, string> = {
  confirmed: 'bg-emerald-500',
  completed: 'bg-muted-foreground',
  no_show:   'bg-amber-500',
  cancelled: 'bg-destructive/60',
};

function TodayTimeline({ bookings }: { bookings: EnrichedBooking[] }) {
  if (bookings.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No reservations scheduled today.</p>;
  }

  const bySlot: Record<string, EnrichedBooking[]> = {};
  bookings.forEach(b => {
    const k = b.slot_time ?? '__none__';
    (bySlot[k] = bySlot[k] ?? []).push(b);
  });

  return (
    <div className="space-y-4">
      {Object.keys(bySlot).sort().map(key => {
        const list = bySlot[key];
        const covers = list.reduce((s, b) => s + b.party_size, 0);
        const confirmed = list.filter(b => b.booking_status === 'confirmed').length;

        return (
          <div key={key}>
            {/* Slot header */}
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-sm font-bold text-foreground whitespace-nowrap">
                {key === '__none__' ? 'No time' : fmt(key)}
              </span>
              <div className="h-px flex-1 bg-border" />
              <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap shrink-0">
                <span>{list.length} reservation{list.length !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span className="font-semibold text-foreground">{covers} covers</span>
                {confirmed > 0 && <>
                  <span>·</span>
                  <span className="text-emerald-600 dark:text-emerald-400">{confirmed} confirmed</span>
                </>}
              </div>
            </div>

            {/* Guest rows */}
            <div className="space-y-0.5 pl-1">
              {list.map(b => (
                <div key={b.id}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-muted/40 transition-colors group"
                >
                  <span className={`size-1.5 rounded-full shrink-0 ${STATUS_DOT[b.booking_status] ?? 'bg-muted-foreground'}`} />
                  <span className="text-sm font-medium text-foreground flex-1 truncate">
                    {b.customer_name}
                    {b.is_vip && <Star className="inline size-3 text-amber-500 fill-amber-500 ml-1.5 -translate-y-px" />}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">{b.party_size} covers</span>
                  <a href={`tel:+${b.customer_phone}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-foreground"
                    onClick={e => e.stopPropagation()}>
                    <Phone className="size-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, icon, children, action }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Live Capacity Bar ────────────────────────────────────────────────────────
function LiveCapacitySection({ slots }: { slots: RestaurantSlot[] }) {
  if (slots.length === 0) return null;

  return (
    <div className="space-y-2">
      {slots.map(slot => {
        const total     = slot.total_capacity;
        const remaining = slot.remaining_capacity ?? total;
        const booked    = total - remaining;
        const pct       = total > 0 ? Math.round((booked / total) * 100) : 0;
        const isFull    = remaining === 0;
        const isNearFull = pct >= 90 && !isFull;

        const barColor = isFull
          ? 'bg-destructive'
          : isNearFull
            ? 'bg-amber-500'
            : pct >= 60
              ? 'bg-amber-400'
              : 'bg-emerald-500';

        const textColor = isFull
          ? 'text-destructive'
          : isNearFull
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-muted-foreground';

        return (
          <div key={slot.id} className="flex items-center gap-3">
            <span className="text-sm font-semibold text-foreground w-20 shrink-0 tabular-nums">
              {fmt(slot.slot_time)}
            </span>

            {/* Progress bar */}
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>

            {/* Counts */}
            <div className={`flex items-center gap-1.5 shrink-0 text-xs tabular-nums ${textColor}`}>
              {isFull ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20">
                  FULL
                </span>
              ) : (
                <span className="font-semibold">{remaining} left</span>
              )}
              <span className="text-muted-foreground/50">/ {total}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function RestaurantOverviewClient() {
  const [data, setData]         = useState<OverviewData | null>(null);
  const [slots, setSlots]       = useState<RestaurantSlot[]>([]);
  const [loading, setLoading]   = useState(true);
  const [now, setNow]           = useState(getISTTimeStr());
  const [isLive, setIsLive]     = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const todayIST  = getISTDateStr();
  const todayLabel = new Date(todayIST + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const load = useCallback(async () => {
    try {
      const today = getISTDateStr();
      const [overviewRes, slotsRes] = await Promise.all([
        fetch('/api/restaurant/overview'),
        fetch(`/api/restaurant/slots?date=${today}`),
      ]);
      if (!overviewRes.ok) throw new Error('Failed to load');
      const json      = await overviewRes.json();
      const slotsJson = slotsRes.ok ? await slotsRes.json() : { data: [] };
      setData(json);
      setSlots(slotsJson.data ?? []);
      if (json.tenantId && !tenantId) setTenantId(json.tenantId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  // Clock + auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(() => { setNow(getISTTimeStr()); load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  // Realtime
  useEffect(() => {
    if (!tenantId) return;
    const sb = createBrowserSupabaseClient();
    const ch = sb
      .channel(`overview-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_bookings' }, (p) => {
        if ((p.new as any)?.restaurant_id === tenantId || (p.old as any)?.restaurant_id === tenantId) load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_waitlist' }, (p) => {
        if ((p.new as any)?.restaurant_id === tenantId || (p.old as any)?.restaurant_id === tenantId) load();
      })
      .subscribe(s => setIsLive(s === 'SUBSCRIBED'));
    return () => { sb.removeChannel(ch); };
  }, [tenantId, load]);

  const summary   = data?.todaySummary;
  const hasVIPs   = (data?.vipGuestsToday.length ?? 0) > 0;
  const hasWailist = (data?.waitlistToday.length ?? 0) > 0;

  // Current time display
  const nowDisplay = (() => {
    const [h, m] = now.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  })();

  return (
    <div className="space-y-8 pb-10">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Today&apos;s Service</h1>
            {isLive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold tracking-wider">
                <Wifi className="size-2.5" /> LIVE
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{todayLabel}</p>
        </div>
        <button onClick={() => load()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted shrink-0">
          <RefreshCw className="size-3.5" /> {nowDisplay}
        </button>
      </div>

      {/* ── Section 1: KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          [0,1,2,3].map(i => <Skeleton key={i} className="h-[90px] rounded-xl" />)
        ) : (
          <>
            {/* Confirmed — strongest emphasis */}
            <Card className="bg-primary text-primary-foreground shadow-none rounded-xl border-0">
              <CardContent className="p-5">
                <p className="text-4xl font-bold tracking-tight">{summary?.confirmed ?? 0}</p>
                <p className="text-xs font-bold tracking-widest uppercase mt-1 opacity-80">Confirmed</p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border shadow-none rounded-xl">
              <CardContent className="p-5">
                <p className="text-4xl font-bold tracking-tight text-foreground">{summary?.expectedCovers ?? 0}</p>
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mt-1">Expected Covers</p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border shadow-none rounded-xl">
              <CardContent className="p-5">
                <p className="text-4xl font-bold tracking-tight text-foreground">{summary?.totalReservations ?? 0}</p>
                <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mt-1">Reservations</p>
              </CardContent>
            </Card>

            <Link href="/dashboard/restaurant/waitlist">
              <Card className={`shadow-none rounded-xl border cursor-pointer hover:border-primary/40 transition-colors ${(summary?.waitlistCount ?? 0) > 0 ? 'bg-amber-500/5 border-amber-300/40' : 'bg-card border-border'}`}>
                <CardContent className="p-5">
                  <p className={`text-4xl font-bold tracking-tight ${(summary?.waitlistCount ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                    {summary?.waitlistCount ?? 0}
                  </p>
                  <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mt-1">Waitlist</p>
                </CardContent>
              </Card>
            </Link>
          </>
        )}
      </div>

      {/* ── Section 2: Live Capacity ── */}
      {!loading && slots.length > 0 && (
        <Section title="Live Capacity" icon={<Layers className="size-3.5" />}>
          <Card className="bg-card border-border shadow-none rounded-xl">
            <CardContent className="p-5">
              <LiveCapacitySection slots={slots} />
            </CardContent>
          </Card>
        </Section>
      )}
      {loading && (
        <Section title="Live Capacity" icon={<Layers className="size-3.5" />}>
          <Skeleton className="h-24 rounded-xl" />
        </Section>
      )}

      {/* ── Section 3: Arriving Next ── */}
      <Section
        title="Arriving Next"
        icon={<Clock className="size-3.5" />}
        action={<span className="text-xs text-muted-foreground font-mono">{nowDisplay}</span>}
      >
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0,1,2].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ) : (
          <ArrivingNowHero bookings={data?.confirmedBookings ?? []} now={now} />
        )}
      </Section>

      {/* ── Section 4: Today's Timeline ── */}
      <Section
        title="Today's Timeline"
        icon={<CalendarClock className="size-3.5" />}
        action={
          <Link href="/dashboard/restaurant/bookings"
            className="text-xs text-primary hover:underline flex items-center gap-1">
            Manage all <ArrowRight className="size-3" />
          </Link>
        }
      >
        <Card className="bg-card border-border shadow-none rounded-xl">
          <CardContent className="p-5">
            {loading ? (
              <div className="space-y-3">{[0,1,2].map(i => <Skeleton key={i} className="h-8 rounded" />)}</div>
            ) : (
              <TodayTimeline bookings={data?.allBookings ?? []} />
            )}
          </CardContent>
        </Card>
      </Section>

      {/* ── Section 4: VIP Guests (only if any) ── */}
      {!loading && hasVIPs && (
        <Section title="VIP Guests Today" icon={<Star className="size-3.5" />}>
          <div className="space-y-2">
            {data!.vipGuestsToday.map(b => (
              <Card key={b.id} className="bg-card border-amber-200/40 shadow-none rounded-xl">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-amber-500/10 border border-amber-300/30 flex items-center justify-center shrink-0">
                      <Star className="size-4 text-amber-500 fill-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{b.customer_name}</p>
                        {b.vip_tags.filter(t => t !== 'VIP').map(t => (
                          <span key={t} className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">{t}</span>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {fmt(b.slot_time)} · {b.party_size} covers
                        {b.special_request ? ` · "${b.special_request}"` : ''}
                      </p>
                      {b.visit_count > 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-500 font-medium mt-0.5">
                          {b.visit_count} visit{b.visit_count !== 1 ? 's' : ''}{b.last_visit ? ` · ${lastVisitLabel(b.last_visit)}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <a href={`tel:+${b.customer_phone}`}>
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                          <Phone className="size-3.5" />
                        </Button>
                      </a>
                      <a href={`https://wa.me/${b.customer_phone}`} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                          <MessageCircle className="size-3.5" />
                        </Button>
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      )}

      {/* Waitlist inline notice (compact, no giant card) */}
      {!loading && hasWailist && (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-amber-300/40 bg-amber-500/5">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-foreground">
              {data!.waitlistToday.length} guest{data!.waitlistToday.length !== 1 ? 's' : ''} on the waitlist today
            </span>
          </div>
          <Link href="/dashboard/restaurant/waitlist">
            <Button size="sm" variant="outline" className="h-8 text-xs border-amber-300/40">
              Manage waitlist <ArrowRight className="size-3 ml-1" />
            </Button>
          </Link>
        </div>
      )}

    </div>
  );
}
