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
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [todayIST]);

  useEffect(() => { load(); }, [load]);

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
