'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { WaitlistEntry, RestaurantSlot } from '@/lib/types';
import { toast } from 'sonner';
import {
  Plus, X, Phone, Users, Clock, MessageCircle,
  CalendarClock, ArrowRight, BellRing, Trash2, Star,
} from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';
import { formatPhoneDisplay } from '@/lib/utils/phone';

function formatSlotTime(timeStr?: string | null): string {
  if (!timeStr) return 'Any time';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return timeStr; }
}

const STATUS_STYLES: Record<string, string> = {
  waiting:   'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  notified:  'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  converted: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  removed:   'bg-muted text-muted-foreground',
};

export function WaitlistClient() {
  const todayIST = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(todayIST);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [slots, setSlots] = useState<RestaurantSlot[]>([]);
  const [vipPhones, setVipPhones] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Add to waitlist form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addParty, setAddParty] = useState('2');
  const [addDate, setAddDate] = useState(todayIST);
  const [addSlot, setAddSlot] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchWaitlist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/restaurant/waitlist?date=${selectedDate}`);
      if (!res.ok) throw new Error('Failed to load waitlist');
      const { data } = await res.json();
      setWaitlist(data ?? []);

      // Fetch VIP status for waitlist guests
      const phones = (data ?? []).map((e: WaitlistEntry) => e.customer_phone);
      if (phones.length > 0) {
        fetch('/api/restaurant/guests/list')
          .then(r => r.json())
          .then(json => {
            const vips = new Set<string>(
              (json.guests ?? [])
                .filter((g: { vip_status: boolean; is_auto_vip: boolean; tags: string[]; customer_phone: string }) => g.vip_status || g.is_auto_vip || g.tags.includes('VIP'))
                .map((g: { customer_phone: string }) => g.customer_phone)
            );
            setVipPhones(vips);
          })
          .catch(() => {});
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch('/api/restaurant/slots');
      if (!res.ok) return;
      const { data } = await res.json();
      setSlots(data ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchWaitlist(); }, [fetchWaitlist]);
  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/restaurant/waitlist/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success(status === 'notified' ? 'Marked as notified' : status === 'removed' ? 'Removed from waitlist' : 'Status updated');
      await fetchWaitlist();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpdatingId(null);
    }
  };

  const convertToBooking = async (entry: WaitlistEntry) => {
    // Pre-fill the bookings page with this waitlist entry details
    // Open bookings page in new tab with query params
    const params = new URLSearchParams({
      name: entry.customer_name,
      phone: entry.customer_phone,
      party: String(entry.party_size),
      date: entry.booking_date,
      ...(entry.requested_slot_id ? { slot: entry.requested_slot_id } : {}),
    });
    window.open(`/dashboard/restaurant/bookings?prefill=${encodeURIComponent(params.toString())}`, '_blank');
    // Mark as converted
    await updateStatus(entry.id, 'converted');
  };

  const addToWaitlist = async () => {
    if (!addName.trim() || !addPhone.trim() || !addDate) {
      toast.error('Please fill required fields');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/restaurant/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: addName.trim(),
          customer_phone: addPhone.trim(),
          party_size: parseInt(addParty) || 1,
          booking_date: addDate,
          requested_slot_id: addSlot || null,
          notes: addNotes,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to add to waitlist');
      toast.success(`${addName} added to waitlist at position #${data.data?.position}`);
      setShowAdd(false);
      setAddName(''); setAddPhone(''); setAddParty('2'); setAddNotes('');
      setAddDate(todayIST); setAddSlot('');
      if (addDate === selectedDate) await fetchWaitlist();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const totalCovers = waitlist.reduce((s, e) => s + e.party_size, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold text-foreground">Waitlist</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {waitlist.length} guest{waitlist.length !== 1 ? 's' : ''} waiting · {totalCovers} covers
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="size-4 mr-1.5" /> Add to Waitlist
        </Button>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={() => setSelectedDate(todayIST)}
          className="px-3 py-2 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors border border-border"
        >
          Today
        </button>
      </div>

      {/* Waitlist queue */}
      <div className="space-y-2">
        {loading ? (
          [0,1,2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : waitlist.length === 0 ? (
          <Card className="bg-card border-border shadow-none rounded-xl">
            <CardContent className="py-12 text-center">
              <CalendarClock className="size-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No guests on the waitlist for this date.</p>
              <Button size="sm" variant="outline" onClick={() => { setAddDate(selectedDate); setShowAdd(true); }}>
                <Plus className="size-4 mr-1.5" /> Add First Guest
              </Button>
            </CardContent>
          </Card>
        ) : (
          waitlist.map((entry) => (
            <Card key={entry.id} className="bg-card border-border shadow-none rounded-xl">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Position badge */}
                  <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${
                    vipPhones.has(entry.customer_phone)
                      ? 'bg-amber-500/10 border border-amber-300/30'
                      : 'bg-primary/10 border border-primary/20'
                  }`}>
                    {vipPhones.has(entry.customer_phone)
                      ? <Star className="size-4 text-amber-500 fill-amber-500" />
                      : <span className="text-sm font-bold text-primary">#{entry.position}</span>
                    }
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{entry.customer_name}</p>
                      {vipPhones.has(entry.customer_phone) && (
                        <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300/40">
                          ⭐ VIP
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLES[entry.status]}`}>
                        {entry.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users className="size-3" /> {entry.party_size} covers
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" /> {formatSlotTime(entry.slot_time)}
                      </span>
                      {entry.notes && (
                        <span className="italic truncate max-w-xs">"{entry.notes}"</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1 flex-wrap">
                      <a href={`tel:+${entry.customer_phone.replace(/\D/g,'')}`}>
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          <Phone className="size-3 mr-1" /> {formatPhoneDisplay(entry.customer_phone)}
                        </Button>
                      </a>
                      <a href={`https://wa.me/${entry.customer_phone}`} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="h-7 text-xs">
                          <MessageCircle className="size-3 mr-1" /> WhatsApp
                        </Button>
                      </a>
                      {entry.status === 'waiting' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          disabled={updatingId === entry.id}
                          onClick={() => updateStatus(entry.id, 'notified')}>
                          <BellRing className="size-3 mr-1" /> Notify
                        </Button>
                      )}
                      <Button size="sm" className="h-7 text-xs"
                        disabled={updatingId === entry.id}
                        onClick={() => convertToBooking(entry)}>
                        <ArrowRight className="size-3 mr-1" /> Convert to Booking
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 text-xs"
                        disabled={updatingId === entry.id}
                        onClick={() => updateStatus(entry.id, 'removed')}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* ── Add to Waitlist Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-base font-semibold">Add to Waitlist</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 text-muted-foreground hover:bg-secondary rounded-md">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Guest Name <span className="text-destructive">*</span></label>
                <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. Priya Mehta"
                  className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone <span className="text-destructive">*</span></label>
                <PhoneInput value={addPhone} onChange={setAddPhone} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Covers</label>
                  <input type="number" min={1} max={50} value={addParty} onChange={e => setAddParty(e.target.value)}
                    className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Date <span className="text-destructive">*</span></label>
                  <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)} min={todayIST}
                    className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Preferred Slot (optional)</label>
                <select value={addSlot} onChange={e => setAddSlot(e.target.value)}
                  className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none">
                  <option value="">Any available slot</option>
                  {slots.map(s => <option key={s.id} value={s.id}>{formatSlotTime(s.slot_time)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Notes (optional)</label>
                <input value={addNotes} onChange={e => setAddNotes(e.target.value)} placeholder="e.g. Flexible on time, anniversary dinner"
                  className="w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button size="sm" disabled={adding || !addName.trim() || !addPhone.trim()} onClick={addToWaitlist}>
                  {adding ? 'Adding…' : 'Add to Waitlist'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
