'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RestaurantBooking, RestaurantSlot } from '@/lib/types';
import { toast } from 'sonner';
import { Plus, X, Phone, Users, Calendar, Clock } from 'lucide-react';

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
  const [slots, setSlots] = useState<RestaurantSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Add booking modal
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addParty, setAddParty] = useState('2');
  const [addDate, setAddDate] = useState(todayIST);
  const [addSlot, setAddSlot] = useState('');
  const [addNote, setAddNote] = useState('');
  const [adding, setAdding] = useState(false);

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

  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch('/api/restaurant/slots');
      if (!res.ok) return;
      const { data } = await res.json();
      setSlots(data ?? []);
      if (data?.length) setAddSlot(data[0].id);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);
  useEffect(() => { fetchSlots(); }, [fetchSlots]);

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

  const createBooking = async () => {
    if (!addName.trim() || !addPhone.trim() || !addSlot || !addDate) {
      toast.error('Please fill in all required fields');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/restaurant/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: addName.trim(),
          customer_phone: addPhone.trim(),
          party_size: parseInt(addParty) || 2,
          booking_date: addDate,
          slot_id: addSlot,
          special_request: addNote,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create booking');
      toast.success(`Booking created — ${data.data?.reservation_id}`);
      setShowAdd(false);
      setAddName(''); setAddPhone(''); setAddParty('2'); setAddNote('');
      setAddDate(todayIST);
      if (addDate === selectedDate) await fetchBookings();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bookings</h1>
          <p className="text-sm text-muted-foreground mt-1">View and manage reservations by date.</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="size-4 mr-1.5" /> Add Booking
        </Button>
      </div>

      {/* Controls row */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="flex flex-wrap gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
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
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No bookings for {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}.
              </p>
              <Button size="sm" variant="outline" onClick={() => { setAddDate(selectedDate); setShowAdd(true); }}>
                <Plus className="size-4 mr-1.5" /> Add a booking
              </Button>
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
                          {formatSlotTime(booking.slot_time)} · {booking.party_size} guest{booking.party_size !== 1 ? 's' : ''}
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
                        {booking.payment_amount > 0 ? `₹${Math.round(booking.payment_amount / 100)}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Booked At</p>
                      <p className="font-medium text-foreground">
                        {new Date(booking.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  {booking.booking_status === 'confirmed' && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline" size="sm"
                        disabled={updatingId === booking.id}
                        onClick={(e) => { e.stopPropagation(); updateStatus(booking.id, 'no_show'); }}
                      >
                        Mark No-show
                      </Button>
                      <Button
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

      {/* ── Add Booking Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-base font-semibold">Add Booking</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 text-muted-foreground hover:bg-secondary rounded-md">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  Customer name <span className="text-destructive">*</span>
                </label>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Rohan Sharma"
                  className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none"
                />
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> Phone <span className="text-destructive">*</span>
                </label>
                <input
                  type="tel"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="91XXXXXXXXXX"
                  className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none"
                />
              </div>

              {/* Date + Party size */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Date <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="date"
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    min={todayIST}
                    className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Guests <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={addParty}
                    onChange={(e) => setAddParty(e.target.value)}
                    className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none"
                  />
                </div>
              </div>

              {/* Slot */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Time slot <span className="text-destructive">*</span>
                </label>
                {slots.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-200 rounded-lg px-3 py-2">
                    No slots configured yet. Go to Slot Management to add time slots first.
                  </p>
                ) : (
                  <select
                    value={addSlot}
                    onChange={(e) => setAddSlot(e.target.value)}
                    className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none"
                  >
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>{formatSlotTime(s.slot_time)}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Special request */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Special request (optional)</label>
                <input
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  placeholder="e.g. Window table, Birthday cake"
                  className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button
                  size="sm"
                  disabled={adding || !addName.trim() || !addPhone.trim() || !addSlot}
                  onClick={createBooking}
                >
                  {adding ? 'Saving…' : 'Confirm Booking'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
