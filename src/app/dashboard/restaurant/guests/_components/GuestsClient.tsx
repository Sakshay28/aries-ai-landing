'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Phone, MessageCircle,
  Users, CalendarDays, TrendingUp, TrendingDown, Calendar,
} from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/utils/phone';
import type { RestaurantBooking } from '@/lib/types';
import { GuestProfilePanel } from '../../bookings/_components/GuestProfilePanel';

// ─── Types ────────────────────────────────────────────────────────────────────
interface KPI { count: number; trend: number | null; }
interface CalendarData {
  days: Record<string, number>;
  kpis: { total: KPI; today: KPI; week: KPI; month: KPI };
}
interface DayGuest {
  customer_phone: string;
  customer_name: string;
  slot_time?: string | null;
  booking_status: string;
  party_size: number;
}
interface GuestProfile {
  phone: string; name: string | null;
  totalBookings: number; totalVisits: number;
  lastVisit: string | null; avgPartySize: number;
  tags: string[]; notes: string | null; vip_status: boolean;
  bookings: (RestaurantBooking & { slot_time?: string | null })[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getISTDate() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
}
function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function fmtSlot(t?: string | null) {
  if (!t) return '';
  try {
    const [h, m] = t.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return t; }
}
function buildGrid(year: number, month: number) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  const cells: { date: string; day: number; current: boolean }[] = [];
  const prevDays = new Date(year, month - 1, 0).getDate();
  for (let i = offset - 1; i >= 0; i--) {
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    cells.push({ date: toDateStr(py, pm, prevDays - i), day: prevDays - i, current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: toDateStr(year, month, d), day: d, current: true });
  }
  let nd = 1;
  while (cells.length % 7 !== 0 || cells.length < 35) {
    const nm = month === 12 ? 1 : month + 1;
    const ny = month === 12 ? year + 1 : year;
    cells.push({ date: toDateStr(ny, nm, nd++), day: nd - 1, current: false });
  }
  return cells;
}
function intensityCls(n: number) {
  if (n === 0)  return '';
  if (n <= 2)   return 'bg-primary/10';
  if (n <= 5)   return 'bg-primary/20';
  if (n <= 10)  return 'bg-primary/32';
  if (n <= 20)  return 'bg-primary/48';
  if (n <= 35)  return 'bg-primary/62';
  return 'bg-primary/80';
}
function countTxt(n: number) {
  if (n === 0) return 'text-muted-foreground/20';
  if (n <= 5)  return 'text-primary/60';
  return 'text-primary/90';
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, kpi, icon: Icon, loading }: {
  label: string; kpi?: KPI; icon: React.ElementType; loading: boolean;
}) {
  if (loading) return <Skeleton className="h-[106px] rounded-2xl" />;
  const t = kpi?.trend ?? null;
  return (
    <Card className="bg-card border-border shadow-none rounded-2xl group hover:border-primary/30 hover:shadow-sm transition-all duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
            <Icon className="size-4 text-primary" />
          </div>
          {t !== null && (
            <span className={`flex items-center gap-0.5 text-xs font-semibold ${t >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
              {t >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {Math.abs(t)}%
            </span>
          )}
        </div>
        <p className="text-3xl font-bold text-foreground tracking-tight">{kpi?.count ?? 0}</p>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export function GuestsClient() {
  const todayStr = getISTDate();
  const [calData, setCalData]     = useState<CalendarData | null>(null);
  const [calLoading, setCalLoading] = useState(true);
  const [navYear, setNavYear]     = useState(() => parseInt(todayStr.slice(0,4)));
  const [navMonth, setNavMonth]   = useState(() => parseInt(todayStr.slice(5,7)));

  // Selected date + inline guest list
  const [selectedDate, setSelectedDate]   = useState<string | null>(null);
  const [dayGuests, setDayGuests]         = useState<DayGuest[]>([]);
  const [dayLoading, setDayLoading]       = useState(false);
  const guestListRef = useRef<HTMLDivElement>(null);

  // Profile panel
  const [profile, setProfile]           = useState<GuestProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // ── Fetch calendar ──────────────────────────────────────────────────────
  const fetchCal = useCallback(async (y: number, m: number) => {
    setCalLoading(true);
    try {
      const res = await fetch(`/api/restaurant/guests/calendar?year=${y}&month=${m}`);
      if (!res.ok) throw new Error('Failed');
      setCalData(await res.json());
    } catch { toast.error('Failed to load calendar'); }
    finally { setCalLoading(false); }
  }, []);

  useEffect(() => { fetchCal(navYear, navMonth); }, [fetchCal, navYear, navMonth]);

  // ── Navigate months ─────────────────────────────────────────────────────
  const prev = () => navMonth === 1 ? (setNavYear(y=>y-1), setNavMonth(12)) : setNavMonth(m=>m-1);
  const next = () => navMonth === 12 ? (setNavYear(y=>y+1), setNavMonth(1))  : setNavMonth(m=>m+1);
  const goToday = () => { setNavYear(parseInt(todayStr.slice(0,4))); setNavMonth(parseInt(todayStr.slice(5,7))); };

  // ── Click a date → load guests inline ───────────────────────────────────
  const selectDate = async (date: string) => {
    // Toggle off if same date clicked again
    if (selectedDate === date) { setSelectedDate(null); setDayGuests([]); return; }
    setSelectedDate(date);
    setDayGuests([]);
    setDayLoading(true);
    try {
      const res = await fetch(`/api/restaurant/bookings?date=${date}`);
      const { data } = await res.json();
      const map = new Map<string, DayGuest>();
      for (const b of (data ?? [])) {
        if (b.booking_status === 'cancelled') continue;
        if (!map.has(b.customer_phone)) map.set(b.customer_phone, {
          customer_phone: b.customer_phone,
          customer_name: b.customer_name,
          slot_time: b.slot_time,
          booking_status: b.booking_status,
          party_size: b.party_size,
        });
      }
      setDayGuests([...map.values()].sort((a,b) => (a.slot_time??'').localeCompare(b.slot_time??'')));
    } catch { toast.error('Failed to load'); }
    finally {
      setDayLoading(false);
      // Scroll to guest list
      setTimeout(() => guestListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  };

  const openProfile = async (g: DayGuest) => {
    setProfileLoading(true); setProfile(null);
    try {
      const res = await fetch(`/api/restaurant/guests?phone=${g.customer_phone}&name=${encodeURIComponent(g.customer_name)}`);
      const d = await res.json();
      if (d.success) setProfile(d.data);
    } catch { toast.error('Could not load profile'); }
    finally { setProfileLoading(false); }
  };

  const cells = useMemo(() => buildGrid(navYear, navMonth), [navYear, navMonth]);
  const days  = calData?.days ?? {};

  const selectedLabel = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const statusDot: Record<string, string> = {
    confirmed: 'bg-emerald-500', completed: 'bg-primary', no_show: 'bg-amber-500',
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Guests</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Guest attendance by day — click any date to see who visited</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Total Guests"  kpi={calData?.kpis.total} icon={Users}        loading={calLoading} />
        <KPICard label="Guests Today"  kpi={calData?.kpis.today} icon={CalendarDays} loading={calLoading} />
        <KPICard label="This Week"     kpi={calData?.kpis.week}  icon={TrendingUp}   loading={calLoading} />
        <KPICard label="This Month"    kpi={calData?.kpis.month} icon={Calendar}     loading={calLoading} />
      </div>

      {/* Calendar */}
      <Card className="bg-card border-border shadow-none rounded-2xl overflow-hidden">
        {/* Nav header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <button onClick={prev} className="size-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-base font-bold text-foreground w-40 text-center">
              {MONTHS[navMonth-1]} {navYear}
            </span>
            <button onClick={next} className="size-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors">
              <ChevronRight className="size-4" />
            </button>
          </div>
          <Button size="sm" variant="outline" onClick={goToday} className="text-xs">Today</Button>
        </div>

        {/* DOW headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {DOW.map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Grid */}
        {calLoading ? (
          <div className="grid grid-cols-7">
            {Array.from({length:35}).map((_,i) => (
              <div key={i} className="border-r border-b border-border/40 h-[80px] p-2">
                <Skeleton className="h-4 w-6 mb-2" /><Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((cell, idx) => {
              const count  = days[cell.date] ?? 0;
              const isToday = cell.date === todayStr;
              const isSel   = cell.date === selectedDate;
              const isLast  = idx >= cells.length - 7;

              return (
                <button
                  key={cell.date}
                  onClick={() => cell.current && selectDate(cell.date)}
                  disabled={!cell.current}
                  className={`
                    relative border-r border-b border-border/40 p-2 text-left min-h-[80px]
                    transition-all duration-150
                    ${isLast ? 'border-b-0' : ''}
                    ${!cell.current ? 'cursor-default bg-muted/10 opacity-30' : `cursor-pointer ${intensityCls(count)}`}
                    ${isSel ? 'ring-2 ring-inset ring-primary z-10' : ''}
                    ${cell.current && !isSel ? 'hover:brightness-95 dark:hover:brightness-110' : ''}
                  `}
                >
                  {/* Date number */}
                  <span className={`
                    inline-flex items-center justify-center size-6 rounded-full text-xs font-bold mb-0.5
                    ${isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'}
                  `}>
                    {cell.day}
                  </span>

                  {/* Count */}
                  {cell.current && count > 0 && (
                    <p className={`text-[11px] font-semibold leading-tight ${countTxt(count)}`}>
                      {count} {count === 1 ? 'guest' : 'guests'}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Intensity legend */}
      <div className="flex items-center gap-2 justify-end">
        <span className="text-xs text-muted-foreground">Less</span>
        {[0,2,5,12,25,40].map((n,i) => (
          <div key={i} className={`size-3.5 rounded-sm border border-border/30 ${intensityCls(n)}`} />
        ))}
        <span className="text-xs text-muted-foreground">More</span>
      </div>

      {/* ── Inline selected-date guests ── */}
      {selectedDate && (
        <div ref={guestListRef} className="space-y-3">
          {/* Section header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-foreground">{selectedLabel}</h2>
              {!dayLoading && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {dayGuests.length === 0
                    ? 'No guests visited'
                    : `${dayGuests.length} guest${dayGuests.length !== 1 ? 's' : ''} visited`}
                </p>
              )}
            </div>
            <button
              onClick={() => { setSelectedDate(null); setDayGuests([]); }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear
            </button>
          </div>

          {/* Guest cards */}
          {dayLoading ? (
            <div className="space-y-2">
              {[0,1,2].map(i => <Skeleton key={i} className="h-[66px] rounded-xl" />)}
            </div>
          ) : dayGuests.length === 0 ? (
            <Card className="bg-card border-border shadow-none rounded-xl">
              <CardContent className="py-8 text-center">
                <Users className="size-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No guest visits recorded for this date.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {dayGuests.map(g => (
                <div
                  key={g.customer_phone}
                  onClick={() => openProfile(g)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card
                    hover:border-primary/30 cursor-pointer transition-colors"
                >
                  {/* Avatar + status dot */}
                  <div className="relative shrink-0">
                    <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">{g.customer_name.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card ${statusDot[g.booking_status] ?? 'bg-muted-foreground'}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{g.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhoneDisplay(g.customer_phone)}
                      {g.slot_time && <> · {fmtSlot(g.slot_time)}</>}
                      {g.party_size > 0 && <> · {g.party_size} cover{g.party_size !== 1 ? 's' : ''}</>}
                    </p>
                  </div>

                  <div className="flex gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                    <a href={`tel:+${g.customer_phone.replace(/\D/g,'')}`}>
                      <button className="size-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors">
                        <Phone className="size-3.5 text-muted-foreground" />
                      </button>
                    </a>
                    <a href={`https://wa.me/${g.customer_phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer">
                      <button className="size-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors">
                        <MessageCircle className="size-3.5 text-muted-foreground" />
                      </button>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Guest profile panel */}
      {(profile || profileLoading) && (
        <GuestProfilePanel
          profile={profile}
          loading={profileLoading}
          onClose={() => setProfile(null)}
          onProfileUpdate={() => {}}
        />
      )}
    </div>
  );
}
