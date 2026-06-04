'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { RestaurantStats, RestaurantBooking } from '@/lib/types';
import toast from 'react-hot-toast';
import { CheckCircle2, Circle } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────
function formatSlotTime(timeStr: string): string {
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return timeStr;
  }
}

function formatCurrency(rupees: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rupees);
}

// ── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  loading,
}: {
  label: string;
  value: string | number;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <Card className="bg-card border-border shadow-none rounded-xl">
      <CardContent className="p-5">
        {loading ? (
          <>
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-16" />
          </>
        ) : (
          <>
            <p className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase mb-1">{label}</p>
            <p className="text-3xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
    confirmed: 'success',
    completed: 'secondary',
    no_show: 'warning',
    cancelled: 'destructive',
  };
  return <Badge variant={map[status] ?? 'secondary'}>{status.replace('_', ' ')}</Badge>;
}

// ── Main Component ────────────────────────────────────────────────────────
export function RestaurantOverviewClient() {
  const [stats, setStats] = useState<RestaurantStats | null>(null);
  const [slotData, setSlotData] = useState<{ name: string; filled: number; available: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feeInput, setFeeInput] = useState('0');
  const [feeSaving, setFeeSaving] = useState(false);
  const [canEditFee, setCanEditFee] = useState(false);
  const [holdInput, setHoldInput] = useState('20');

  const todayIST = new Date(Date.now() + 5.5 * 3600 * 1000)
    .toISOString()
    .split('T')[0];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, slotsRes, bookingsRes] = await Promise.all([
        fetch('/api/restaurant/stats'),
        fetch(`/api/restaurant/slots?date=${todayIST}`),
        fetch(`/api/restaurant/bookings?date=${todayIST}&status=confirmed`),
      ]);

      if (!statsRes.ok) throw new Error('Failed to load stats');

      const { data: statsData } = await statsRes.json();
      setStats(statsData);

      // Build chart data from slots + today's bookings
      const { data: slots } = await slotsRes.json();
      const { data: bookings } = await bookingsRes.json();

      const confirmedBySlot: Record<string, number> = {};
      (bookings ?? []).forEach((b: RestaurantBooking) => {
        confirmedBySlot[b.slot_id] = (confirmedBySlot[b.slot_id] ?? 0) + b.party_size;
      });

      const chart = (slots ?? []).map((s: { id: string; slot_time: string; total_capacity: number }) => {
        const filled = confirmedBySlot[s.id] ?? 0;
        return {
          name: formatSlotTime(s.slot_time),
          filled,
          available: Math.max(s.total_capacity - filled, 0),
        };
      });
      setSlotData(chart);

      // Booking commitment fee setting
      const settingsRes = await fetch('/api/restaurant/settings');
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setFeeInput(String(s.booking_fee_per_person ?? 0));
        setHoldInput(String(s.booking_hold_minutes ?? 20));
        setCanEditFee(!!s.can_edit);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [todayIST]);

  useEffect(() => { load(); }, [load]);

  const saveFee = async () => {
    setFeeSaving(true);
    try {
      const res = await fetch('/api/restaurant/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_fee_per_person: Number(feeInput) || 0, booking_hold_minutes: Number(holdInput) || 20 }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.booking_fee_per_person !== undefined) setFeeInput(String(data.booking_fee_per_person));
        if (data.booking_hold_minutes !== undefined) setHoldInput(String(data.booking_hold_minutes));
        toast.success('Settings saved');
      } else {
        toast.error(data.error || 'Failed to update');
      }
    } catch {
      toast.error('Failed to update');
    } finally {
      setFeeSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Restaurant Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Today is {new Date(todayIST + 'T00:00:00').toLocaleDateString('en-IN', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3">
          {error}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Bookings Today"
          value={stats?.bookings_today ?? 0}
          loading={loading}
        />
        <StatCard
          label="This Week"
          value={stats?.bookings_this_week ?? 0}
          loading={loading}
        />
        <StatCard
          label="Deposits This Month"
          value={stats ? formatCurrency(stats.total_deposit_collected_this_month) : '—'}
          loading={loading}
        />
        <StatCard
          label="No-show Rate"
          value={stats ? `${stats.no_show_rate}%` : '—'}
          sub="Last 30 days"
          loading={loading}
        />
      </div>

      {/* Getting Started — only shown until the first real booking comes in */}
      {!loading && (stats?.bookings_today === 0 && stats?.bookings_this_week === 0) && (
        <Card className="bg-card border-border shadow-none rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              🚀 Getting Started — Clock Tower Setup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Complete these steps to start receiving bookings on WhatsApp.</p>
            <div className="space-y-3">
              {[
                { step: '1', done: true,  label: 'Restaurant dashboard activated', desc: 'You\'re here — the panel is live.' },
                { step: '2', done: false, label: 'Add time slots', desc: 'Go to Slot Management and create your opening slots (e.g. 7 PM, 8 PM, 9 PM).' },
                { step: '3', done: false, label: 'Connect WhatsApp', desc: 'Go to Settings and paste your WhatsApp Cloud API token so the bot can receive messages.' },
                { step: '4', done: false, label: 'Connect Google Sheets (optional)', desc: 'Go to Integrations → Google Sheets. Every booking will auto-appear in your sheet.' },
                { step: '5', done: false, label: 'Set booking fee (optional)', desc: 'Scroll down to set ₹ per guest to collect a commitment fee via WhatsApp payment link.' },
                { step: '6', done: false, label: 'Test a booking', desc: 'Message your own WhatsApp number "I want to book a table" and see it appear in Bookings.' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  {item.done
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    : <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0 mt-0.5" />}
                  <div>
                    <p className={`text-sm font-medium ${item.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Booking & payment settings */}
      <Card className="bg-card border-border shadow-none rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">Booking &amp; Payment Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Charge guests a fee per person to confirm a booking — they get a WhatsApp payment link automatically. Set to 0 to turn off.
            </p>
            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                <input
                  type="number"
                  min={0}
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  disabled={!canEditFee}
                  className="w-32 h-10 pl-7 pr-3 bg-background border border-border rounded-lg text-sm focus:border-indigo-500 outline-none disabled:opacity-60"
                />
              </div>
              <span className="text-sm text-muted-foreground">per guest</span>
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Hold an unpaid booking&apos;s seats for this long, then release them automatically so others can book.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={5}
                max={240}
                value={holdInput}
                onChange={(e) => setHoldInput(e.target.value)}
                disabled={!canEditFee}
                className="w-24 h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-indigo-500 outline-none disabled:opacity-60"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
          </div>

          {canEditFee ? (
            <button
              onClick={saveFee}
              disabled={feeSaving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {feeSaving ? 'Saving...' : 'Save settings'}
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">Only owners, admins and managers can change this.</p>
          )}
        </CardContent>
      </Card>

      {/* Two-column section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Today's Slot Utilisation Chart */}
        <Card className="bg-card border-border shadow-none rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Today's Slot Utilisation</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : slotData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No active slots configured.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={slotData} barSize={24}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="filled" name="Booked" stackId="a" radius={[0, 0, 4, 4]}>
                    {slotData.map((_, i) => (
                      <Cell key={i} fill="hsl(var(--primary))" fillOpacity={0.9} />
                    ))}
                  </Bar>
                  <Bar dataKey="available" name="Available" stackId="a" radius={[4, 4, 0, 0]}>
                    {slotData.map((_, i) => (
                      <Cell key={i} fill="hsl(var(--muted))" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Bookings Today */}
        <Card className="bg-card border-border shadow-none rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Upcoming Today</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : (stats?.upcoming_bookings_today ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No upcoming bookings for today.</p>
            ) : (
              <div className="space-y-3">
                {(stats?.upcoming_bookings_today ?? []).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{b.customer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.slot_time ? formatSlotTime(b.slot_time) : '—'} · {b.party_size} guests
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono text-muted-foreground">{b.reservation_id}</p>
                      <StatusBadge status={b.booking_status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
