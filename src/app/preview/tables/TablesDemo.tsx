'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Search, X, Plus, UserPlus, Users, Clock, User,
  Check, AlertCircle, Circle, CalendarCheck, Footprints,
  TrendingUp,
} from 'lucide-react';
import { useTableStore, type RestaurantTable, type TableStatus } from './table-store';

const STATUS_CONFIG: Record<TableStatus, {
  bg: string; border: string; dot: string; label: string;
  labelColor: string; nameColor: string; metaColor: string; ring: string;
}> = {
  available: { bg: 'bg-emerald-50', border: 'border-emerald-200/60', dot: 'bg-emerald-500', label: 'Available', labelColor: 'text-emerald-700', nameColor: 'text-emerald-900', metaColor: 'text-emerald-600', ring: 'hover:ring-emerald-300/50' },
  reserved: { bg: 'bg-amber-50', border: 'border-amber-200/60', dot: 'bg-amber-500', label: 'Reserved', labelColor: 'text-amber-700', nameColor: 'text-amber-900', metaColor: 'text-amber-600', ring: 'hover:ring-amber-300/50' },
  occupied: { bg: 'bg-rose-50', border: 'border-rose-200/60', dot: 'bg-rose-500', label: 'Occupied', labelColor: 'text-rose-700', nameColor: 'text-rose-900', metaColor: 'text-rose-600', ring: 'hover:ring-rose-300/50' },
};

function elapsed(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function TablesDemo() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return <TablesInner />;
}

function TablesInner() {
  const tables = useTableStore((s) => s.tables);
  const searchQuery = useTableStore((s) => s.searchQuery);
  const cycleTable = useTableStore((s) => s.cycleTable);
  const setSearch = useTableStore((s) => s.setSearch);

  const [showWalkIn, setShowWalkIn] = useState(false);
  const [showReservation, setShowReservation] = useState(false);

  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return tables;
    const q = searchQuery.toLowerCase();
    return tables.filter((t) => t.name.toLowerCase().includes(q) || t.guestName?.toLowerCase().includes(q));
  }, [tables, searchQuery]);

  const available = useMemo(() => tables.filter((t) => t.status === 'available').length, [tables]);
  const reserved = useMemo(() => tables.filter((t) => t.status === 'reserved').length, [tables]);
  const occupied = useMemo(() => tables.filter((t) => t.status === 'occupied').length, [tables]);
  const occupancyRate = tables.length ? Math.round(((reserved + occupied) / tables.length) * 100) : 0;
  const dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1"><span className="px-2 py-0.5 text-[10px] rounded-full bg-violet-100 text-violet-700 font-medium">DEMO</span></div>
          <h1 className="text-2xl font-bold">Tables</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{dateStr}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-9 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30" />
            {searchQuery && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2 rounded-xl cursor-pointer" onClick={() => setShowWalkIn(true)}><UserPlus className="h-4 w-4" />Walk-in</Button>
            <Button className="gap-2 rounded-xl cursor-pointer" onClick={() => setShowReservation(true)}><Plus className="h-4 w-4" />Reservation</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-emerald-50 rounded-xl p-4 flex items-center gap-3"><Circle className="h-5 w-5 text-emerald-600" /><div><p className="text-2xl font-bold">{available}</p><p className="text-xs text-muted-foreground">Available</p></div></div>
        <div className="bg-amber-50 rounded-xl p-4 flex items-center gap-3"><CalendarCheck className="h-5 w-5 text-amber-600" /><div><p className="text-2xl font-bold">{reserved}</p><p className="text-xs text-muted-foreground">Reserved</p></div></div>
        <div className="bg-rose-50 rounded-xl p-4 flex items-center gap-3"><Footprints className="h-5 w-5 text-rose-600" /><div><p className="text-2xl font-bold">{occupied}</p><p className="text-xs text-muted-foreground">Occupied</p></div></div>
        <div className="bg-violet-50 rounded-xl p-4 flex items-center gap-3"><TrendingUp className="h-5 w-5 text-violet-600" /><div><p className="text-2xl font-bold">{occupancyRate}%</p><p className="text-xs text-muted-foreground">Occupancy</p></div></div>
      </div>

      <LayoutGroup>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          <AnimatePresence mode="popLayout">
            {filteredTables.map((table) => (
              <DemoCard key={table.id} table={table} onCycle={() => cycleTable(table.id)} />
            ))}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Tap = reserve</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />Tap = seat</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />Tap = free</span>
      </div>

      <AnimatePresence>
        {showWalkIn && <DemoWalkIn onClose={() => setShowWalkIn(false)} />}
        {showReservation && <DemoReservation onClose={() => setShowReservation(false)} />}
      </AnimatePresence>
    </div>
  );
}

function DemoCard({ table, onCycle }: { table: RestaurantTable; onCycle: () => void }) {
  const c = STATUS_CONFIG[table.status];
  return (
    <motion.button layout layoutId={table.id} onClick={onCycle} whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`relative w-full rounded-2xl border p-4 text-left cursor-pointer select-none outline-none hover:ring-2 min-h-[140px] flex flex-col justify-between ${c.bg} ${c.border} ${c.ring}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-2xl font-semibold tracking-tight ${c.nameColor}`}>{table.name}</p>
          <div className={`mt-1 flex items-center gap-1.5 text-sm ${c.metaColor}`}><Users className="h-3.5 w-3.5" /><span>{table.capacity}</span></div>
        </div>
        <div className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c.dot}`} /><span className={`text-xs font-medium ${c.labelColor}`}>{c.label}</span></div>
      </div>
      <div className="mt-3">
        {table.guestName && <div className={`flex items-center gap-1.5 text-sm font-medium ${c.nameColor}`}><User className="h-3.5 w-3.5" /><span className="truncate">{table.guestName}</span></div>}
        {table.guestCount && <p className={`text-xs mt-0.5 ${c.metaColor}`}>{table.guestCount} guest{table.guestCount > 1 ? 's' : ''}</p>}
        {table.reservationTime && <div className={`flex items-center gap-1 text-xs mt-1 ${c.metaColor}`}><Clock className="h-3 w-3" /><span>{table.reservationTime}</span></div>}
        {table.status === 'occupied' && table.seatedAt && <div className={`flex items-center gap-1 text-xs mt-1 ${c.metaColor}`}><Clock className="h-3 w-3" /><span>{elapsed(table.seatedAt)}</span></div>}
        {!table.guestName && table.status === 'available' && <p className={`text-xs ${c.metaColor}`}>Tap to reserve</p>}
      </div>
    </motion.button>
  );
}

function DemoWalkIn({ onClose }: { onClose: () => void }) {
  const [result, setResult] = useState<{ ok: boolean; table?: string; n?: number } | null>(null);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 40 }} animate={{ y: 0 }} className="w-full max-w-md bg-background rounded-t-2xl sm:rounded-2xl border shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5"><h2 className="text-lg font-semibold">Walk-in</h2><button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button></div>
        {result?.ok ? (
          <div className="flex flex-col items-center py-10 gap-3"><div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="h-7 w-7 text-emerald-600" /></div><p className="text-lg font-medium">Seated at {result.table}</p></div>
        ) : (
          <div><p className="text-sm text-muted-foreground mb-4">How many guests?</p>
            <div className="grid grid-cols-4 gap-3">
              {[1,2,3,4,5,6,7,8].map((n) => (
                <motion.button key={n} whileTap={{ scale: 0.92 }} onClick={() => {
                  const t = useTableStore.getState().walkIn(n);
                  if (t) { setResult({ ok: true, table: t, n }); toast.success(`Seated at ${t}`); setTimeout(onClose, 1000); }
                  else { toast.error('No table available'); setResult({ ok: false, n }); }
                }} className="aspect-square rounded-2xl bg-muted hover:bg-muted/70 flex flex-col items-center justify-center gap-1 cursor-pointer">
                  <span className="text-2xl font-semibold">{n}</span><span className="text-[11px] text-muted-foreground">guest{n > 1 ? 's' : ''}</span>
                </motion.button>
              ))}
            </div>
            {result?.ok === false && <div className="flex items-center gap-2 text-sm text-rose-600 mt-4"><AlertCircle className="h-4 w-4" />No table for {result.n} guests</div>}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function DemoReservation({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [guests, setGuests] = useState(2); const [time, setTime] = useState(''); const [notes, setNotes] = useState('');
  const [result, setResult] = useState<{ ok: boolean; table?: string } | null>(null);
  const TIMES = ['12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','7:00 PM','7:30 PM','8:00 PM','8:30 PM','9:00 PM','9:30 PM','10:00 PM'];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 40 }} animate={{ y: 0 }} className="w-full max-w-md bg-background rounded-t-2xl sm:rounded-2xl border shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5"><h2 className="text-lg font-semibold">New reservation</h2><button onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></button></div>
        {result?.ok ? (
          <div className="flex flex-col items-center py-10 gap-3"><div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="h-7 w-7 text-emerald-600" /></div><p className="text-lg font-medium">Reserved {result.table}</p></div>
        ) : (
          <div className="space-y-5">
            <div><label className="text-sm font-medium text-muted-foreground mb-1.5 block">Guest name</label><Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" /></div>
            <div><label className="text-sm font-medium text-muted-foreground mb-1.5 block">Phone</label><Input placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl" /></div>
            <div><label className="text-sm font-medium text-muted-foreground mb-1.5 block">Guests</label>
              <div className="grid grid-cols-4 gap-2">{[2,4,6,8].map((n) => <button key={n} onClick={() => setGuests(n)} className={`h-11 rounded-xl text-sm font-medium cursor-pointer ${guests === n ? 'bg-foreground text-background' : 'bg-muted'}`}>{n}</button>)}</div>
            </div>
            <div><label className="text-sm font-medium text-muted-foreground mb-1.5 block">Time</label>
              <div className="grid grid-cols-4 gap-2">{TIMES.map((t) => <button key={t} onClick={() => setTime(t)} className={`h-9 rounded-lg text-xs font-medium cursor-pointer ${time === t ? 'bg-foreground text-background' : 'bg-muted'}`}>{t}</button>)}</div>
            </div>
            <div><label className="text-sm font-medium text-muted-foreground mb-1.5 block">Notes</label><Input placeholder="Birthday, allergy..." value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 rounded-xl" /></div>
            <Button onClick={() => {
              if (!name.trim() || !time) return;
              const t = useTableStore.getState().createReservation({ guestName: name.trim(), guestPhone: phone.trim(), guestCount: guests, time, notes: notes.trim() });
              if (t) { setResult({ ok: true, table: t }); toast.success(`Reserved ${t}`); setTimeout(onClose, 1200); }
              else { toast.error('No table available'); setResult({ ok: false }); }
            }} disabled={!name.trim() || !time} className="w-full h-12 rounded-xl text-base cursor-pointer">Reserve table</Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
