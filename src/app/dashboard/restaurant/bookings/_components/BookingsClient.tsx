'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RestaurantBooking, RestaurantSlot } from '@/lib/types';
import { toast } from 'sonner';
import {
  Plus, X, Phone, Users, Calendar, Clock, Download, Pencil,
  Upload, FileSpreadsheet, AlertTriangle, Wifi, Search,
  MessageCircle, History, StickyNote, List, AlignLeft, Star,
} from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { ArrivingNextWidget } from './ArrivingNextWidget';
import { GuestProfilePanel } from './GuestProfilePanel';
import { PhoneInput } from '@/components/ui/phone-input';
import { formatPhoneDisplay } from '@/lib/utils/phone';

// ─── Types ───────────────────────────────────────────────────────────────────
type FilterStatus = 'all' | 'confirmed' | 'no_show' | 'completed' | 'cancelled';

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  whatsapp:    { label: 'WhatsApp',  color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  website:     { label: 'Website',   color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  phone:       { label: 'Phone',     color: 'bg-violet-500/10 text-violet-700 dark:text-violet-400' },
  walk_in:     { label: 'Walk-in',   color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400' },
  instagram:   { label: 'Instagram', color: 'bg-pink-500/10 text-pink-700 dark:text-pink-400' },
  staff_manual:{ label: 'Staff',     color: 'bg-muted text-muted-foreground' },
  google:      { label: 'Google',    color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
};

interface ImportRow {
  customer_name: string;
  customer_phone: string;
  party_size: number;
  booking_date: string;
  slot_id: string;
  slot_label: string;
  special_request?: string;
  _error?: string;
}

interface GuestProfile {
  phone: string;
  name: string | null;
  totalBookings: number;
  totalVisits: number;
  lastVisit: string | null;
  avgPartySize: number;
  tags: string[];
  notes: string | null;
  vip_status: boolean;
  bookings: RestaurantBooking[];
}

type ViewMode = 'list' | 'timeline';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatSlotTime(timeStr?: string | null): string {
  if (!timeStr) return '—';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return timeStr; }
}

function normaliseTime(raw: string): string {
  const s = String(raw).trim().toUpperCase();
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (m12) {
    let h = parseInt(m12[1]); const min = parseInt(m12[2] ?? '0');
    if (m12[3] === 'PM' && h !== 12) h += 12;
    if (m12[3] === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`;
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) return `${String(parseInt(m24[1])).padStart(2,'0')}:${m24[2]}:00`;
  return '';
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
    confirmed: 'success', completed: 'secondary', no_show: 'warning', cancelled: 'destructive',
  };
  return <Badge variant={map[status] ?? 'secondary'}>{status.replace('_', ' ')}</Badge>;
}

function SourceBadge({ source }: { source?: string | null }) {
  const info = SOURCE_LABELS[source ?? 'staff_manual'] ?? SOURCE_LABELS.staff_manual;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${info.color}`}>
      {info.label}
    </span>
  );
}

const FILTER_TABS: { label: string; value: FilterStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'No-show', value: 'no_show' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const SOURCE_OPTIONS = [
  { value: 'whatsapp',     label: 'WhatsApp' },
  { value: 'phone',        label: 'Phone Call' },
  { value: 'staff_manual', label: 'Staff (Manual)' },
  { value: 'website',      label: 'Website' },
  { value: 'walk_in',      label: 'Walk-in' },
  { value: 'instagram',    label: 'Instagram' },
  { value: 'google',       label: 'Google' },
];

function exportCSV(bookings: RestaurantBooking[], date: string) {
  const headers = ['Reservation ID','Name','Phone','Party Size','Slot Time','Status','Source','Payment Status','Deposit (₹)','Special Request','Created At'];
  const rows = bookings.map(b => [
    b.reservation_id, b.customer_name, b.customer_phone, b.party_size,
    b.slot_time ?? '', b.booking_status, b.source ?? 'staff_manual',
    b.payment_status, b.payment_amount > 0 ? Math.round(b.payment_amount / 100) : 0,
    b.special_request ?? '', new Date(b.created_at).toLocaleString('en-IN'),
  ]);
  const csv = [headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `reservations-${date}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function downloadTemplate(slots: RestaurantSlot[]) {
  const slotNote = slots.length ? slots.map(s => formatSlotTime(s.slot_time)).join(' / ') : '7:00 PM / 8:00 PM / 9:00 PM';
  const ws = XLSX.utils.aoa_to_sheet([
    ['customer_name','customer_phone','booking_date','slot_time','party_size','special_request','source'],
    ['Rohan Sharma','919876543210','2026-06-10',slots[0]?formatSlotTime(slots[0].slot_time):'7:00 PM',2,'Window table','phone'],
    ['Priya Mehta','919123456789','2026-06-10',slots[1]?formatSlotTime(slots[1].slot_time):'8:00 PM',4,'','whatsapp'],
  ]);
  ws['!cols'] = [{wch:20},{wch:16},{wch:14},{wch:12},{wch:12},{wch:24},{wch:14}];
  XLSX.utils.sheet_add_aoa(ws,[
    [],['— Notes —'],
    [`slot_time: use one of — ${slotNote}`],
    ['source: whatsapp / phone / website / walk_in / instagram / google / staff_manual'],
    ['booking_date: YYYY-MM-DD'],
  ],{origin:4});
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bookings Import');
  XLSX.writeFile(wb, 'bookings-import-template.xlsx');
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function BookingsClient() {
  const todayIST = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().split('T')[0];

  // Core state
  const [selectedDate, setSelectedDate] = useState(todayIST);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [bookings, setBookings] = useState<RestaurantBooking[]>([]);
  const [slots, setSlots] = useState<RestaurantSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Confirm cancel dialog
  const [cancelTarget, setCancelTarget] = useState<RestaurantBooking | null>(null);

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addParty, setAddParty] = useState('2');
  const [addDate, setAddDate] = useState(todayIST);
  const [addSlot, setAddSlot] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addSource, setAddSource] = useState('staff_manual');
  const [adding, setAdding] = useState(false);

  // Edit modal
  const [editBooking, setEditBooking] = useState<RestaurantBooking | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editParty, setEditParty] = useState('2');
  const [editSlot, setEditSlot] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editInternalNotes, setEditInternalNotes] = useState('');
  const [editSource, setEditSource] = useState('staff_manual');
  const [editStatus, setEditStatus] = useState('confirmed');
  const [saving, setSaving] = useState(false);

  // Import
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Guest profile panel
  const [guestProfile, setGuestProfile] = useState<GuestProfile | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);

  // ── Data fetching ───────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date: selectedDate });
      if (filterStatus !== 'all') params.set('status', filterStatus);
      const res = await fetch(`/api/restaurant/bookings?${params}`);
      if (!res.ok) throw new Error('Failed to load bookings');
      const json = await res.json();
      setBookings(json.data ?? []);
      if (json.tenantId && !tenantId) setTenantId(json.tenantId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, filterStatus, tenantId]);

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

  // ── Supabase Realtime ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`restaurant-bookings-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_bookings' }, (payload) => {
        const row = (payload.new ?? payload.old) as Record<string, unknown>;
        if (row?.restaurant_id !== tenantId) return;
        if (row?.booking_date === selectedDate || filterStatus !== 'all') fetchBookings();
      })
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, selectedDate, filterStatus, fetchBookings]);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const updateStatus = async (bookingId: string, newStatus: string) => {
    setUpdatingId(bookingId);
    try {
      const res = await fetch(`/api/restaurant/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      toast.success(`Marked as ${newStatus.replace('_', ' ')}`);
      await fetchBookings();
    } catch (err) { toast.error((err as Error).message); }
    finally { setUpdatingId(null); }
  };

  const createBooking = async () => {
    if (!addName.trim() || !addPhone.trim() || !addSlot || !addDate) { toast.error('Please fill required fields'); return; }
    setAdding(true);
    try {
      const res = await fetch('/api/restaurant/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: addName.trim(), customer_phone: addPhone.trim(),
          party_size: parseInt(addParty) || 2, booking_date: addDate,
          slot_id: addSlot, special_request: addNote, source: addSource,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create booking');
      toast.success(`Booking created — ${data.data?.reservation_id}`);
      setShowAdd(false);
      setAddName(''); setAddPhone(''); setAddParty('2'); setAddNote(''); setAddDate(todayIST); setAddSource('staff_manual');
      if (addDate === selectedDate) await fetchBookings();
    } catch (err) { toast.error((err as Error).message); }
    finally { setAdding(false); }
  };

  const openEdit = (booking: RestaurantBooking) => {
    setEditBooking(booking);
    setEditName(booking.customer_name);
    setEditPhone(booking.customer_phone);
    setEditParty(String(booking.party_size));
    setEditSlot(booking.slot_id);
    setEditNote(booking.special_request ?? '');
    setEditInternalNotes(booking.internal_notes ?? '');
    setEditSource(booking.source ?? 'staff_manual');
    setEditStatus(booking.booking_status);
  };

  const saveEdit = async () => {
    if (!editBooking || !editName.trim() || !editPhone.trim() || !editSlot) { toast.error('Please fill required fields'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/restaurant/bookings/${editBooking.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: editName.trim(), customer_phone: editPhone.trim(),
          party_size: parseInt(editParty) || 1, slot_id: editSlot,
          special_request: editNote.trim() || null,
          internal_notes: editInternalNotes.trim() || null,
          source: editSource, booking_status: editStatus,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to update booking');
      toast.success('Booking updated');
      setEditBooking(null);
      await fetchBookings();
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const openGuestProfile = async (booking: RestaurantBooking) => {
    setGuestLoading(true);
    setGuestProfile(null);
    try {
      const res = await fetch(`/api/restaurant/guests?phone=${booking.customer_phone}&name=${encodeURIComponent(booking.customer_name)}`);
      const data = await res.json();
      if (data.success) setGuestProfile(data.data);
    } catch { toast.error('Could not load guest profile'); }
    finally { setGuestLoading(false); }
  };

  // ── Import ──────────────────────────────────────────────────────────────────
  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        const slotMap: Record<string, string> = {};
        slots.forEach(s => {
          slotMap[s.slot_time] = s.id;
          slotMap[formatSlotTime(s.slot_time).toLowerCase()] = s.id;
        });
        const parsed: ImportRow[] = raw.map((row) => {
          const name = String(row['customer_name'] ?? row['name'] ?? row['Name'] ?? '').trim();
          const phone = String(row['customer_phone'] ?? row['phone'] ?? row['Phone'] ?? row['mobile'] ?? '').replace(/\D/g, '');
          const dateRaw = String(row['booking_date'] ?? row['date'] ?? row['Date'] ?? '').trim();
          const timeRaw = String(row['slot_time'] ?? row['time'] ?? row['Time'] ?? row['slot'] ?? '').trim();
          const partyRaw = parseInt(String(row['party_size'] ?? row['guests'] ?? row['pax'] ?? '1'));
          const note = String(row['special_request'] ?? row['notes'] ?? '').trim();

          // Date: parse if present, otherwise default to today (upload day = visit day)
          let bookingDate = '';
          if (/^\d{5}$/.test(dateRaw)) {
            const js = XLSX.SSF.parse_date_code(parseInt(dateRaw));
            bookingDate = `${js.y}-${String(js.m).padStart(2,'0')}-${String(js.d).padStart(2,'0')}`;
          } else if (/\d{4}-\d{2}-\d{2}/.test(dateRaw)) {
            bookingDate = dateRaw.slice(0, 10);
          } else if (dateRaw) {
            const p = new Date(dateRaw);
            if (!isNaN(p.getTime())) bookingDate = p.toISOString().split('T')[0];
          }
          const autoDate = !bookingDate;
          if (autoDate) bookingDate = todayIST;

          // Slot: match if possible, else leave empty (backend auto-assigns)
          const normTime = normaliseTime(timeRaw);
          const slotId = slotMap[normTime] ?? slotMap[timeRaw.toLowerCase()] ?? '';

          // Only name + a usable phone are required — nothing else can waste a name
          const errors: string[] = [];
          if (!name) errors.push('missing name');
          if (!phone || phone.length < 10) errors.push('invalid phone');

          const slotLabel = slotId
            ? (timeRaw || '—')
            : timeRaw ? `${timeRaw} → auto` : 'Auto slot';

          return {
            customer_name: name,
            customer_phone: phone,
            party_size: isNaN(partyRaw) ? 1 : partyRaw,
            booking_date: bookingDate,
            slot_id: slotId,
            slot_label: autoDate ? `${slotLabel} · dated today` : slotLabel,
            special_request: note || undefined,
            _error: errors.length ? errors.join(', ') : undefined,
          };
        }).filter(r => r.customer_name || r.customer_phone);
        setImportRows(parsed);
        setShowImport(true);
      } catch (err) { toast.error('Could not parse file: ' + (err as Error).message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmImport = async () => {
    const valid = importRows.filter(r => !r._error);
    if (!valid.length) { toast.error('No valid rows to import'); return; }
    setImporting(true);
    try {
      const res = await fetch('/api/restaurant/bookings/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: valid }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Import failed');
      const skippedMsg = data.skipped ? ` · ${data.skipped} skipped (no name/phone)` : '';
      toast.success(`Imported ${data.imported} guest${data.imported!==1?'s':''}${skippedMsg}`);
      setShowImport(false); setImportRows([]);
      await fetchBookings();
    } catch (err) { toast.error((err as Error).message); }
    finally { setImporting(false); }
  };

  // ── Derived state ────────────────────────────────────────────────────────────
  const allBookingsForDate = bookings; // full list (status filter may narrow it)

  // For KPIs we want all-status counts — so we track a separate "all bookings" state
  // For now, when filterStatus === 'all', bookings IS all bookings for the date
  const kpiBookings = filterStatus === 'all' ? bookings : bookings; // always use current set for partial
  const totalToday    = kpiBookings.length;
  const confirmedCount = kpiBookings.filter(b => b.booking_status === 'confirmed').length;
  const completedCount = kpiBookings.filter(b => b.booking_status === 'completed').length;
  const noShowCount    = kpiBookings.filter(b => b.booking_status === 'no_show').length;
  const cancelledCount = kpiBookings.filter(b => b.booking_status === 'cancelled').length;
  const coversToday    = kpiBookings.reduce((s, b) => s + b.party_size, 0);

  // Client-side search filter
  const q = searchQuery.toLowerCase().trim();
  const filtered = q
    ? bookings.filter(b =>
        b.customer_name.toLowerCase().includes(q) ||
        b.customer_phone.includes(q) ||
        b.reservation_id.toLowerCase().includes(q) ||
        (b.special_request ?? '').toLowerCase().includes(q)
      )
    : bookings;

  // Status tab counts (from full bookings list)
  const statusCounts: Record<string, number> = {
    all: bookings.length,
    confirmed: bookings.filter(b => b.booking_status === 'confirmed').length,
    completed: bookings.filter(b => b.booking_status === 'completed').length,
    no_show: bookings.filter(b => b.booking_status === 'no_show').length,
    cancelled: bookings.filter(b => b.booking_status === 'cancelled').length,
  };

  const validImportRows = importRows.filter(r => !r._error);
  const errorImportRows = importRows.filter(r => r._error);

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Reservations</h1>
            {isLive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
                <Wifi className="size-2.5" /> LIVE
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="size-4 mr-1.5" /> Import
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value=''; }} />
          <Button size="sm" variant="outline" onClick={() => exportCSV(bookings, selectedDate)} disabled={bookings.length===0}>
            <Download className="size-4 mr-1.5" /> Export
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="size-4 mr-1.5" /> Add Reservation
          </Button>
        </div>
      </div>

      {/* ── KPI Bar ── */}
      {!loading && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: totalToday, color: 'text-foreground' },
            { label: 'Confirmed', value: confirmedCount, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Completed', value: completedCount, color: 'text-muted-foreground' },
            { label: 'No-shows', value: noShowCount, color: 'text-amber-600 dark:text-amber-400' },
            { label: 'Cancelled', value: cancelledCount, color: 'text-destructive' },
            { label: 'Covers', value: coversToday, color: 'text-primary' },
          ].map(kpi => (
            <Card key={kpi.label} className="bg-card border-border shadow-none rounded-xl">
              <CardContent className="p-3 text-center">
                <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mt-0.5">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {loading && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[0,1,2,3,4,5].map(i => <Skeleton key={i} className="h-[68px] rounded-xl" />)}
        </div>
      )}

      {/* ── Controls ── */}
      <div className="flex flex-col gap-3">
        {/* Date + Search row */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex items-center gap-2">
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <button onClick={() => setSelectedDate(todayIST)}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors border border-border">
              Today
            </button>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, or reservation ID…"
              className="w-full h-9 pl-9 pr-3 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode==='list' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}>
              <List className="size-3.5" /> List
            </button>
            <button onClick={() => setViewMode('timeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${viewMode==='timeline' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}>
              <AlignLeft className="size-3.5" /> Timeline
            </button>
          </div>
        </div>

        {/* Status filter tabs with counts */}
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilterStatus(tab.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                filterStatus === tab.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {tab.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                filterStatus === tab.value ? 'bg-white/20' : 'bg-background'
              }`}>
                {statusCounts[tab.value] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Arriving Next (today only) ── */}
      <ArrivingNextWidget bookings={bookings} selectedDate={selectedDate} todayIST={todayIST} />

      {/* ── Reservation List / Timeline ── */}
      <div className="space-y-2">
        {loading ? (
          [0,1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)
        ) : viewMode === 'timeline' && filtered.length > 0 ? (
          // ── Timeline View ──────────────────────────────────────
          (() => {
            const bySlot: Record<string, RestaurantBooking[]> = {};
            filtered.forEach(b => {
              const key = b.slot_time ?? '__unknown__';
              if (!bySlot[key]) bySlot[key] = [];
              bySlot[key].push(b);
            });
            const slotKeys = Object.keys(bySlot).sort();

            return (
              <div className="space-y-4">
                {slotKeys.map(slotKey => {
                  const slotBookings = bySlot[slotKey];
                  const covers = slotBookings.reduce((s, b) => s + b.party_size, 0);
                  const confirmed = slotBookings.filter(b => b.booking_status === 'confirmed').length;
                  return (
                    <div key={slotKey}>
                      {/* Slot header */}
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                          <Clock className="size-3.5 text-primary" />
                          <span className="text-sm font-bold text-primary">
                            {slotKey === '__unknown__' ? 'No slot' : (() => {
                              try {
                                const [h, m] = slotKey.split(':').map(Number);
                                const d = new Date(); d.setHours(h, m, 0, 0);
                                return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
                              } catch { return slotKey; }
                            })()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{slotBookings.length} reservation{slotBookings.length !== 1 ? 's' : ''}</span>
                          <span>·</span>
                          <span className="font-semibold text-foreground">{covers} covers</span>
                          {confirmed > 0 && <span className="text-emerald-600 dark:text-emerald-400">· {confirmed} confirmed</span>}
                        </div>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      {/* Bookings in this slot */}
                      <div className="space-y-1.5 pl-1">
                        {slotBookings.map(booking => (
                          <div key={booking.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors group">
                            <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-primary">{booking.customer_name.charAt(0).toUpperCase()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{booking.customer_name}</p>
                              <p className="text-xs text-muted-foreground">{booking.party_size} covers{booking.special_request ? ` · ${booking.special_request}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <SourceBadge source={booking.source} />
                              <StatusBadge status={booking.booking_status} />
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a href={`tel:+${booking.customer_phone}`}
                                  className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                                  <Phone className="size-3.5" />
                                </a>
                                <button onClick={() => openEdit(booking)}
                                  className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                                  <Pencil className="size-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        ) : filtered.length === 0 ? (
          <Card className="bg-card border-border shadow-none rounded-xl">
            <CardContent className="py-12 text-center">
              {searchQuery ? (
                <p className="text-sm text-muted-foreground">No reservations match &quot;{searchQuery}&quot;</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-3">No reservations for this date.</p>
                  <Button size="sm" variant="outline" onClick={() => { setAddDate(selectedDate); setShowAdd(true); }}>
                    <Plus className="size-4 mr-1.5" /> Add Reservation
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          filtered.map((booking) => (
            <div key={booking.id}>
              <Card
                className={`bg-card border-border shadow-none rounded-xl cursor-pointer hover:border-primary/40 transition-colors ${
                  expandedId === booking.id ? 'rounded-b-none border-b-0' : ''
                }`}
                onClick={() => setExpandedId(expandedId === booking.id ? null : booking.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar */}
                      <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${
                        booking.is_vip ? 'bg-amber-500/10 border border-amber-300/30' : 'bg-primary/10'
                      }`}>
                        {booking.is_vip
                          ? <Star className="size-4 text-amber-500 fill-amber-500" />
                          : <span className="text-sm font-bold text-primary">{booking.customer_name.charAt(0).toUpperCase()}</span>
                        }
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground truncate">{booking.customer_name}</p>
                          {booking.is_vip && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-300/40 shrink-0">
                              ⭐ VIP
                            </span>
                          )}
                          <SourceBadge source={booking.source} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatSlotTime(booking.slot_time)} · {booking.party_size} cover{booking.party_size !== 1 ? 's' : ''}
                          {(booking.visit_count ?? 0) > 0 && (
                            <span className="text-muted-foreground/70"> · {booking.visit_count} visit{booking.visit_count !== 1 ? 's' : ''}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(booking); }}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Edit reservation"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <span className="text-xs font-mono text-muted-foreground hidden sm:block">{booking.reservation_id}</span>
                      <StatusBadge status={booking.booking_status} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {expandedId === booking.id && (
                <div className="border border-border rounded-b-xl bg-muted/20 px-4 py-4 space-y-4">
                  {/* Details grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground mb-1">Phone</p>
                      <a href={`tel:+${booking.customer_phone.replace(/\D/g,'')}`} onClick={(e) => e.stopPropagation()}
                        className="font-medium text-primary hover:underline flex items-center gap-1">
                        <Phone className="size-3" />{formatPhoneDisplay(booking.customer_phone)}
                      </a>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Reservation ID</p>
                      <p className="font-mono font-medium text-foreground">{booking.reservation_id}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Party Size</p>
                      <p className="font-medium text-foreground">{booking.party_size} covers</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Booked At</p>
                      <p className="font-medium text-foreground">
                        {new Date(booking.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </p>
                    </div>
                    {booking.special_request && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground mb-1">Guest Request</p>
                        <p className="font-medium text-foreground">{booking.special_request}</p>
                      </div>
                    )}
                    {booking.internal_notes && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground mb-1 flex items-center gap-1"><StickyNote className="size-3" /> Staff Notes</p>
                        <p className="font-medium text-foreground italic">{booking.internal_notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-2 flex-wrap pt-1">
                    <Button size="sm" variant="outline"
                      onClick={(e) => { e.stopPropagation(); openGuestProfile(booking); }}>
                      <History className="size-3.5 mr-1.5" /> Guest Profile
                    </Button>
                    <a href={`tel:+${booking.customer_phone}`} onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline"><Phone className="size-3.5 mr-1.5" /> Call</Button>
                    </a>
                    <a href={`https://wa.me/${booking.customer_phone}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline"><MessageCircle className="size-3.5 mr-1.5" /> WhatsApp</Button>
                    </a>

                    {booking.booking_status === 'confirmed' && (
                      <>
                        <Button variant="outline" size="sm" disabled={updatingId === booking.id}
                          onClick={(e) => { e.stopPropagation(); updateStatus(booking.id, 'no_show'); }}>
                          No-show
                        </Button>
                        <Button size="sm" disabled={updatingId === booking.id}
                          onClick={(e) => { e.stopPropagation(); updateStatus(booking.id, 'completed'); }}>
                          Completed
                        </Button>
                        <Button variant="destructive" size="sm" disabled={updatingId === booking.id}
                          onClick={(e) => { e.stopPropagation(); setCancelTarget(booking); }}>
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ═══ ADD MODAL ═══ */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
              <h3 className="text-base font-semibold">New Reservation</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 text-muted-foreground hover:bg-secondary rounded-md"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Guest Name" required>
                <input value={addName} onChange={(e)=>setAddName(e.target.value)} placeholder="e.g. Rohan Sharma" className={inputCls} />
              </Field>
              <Field label="Phone" required icon={<Phone className="w-3.5 h-3.5"/>}>
                <PhoneInput value={addPhone} onChange={setAddPhone} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" required icon={<Calendar className="w-3.5 h-3.5"/>}>
                  <input type="date" value={addDate} onChange={(e)=>setAddDate(e.target.value)} min={todayIST} className={inputCls} />
                </Field>
                <Field label="Covers" required icon={<Users className="w-3.5 h-3.5"/>}>
                  <input type="number" min={1} max={50} value={addParty} onChange={(e)=>setAddParty(e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label="Time Slot" required icon={<Clock className="w-3.5 h-3.5"/>}>
                {slots.length === 0
                  ? <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-200 rounded-lg px-3 py-2">No slots configured yet.</p>
                  : <select value={addSlot} onChange={(e)=>setAddSlot(e.target.value)} className={selectCls}>
                      {slots.map(s=><option key={s.id} value={s.id}>{formatSlotTime(s.slot_time)}</option>)}
                    </select>
                }
              </Field>
              <Field label="Source">
                <select value={addSource} onChange={(e)=>setAddSource(e.target.value)} className={selectCls}>
                  {SOURCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="Special Request (optional)">
                <input value={addNote} onChange={(e)=>setAddNote(e.target.value)} placeholder="e.g. Window table, Birthday cake" className={inputCls} />
              </Field>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" size="sm" onClick={()=>setShowAdd(false)}>Cancel</Button>
                <Button size="sm" disabled={adding||!addName.trim()||!addPhone.trim()||!addSlot} onClick={createBooking}>
                  {adding ? 'Saving…' : 'Confirm Reservation'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EDIT MODAL ═══ */}
      {editBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
              <div>
                <h3 className="text-base font-semibold">Edit Reservation</h3>
                <p className="text-xs text-muted-foreground font-mono">{editBooking.reservation_id}</p>
              </div>
              <button onClick={()=>setEditBooking(null)} className="p-1 text-muted-foreground hover:bg-secondary rounded-md"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Guest Name" required>
                <input value={editName} onChange={(e)=>setEditName(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Phone" required icon={<Phone className="w-3.5 h-3.5"/>}>
                <PhoneInput value={editPhone} onChange={setEditPhone} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Covers" required icon={<Users className="w-3.5 h-3.5"/>}>
                  <input type="number" min={1} max={50} value={editParty} onChange={(e)=>setEditParty(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Time Slot" required icon={<Clock className="w-3.5 h-3.5"/>}>
                  <select value={editSlot} onChange={(e)=>setEditSlot(e.target.value)} className={selectCls}>
                    {slots.map(s=><option key={s.id} value={s.id}>{formatSlotTime(s.slot_time)}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Source">
                  <select value={editSource} onChange={(e)=>setEditSource(e.target.value)} className={selectCls}>
                    {SOURCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={editStatus} onChange={(e)=>setEditStatus(e.target.value)} className={selectCls}>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="no_show">No-show</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </Field>
              </div>
              <Field label="Guest Request (optional)">
                <input value={editNote} onChange={(e)=>setEditNote(e.target.value)} placeholder="e.g. Window table" className={inputCls} />
              </Field>
              <Field label="Staff Notes (internal — not visible to guest)">
                <textarea value={editInternalNotes} onChange={(e)=>setEditInternalNotes(e.target.value)}
                  placeholder="e.g. VIP guest, prefers booth 4, high spender"
                  rows={2} className={`${inputCls} h-auto py-2 resize-none`} />
              </Field>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" size="sm" onClick={()=>setEditBooking(null)}>Cancel</Button>
                <Button size="sm" disabled={saving||!editName.trim()||!editPhone.trim()||!editSlot} onClick={saveEdit}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CANCEL CONFIRMATION ═══ */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <X className="size-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-base font-semibold">Cancel Reservation?</h3>
                <p className="text-xs text-muted-foreground">{cancelTarget.reservation_id}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              You are about to cancel the reservation for <strong className="text-foreground">{cancelTarget.customer_name}</strong> ({cancelTarget.party_size} covers, {formatSlotTime(cancelTarget.slot_time)}). This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={()=>setCancelTarget(null)}>Keep Reservation</Button>
              <Button variant="destructive" size="sm" disabled={!!updatingId}
                onClick={async()=>{ await updateStatus(cancelTarget.id,'cancelled'); setCancelTarget(null); }}>
                Yes, Cancel It
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ IMPORT MODAL ═══ */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h3 className="text-base font-semibold flex items-center gap-2"><FileSpreadsheet className="size-4"/>Import Reservations</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{validImportRows.length} valid · {errorImportRows.length} with errors</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={()=>downloadTemplate(slots)}>
                  <Download className="size-3.5 mr-1"/>Template
                </Button>
                <button onClick={()=>{setShowImport(false);setImportRows([]);}} className="p-1 text-muted-foreground hover:bg-secondary rounded-md">
                  <X className="w-4 h-4"/>
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1 px-6 py-4">
              {importRows.length===0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No rows found.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {['Name','Phone','Date','Slot','Covers','Status'].map(h=>(
                        <th key={h} className="text-left py-2 pr-3 text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row,i)=>(
                      <tr key={i} className={`border-b border-border/50 ${row._error?'opacity-60':''}`}>
                        <td className="py-2 pr-3 font-medium text-foreground">{row.customer_name||'—'}</td>
                        <td className="py-2 pr-3 font-mono text-foreground">{row.customer_phone||'—'}</td>
                        <td className="py-2 pr-3 text-foreground">{row.booking_date||'—'}</td>
                        <td className="py-2 pr-3 text-foreground">{row.slot_label}</td>
                        <td className="py-2 pr-3 text-foreground">{row.party_size}</td>
                        <td className="py-2">
                          {row._error
                            ? <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="size-3"/>{row._error}</span>
                            : <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Ready</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {errorImportRows.length>0 && (
              <div className="px-6 pb-3">
                <p className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-200/60 rounded-lg px-3 py-2">
                  <strong>{errorImportRows.length} row{errorImportRows.length!==1?'s':''}</strong> will be skipped. Fix and re-upload, or import only valid rows.
                </p>
              </div>
            )}
            <div className="flex justify-between items-center px-6 py-4 border-t border-border shrink-0">
              <button onClick={()=>fileInputRef.current?.click()} className="text-sm text-muted-foreground hover:text-foreground underline">
                Upload different file
              </button>
              <div className="flex gap-3">
                <Button variant="ghost" size="sm" onClick={()=>{setShowImport(false);setImportRows([]);}}>Cancel</Button>
                <Button size="sm" disabled={importing||validImportRows.length===0} onClick={confirmImport}>
                  {importing?'Importing…':`Import ${validImportRows.length} reservation${validImportRows.length!==1?'s':''}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ GUEST PROFILE PANEL ═══ */}
      {(guestProfile || guestLoading) && (
        <GuestProfilePanel
          profile={guestProfile}
          loading={guestLoading}
          onClose={() => setGuestProfile(null)}
          onProfileUpdate={() => { /* tags saved in panel */ }}
        />
      )}
    </div>
  );
}

// ─── Micro helpers ────────────────────────────────────────────────────────────
const inputCls = 'w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none';
const selectCls = 'w-full h-10 px-3 bg-background border border-border rounded-lg text-sm focus:border-primary outline-none';

function Field({ label, required, icon, children }: {
  label: string; required?: boolean; icon?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium flex items-center gap-1.5 text-foreground">
        {icon}{label}{required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}
