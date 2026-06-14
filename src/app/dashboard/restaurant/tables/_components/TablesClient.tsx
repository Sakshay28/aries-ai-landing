'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Search, X, Plus, UserPlus, Users, Clock, User, Phone,
  Check, AlertCircle, Circle, CalendarCheck, Footprints,
  TrendingUp, Loader2, RefreshCw,
} from 'lucide-react';
import {
  useTablesAPI,
  type TableData,
  type TableStatus,
  type GuestMemory,
} from './use-tables-api';

const STATUS_CONFIG: Record<TableStatus, {
  bg: string; border: string; dot: string; label: string;
  labelColor: string; nameColor: string; metaColor: string; ring: string;
}> = {
  available: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200/60 dark:border-emerald-800/40',
    dot: 'bg-emerald-500',
    label: 'Available',
    labelColor: 'text-emerald-700 dark:text-emerald-400',
    nameColor: 'text-emerald-900 dark:text-emerald-200',
    metaColor: 'text-emerald-600 dark:text-emerald-400',
    ring: 'hover:ring-emerald-300/50 dark:hover:ring-emerald-700/50',
  },
  reserved: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    border: 'border-amber-200/60 dark:border-amber-800/40',
    dot: 'bg-amber-500',
    label: 'Reserved',
    labelColor: 'text-amber-700 dark:text-amber-400',
    nameColor: 'text-amber-900 dark:text-amber-200',
    metaColor: 'text-amber-600 dark:text-amber-400',
    ring: 'hover:ring-amber-300/50 dark:hover:ring-amber-700/50',
  },
  occupied: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    border: 'border-rose-200/60 dark:border-rose-800/40',
    dot: 'bg-rose-500',
    label: 'Occupied',
    labelColor: 'text-rose-700 dark:text-rose-400',
    nameColor: 'text-rose-900 dark:text-rose-200',
    metaColor: 'text-rose-600 dark:text-rose-400',
    ring: 'hover:ring-rose-300/50 dark:hover:ring-rose-700/50',
  },
};

function elapsed(ts: string | number): string {
  const time = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const mins = Math.floor((Date.now() - time) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function TableCard({ table, onCycle, guest }: { table: TableData; onCycle: () => void; guest?: GuestMemory | null }) {
  const c = STATUS_CONFIG[table.status];
  const isRepeat = guest && guest.visit_count > 1;
  const isVip = guest?.vip_status;
  return (
    <motion.button
      layout
      layoutId={table.id}
      onClick={onCycle}
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={[
        'relative w-full rounded-2xl border p-4 text-left transition-shadow',
        'cursor-pointer select-none outline-none',
        'hover:ring-2 active:ring-2',
        'min-h-[140px] flex flex-col justify-between',
        c.bg, c.border, c.ring,
      ].join(' ')}
    >
      {isVip && (
        <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-yellow-400 text-yellow-900 shadow-sm">VIP</span>
      )}
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-2xl font-semibold tracking-tight ${c.nameColor}`}>{table.name}</p>
          <div className={`mt-1 flex items-center gap-1.5 text-sm ${c.metaColor}`}>
            <Users className="h-3.5 w-3.5" />
            <span>{table.capacity}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${c.dot}`} />
          <span className={`text-xs font-medium ${c.labelColor}`}>{c.label}</span>
        </div>
      </div>
      <div className="mt-3">
        {table.guest_name && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${c.nameColor}`}>
            <User className="h-3.5 w-3.5" />
            <span className="truncate">{table.guest_name}</span>
          </div>
        )}
        {table.guest_count && (
          <p className={`text-xs mt-0.5 ${c.metaColor}`}>
            {table.guest_count} guest{table.guest_count > 1 ? 's' : ''}
          </p>
        )}
        {table.reservation_time && (
          <div className={`flex items-center gap-1 text-xs mt-1 ${c.metaColor}`}>
            <Clock className="h-3 w-3" />
            <span>{table.reservation_time}</span>
          </div>
        )}
        {table.status === 'occupied' && table.seated_at && (
          <div className={`flex items-center gap-1 text-xs mt-1 ${c.metaColor}`}>
            <Clock className="h-3 w-3" />
            <span>{elapsed(table.seated_at)}</span>
          </div>
        )}
        {isRepeat && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-medium">
              {guest.visit_count}x visitor
            </span>
            {guest.preferences && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[100px]" title={guest.preferences}>{guest.preferences}</span>
            )}
          </div>
        )}
        {!table.guest_name && table.status === 'available' && (
          <p className={`text-xs ${c.metaColor}`}>Tap to reserve</p>
        )}
      </div>
    </motion.button>
  );
}

const WALKIN_SIZES = [1, 2, 3, 4, 5, 6, 7, 8];

function WalkInPanel({ onClose, onWalkIn }: { onClose: () => void; onWalkIn: (count: number) => Promise<string | null> }) {
  const [result, setResult] = useState<{ success: boolean; table?: string; count?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleWalkIn(count: number) {
    setSubmitting(true);
    const tableName = await onWalkIn(count);
    setSubmitting(false);
    if (tableName) {
      setResult({ success: true, table: tableName, count });
      toast.success(`Walk-in seated at ${tableName}`);
      setTimeout(onClose, 1000);
    } else {
      setResult({ success: false, count });
      toast.error(`No table available for ${count} guests`);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        className="w-full max-w-md bg-background rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Walk-in</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <AnimatePresence mode="wait">
          {result?.success ? (
            <motion.div key="ok" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-10 gap-3">
              <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Check className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-lg font-medium">Seated at {result.table}</p>
              <p className="text-sm text-muted-foreground">{result.count} guest{result.count! > 1 ? 's' : ''}</p>
            </motion.div>
          ) : (
            <motion.div key="grid">
              <p className="text-sm text-muted-foreground mb-4">How many guests?</p>
              <div className="grid grid-cols-4 gap-3">
                {WALKIN_SIZES.map((n) => (
                  <motion.button key={n} whileTap={{ scale: 0.92 }} onClick={() => handleWalkIn(n)} disabled={submitting}
                    className="aspect-square rounded-2xl bg-muted hover:bg-muted/70 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-50">
                    <span className="text-2xl font-semibold">{n}</span>
                    <span className="text-[11px] text-muted-foreground">guest{n > 1 ? 's' : ''}</span>
                  </motion.button>
                ))}
              </div>
              {result?.success === false && (
                <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 mt-4">
                  <AlertCircle className="h-4 w-4" />No table available for {result.count} guests
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

const GUEST_COUNTS = [2, 4, 6, 8];
const TIME_SLOTS = [
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM',
  '2:00 PM', '7:00 PM', '7:30 PM', '8:00 PM',
  '8:30 PM', '9:00 PM', '9:30 PM', '10:00 PM',
];

function ReservationPanel({ onClose, onReserve }: {
  onClose: () => void;
  onReserve: (data: { guestName: string; guestPhone: string; guestCount: number; time: string; notes: string }) => Promise<string | null>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState(2);
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<{ success: boolean; table?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!name.trim() || !time) return;
    setSubmitting(true);
    const tableName = await onReserve({
      guestName: name.trim(),
      guestPhone: phone.trim(),
      guestCount: guests,
      time,
      notes: notes.trim(),
    });
    setSubmitting(false);
    if (tableName) {
      setResult({ success: true, table: tableName });
      toast.success(`Reserved ${tableName} for ${name.trim()}`);
      setTimeout(onClose, 1200);
    } else {
      setResult({ success: false });
      toast.error('No suitable table available');
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 40 }} animate={{ y: 0 }}
        className="w-full max-w-md bg-background rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">New reservation</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <AnimatePresence mode="wait">
          {result?.success ? (
            <motion.div key="ok" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-10 gap-3">
              <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Check className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-lg font-medium">Reserved {result.table}</p>
              <p className="text-sm text-muted-foreground">{name} · {guests} guests · {time}</p>
            </motion.div>
          ) : (
            <motion.div key="form" className="space-y-5">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Guest name</label>
                <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-11 rounded-xl" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Phone</label>
                <Input placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Guests</label>
                <div className="grid grid-cols-4 gap-2">
                  {GUEST_COUNTS.map((n) => (
                    <button key={n} onClick={() => setGuests(n)}
                      className={`h-11 rounded-xl text-sm font-medium transition-all cursor-pointer ${guests === n ? 'bg-foreground text-background' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Time</label>
                <div className="grid grid-cols-4 gap-2">
                  {TIME_SLOTS.map((t) => (
                    <button key={t} onClick={() => setTime(t)}
                      className={`h-9 rounded-lg text-xs font-medium transition-all cursor-pointer ${time === t ? 'bg-foreground text-background' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Notes</label>
                <Input placeholder="Birthday, allergy, preference..." value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 rounded-xl" />
              </div>
              {result?.success === false && (
                <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4" />No suitable table available
                </div>
              )}
              <Button onClick={handleSubmit} disabled={!name.trim() || !time || submitting} className="w-full h-12 rounded-xl text-base cursor-pointer">
                {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Reserve table'}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export function TablesClient() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return <TablesClientInner />;
}

function TablesClientInner() {
  const {
    tables, bookings, guestMemory, loading, error,
    searchQuery, setSearchQuery,
    cycleTable, walkIn, reserve, refetch,
  } = useTablesAPI();

  const [showWalkIn, setShowWalkIn] = useState(false);
  const [showReservation, setShowReservation] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((v) => v + 1), 30000); return () => clearInterval(t); }, []);

  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return tables;
    const q = searchQuery.toLowerCase();
    return tables.filter((t) =>
      t.name.toLowerCase().includes(q) ||
      t.guest_name?.toLowerCase().includes(q) ||
      t.guest_phone?.includes(q)
    );
  }, [tables, searchQuery]);

  const available = useMemo(() => tables.filter((t) => t.status === 'available').length, [tables]);
  const reserved = useMemo(() => tables.filter((t) => t.status === 'reserved').length, [tables]);
  const occupied = useMemo(() => tables.filter((t) => t.status === 'occupied').length, [tables]);
  const occupancyRate = useMemo(() => tables.length ? Math.round(((reserved + occupied) / tables.length) * 100) : 0, [reserved, occupied, tables.length]);

  const activeBookings = useMemo(() =>
    bookings.filter((b) => b.booking_status === 'confirmed'),
    [bookings]
  );

  const occupiedTables = useMemo(() =>
    tables.filter((t) => t.status === 'occupied' && t.seated_at),
    [tables]
  );

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  if (loading && tables.length === 0) {
    return (
      <div className="flex items-center justify-center py-40">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />Retry
        </Button>
      </div>
    );
  }

  if (tables.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tables</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{dateStr}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search table, guest, phone..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-9 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-shadow" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2 rounded-xl cursor-pointer" onClick={() => setShowWalkIn(true)}>
              <UserPlus className="h-4 w-4" />Walk-in
            </Button>
            <Button className="gap-2 rounded-xl cursor-pointer" onClick={() => setShowReservation(true)}>
              <Plus className="h-4 w-4" />Reservation
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl p-4 flex items-center gap-3">
          <Circle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-2xl font-bold tracking-tight text-foreground">{available}</p>
            <p className="text-xs text-muted-foreground">Available</p>
          </div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-4 flex items-center gap-3">
          <CalendarCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-2xl font-bold tracking-tight text-foreground">{reserved}</p>
            <p className="text-xs text-muted-foreground">Reserved</p>
          </div>
        </div>
        <div className="bg-rose-50 dark:bg-rose-950/40 rounded-xl p-4 flex items-center gap-3">
          <Footprints className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          <div>
            <p className="text-2xl font-bold tracking-tight text-foreground">{occupied}</p>
            <p className="text-xs text-muted-foreground">Occupied</p>
          </div>
        </div>
        <div className="bg-violet-50 dark:bg-violet-950/40 rounded-xl p-4 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <div>
            <p className="text-2xl font-bold tracking-tight text-foreground">{occupancyRate}%</p>
            <p className="text-xs text-muted-foreground">Occupancy</p>
          </div>
        </div>
      </div>

      {/* Table Board */}
      <LayoutGroup>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          <AnimatePresence mode="popLayout">
            {filteredTables.map((table) => (
              <TableCard key={table.id} table={table} onCycle={() => cycleTable(table.id)} guest={table.guest_phone ? guestMemory[table.guest_phone] : null} />
            ))}
          </AnimatePresence>
        </div>
        {filteredTables.length === 0 && (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">No tables match your search</div>
        )}
      </LayoutGroup>

      {/* Legend */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Tap = reserve</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Tap = seat</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />Tap = free</span>
      </div>

      {/* Activity */}
      {(activeBookings.length > 0 || occupiedTables.length > 0) && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <CalendarCheck className="h-3.5 w-3.5" />Today&apos;s activity
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeBookings.map((b) => {
              const slotTime = (b.restaurant_slots as any)?.slot_time;
              const timeDisplay = slotTime ? formatSlotTime(slotTime) : '';
              const tbl = tables.find((t) => t.id === b.table_id);
              const guest = b.customer_phone ? guestMemory[b.customer_phone] : null;
              return (
                <Card key={b.id} className="shadow-none rounded-xl border-border">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{b.customer_name}</span>
                        {guest?.vip_status && <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-yellow-400 text-yellow-900">VIP</span>}
                        {guest && guest.visit_count > 1 && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-medium">
                            {guest.visit_count}x
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        <span className="text-xs text-muted-foreground">Upcoming</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {timeDisplay && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{timeDisplay}</span>}
                      <span>{b.party_size} guests</span>
                      {tbl && <span className="font-medium text-foreground">{tbl.name}</span>}
                    </div>
                    {b.customer_phone && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{b.customer_phone}</div>}
                    {guest?.preferences && <p className="text-xs text-violet-600 dark:text-violet-400">{guest.preferences}</p>}
                    {guest?.birthday && isBirthdayToday(guest.birthday) && <p className="text-xs">🎂 Birthday today!</p>}
                    {b.special_request && <p className="text-xs text-muted-foreground italic">{b.special_request}</p>}
                    {b.source && b.source !== 'dashboard' && (
                      <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">
                        via {b.source === 'ai_whatsapp' ? 'WhatsApp' : b.source}
                      </span>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {occupiedTables.map((w) => (
              <Card key={w.id} className="shadow-none rounded-xl border-border">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Footprints className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{w.guest_name || 'Walk-in'}</span>
                    </div>
                    <span className="text-xs font-medium text-foreground">{w.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{w.guest_count} guests</span>
                    {w.seated_at && <span>Seated {new Date(w.seated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Panels */}
      <AnimatePresence>
        {showWalkIn && <WalkInPanel onClose={() => setShowWalkIn(false)} onWalkIn={walkIn} />}
        {showReservation && <ReservationPanel onClose={() => setShowReservation(false)} onReserve={reserve} />}
      </AnimatePresence>
    </div>
  );
}

function EmptyState() {
  const [seeding, setSeeding] = useState(false);

  async function seedTables() {
    setSeeding(true);
    try {
      const res = await fetch('/api/restaurant/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed' }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.count} tables created`);
        window.location.reload();
      } else {
        toast.error(json.error || 'Failed to seed tables');
      }
    } catch {
      toast.error('Failed to seed tables');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-40 gap-6">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
        <Users className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">No tables configured</h2>
        <p className="text-sm text-muted-foreground mt-1">Set up your restaurant tables to start managing reservations.</p>
      </div>
      <Button onClick={seedTables} disabled={seeding} className="gap-2">
        {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add 12 demo tables
      </Button>
    </div>
  );
}

function formatSlotTime(slotTime: string): string {
  const [h, m] = slotTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function isBirthdayToday(birthday: string): boolean {
  const now = new Date();
  const [, m, d] = birthday.split('-').map(Number);
  return now.getMonth() + 1 === m && now.getDate() === d;
}
