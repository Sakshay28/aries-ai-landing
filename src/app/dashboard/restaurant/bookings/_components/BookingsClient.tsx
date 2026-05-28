'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RestaurantBooking } from '@/lib/types';
import { toast } from 'sonner';

type FilterStatus = 'all' | 'confirmed' | 'no_show' | 'completed' | 'cancelled';

function formatSlotTime(timeStr?: string | null): string {
  if (!timeStr) return '—';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return timeStr;
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
    confirmed: 'success',
    completed: 'secondary',
    no_show: 'warning',
    cancelled: 'destructive',
  };
  return <Badge variant={map[status] ?? 'secondary'}>{status.replace('_', ' ')}</Badge>;
}

const FILTER_TABS: { label: string; value: FilterStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'No-show', value: 'no_show' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

export function BookingsClient() {
  const todayIST = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(todayIST);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [bookings, setBookings] = useState<RestaurantBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const res = await fetch(`/api/restaurant/bookings?${params}`);
      if (!res.ok) throw new Error('Failed to load bookings');
      const { data } = await res.json();
      setBookings(data ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, filterStatus]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const updateStatus = async (bookingId: string, newStatus: string) => {
    setUpdatingId(bookingId);
    try {
      const res = await fetch(`/api/restaurant/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      toast.success(`Booking marked as ${newStatus.replace('_', ' ')}`);
      await fetchBookings();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Bookings</h1>
        <p className="text-sm text-muted-foreground mt-1">View and manage reservations by date.</p>
      </div>

      {/* Controls row */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          id="booking-date-picker"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              id={`filter-tab-${tab.value}`}
              onClick={() => setFilterStatus(tab.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterStatus === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings list */}
      <div className="space-y-2">
        {loading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)
        ) : bookings.length === 0 ? (
          <Card className="bg-card border-border shadow-none rounded-xl">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No bookings found for this date{filterStatus !== 'all' ? ` with status "${filterStatus.replace('_', ' ')}"` : ''}.
            </CardContent>
          </Card>
        ) : (
          bookings.map((booking) => (
            <div key={booking.id}>
              <Card
                className="bg-card border-border shadow-none rounded-xl cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => setExpandedId(expandedId === booking.id ? null : booking.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary">
                          {booking.customer_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{booking.customer_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatSlotTime(booking.slot_time)} · {booking.party_size} guests
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono text-muted-foreground hidden sm:block">{booking.reservation_id}</span>
                      <StatusBadge status={booking.booking_status} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Expanded row */}
              {expandedId === booking.id && (
                <div className="border border-t-0 border-border rounded-b-xl bg-muted/30 px-4 py-3 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Phone</p>
                      <p className="font-medium text-foreground">{booking.customer_phone}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Reservation ID</p>
                      <p className="font-mono font-medium text-foreground">{booking.reservation_id}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Payment</p>
                      <p className="font-medium text-foreground capitalize">{booking.payment_status}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Party Size</p>
                      <p className="font-medium text-foreground">{booking.party_size} guests</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Deposit</p>
                      <p className="font-medium text-foreground">
                        {booking.payment_amount > 0
                          ? `₹${Math.round(booking.payment_amount / 100)}`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Booked At</p>
                      <p className="font-medium text-foreground">
                        {new Date(booking.created_at).toLocaleString('en-IN', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons — only show for confirmed bookings */}
                  {booking.booking_status === 'confirmed' && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        id={`mark-no-show-${booking.id}`}
                        variant="outline"
                        size="sm"
                        disabled={updatingId === booking.id}
                        onClick={(e) => { e.stopPropagation(); updateStatus(booking.id, 'no_show'); }}
                      >
                        Mark No-show
                      </Button>
                      <Button
                        id={`mark-completed-${booking.id}`}
                        size="sm"
                        disabled={updatingId === booking.id}
                        onClick={(e) => { e.stopPropagation(); updateStatus(booking.id, 'completed'); }}
                      >
                        Mark Completed
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
