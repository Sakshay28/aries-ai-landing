'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Search, X, Plus, UserPlus, Users, Clock, User, Loader2, RefreshCw,
  AlertCircle, LayoutGrid, Rows3, Settings2, TrendingUp, Circle,
  CalendarCheck, Footprints, Sparkles, Ban,
} from 'lucide-react';
import {
  useTablesAPI, type TableData, type TableStatus, type GuestMemory,
} from './use-tables-api';
import { STATUS_STYLES, STATUS_ORDER, elapsed, isBirthdayToday } from './status-config';
import { TableActionSheet, type SheetAction } from './TableActionSheet';
import { TableDetailPanel } from './TableDetailPanel';
import { ReservationModal, type ReservationInitial } from './ReservationModal';
import { WalkInModal } from './WalkInModal';
import { TableSetupFlow } from './TableSetupFlow';
import { ManageTablesDrawer } from './ManageTablesDrawer';
import { ActivityTimeline } from './ActivityTimeline';

const ANIMATE_MAX = 40; // disable per-card spring animation above this many tables
type Filter = 'all' | TableStatus;

export function TablesClient() {
  // This component is loaded with `dynamic(..., { ssr: false })`, so it only
  // renders on the client — localStorage is safe to read at init.
  const [view, setViewState] = useState<'grid' | 'compact'>(() => {
    if (typeof window === 'undefined') return 'grid';
    return localStorage.getItem('aries_tables_view') === 'compact' ? 'compact' : 'grid';
  });
  const setView = (v: 'grid' | 'compact') => {
    setViewState(v);
    try { localStorage.setItem('aries_tables_view', v); } catch { /* ignore */ }
  };
  return <Inner view={view} setView={setView} />;
}

function Inner({ view, setView }: { view: 'grid' | 'compact'; setView: (v: 'grid' | 'compact') => void }) {
  const api = useTablesAPI();
  const { tables, activity, guestMemory, settings, loading, error, refetch } = api;

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((v) => v + 1), 30000); return () => clearInterval(t); }, []);

  // Modal state
  const [actionTable, setActionTable] = useState<TableData | null>(null);
  const [detailTable, setDetailTable] = useState<TableData | null>(null);
  const [showManage, setShowManage] = useState(false);
  const [reservationCtx, setReservationCtx] = useState<{ table?: TableData; initial?: ReservationInitial; bookingId?: string | null } | null>(null);
  const [walkInTable, setWalkInTable] = useState<TableData | null | 'auto'>(null);

  const counts = useMemo(() => {
    const c: Record<TableStatus, number> = { available: 0, reserved: 0, occupied: 0, cleaning: 0, blocked: 0 };
    for (const t of tables) c[t.status]++;
    return c;
  }, [tables]);
  const occupancyRate = tables.length ? Math.round(((counts.reserved + counts.occupied) / tables.length) * 100) : 0;

  const searchLc = search.trim().toLowerCase();
  const matches = useCallback((t: TableData) => {
    if (!searchLc) return false;
    return (t.guest_name?.toLowerCase().includes(searchLc) ||
      t.guest_phone?.includes(searchLc) ||
      t.reservation_label?.toLowerCase().includes(searchLc)) ?? false;
  }, [searchLc]);

  const visibleTables = useMemo(
    () => filter === 'all' ? tables : tables.filter((t) => t.status === filter),
    [tables, filter]
  );

  const filteredActivity = useMemo(() => {
    if (!searchLc) return activity;
    return activity.filter((a) =>
      a.guest_name?.toLowerCase().includes(searchLc) ||
      a.guest_phone?.includes(searchLc) ||
      a.table_name?.toLowerCase().includes(searchLc) ||
      a.detail?.toLowerCase().includes(searchLc)
    );
  }, [activity, searchLc]);

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  // ── Action routing from the action sheet ───────────────────────────────────
  const handleSheetAction = useCallback(async (action: SheetAction) => {
    const t = actionTable;
    if (!t) return;
    setActionTable(null);

    const report = (res: { ok: boolean; error?: string }, okMsg: string) => {
      if (res.ok) toast.success(okMsg); else toast.error(res.error || 'Action failed');
    };

    switch (action) {
      case 'reserve':
        setReservationCtx({ table: t });
        break;
      case 'walkin':
        setWalkInTable(t);
        break;
      case 'details':
        setDetailTable(t);
        break;
      case 'edit':
        setReservationCtx({
          table: t,
          bookingId: t.current_booking_id,
          initial: {
            reservationType: t.reservation_type ?? 'guest',
            guestName: t.guest_name ?? '',
            guestPhone: t.guest_phone ?? '',
            reservationLabel: t.reservation_label ?? '',
            guestCount: t.guest_count ?? 2,
            time: t.reservation_time ?? '',
            notes: t.notes ?? '',
            durationMin: t.reserved_duration_min ?? 120,
          },
        });
        break;
      case 'seat':
        report(await api.seatTable({ guestCount: t.guest_count ?? 2, tableId: t.id }), `Seated at ${t.name}`);
        break;
      case 'cancel':
        report(await api.setTableStatus(t.id, 'cancel'), `${t.name} reservation cancelled`);
        break;
      case 'free':
        report(await api.setTableStatus(t.id, 'free'), `${t.name} freed`);
        break;
      case 'free_to_cleaning':
        report(await api.setTableStatus(t.id, 'free_to_cleaning'), `${t.name} → cleaning`);
        break;
      case 'available':
        report(await api.setTableStatus(t.id, 'available'), `${t.name} ready`);
        break;
      case 'block':
        report(await api.setTableStatus(t.id, 'block'), `${t.name} blocked`);
        break;
      case 'unblock':
        report(await api.setTableStatus(t.id, 'unblock'), `${t.name} unblocked`);
        break;
    }
  }, [actionTable, api]);

  // ── Loading / error / empty ────────────────────────────────────────────────
  if (loading && tables.length === 0) {
    return <div className="flex items-center justify-center py-40"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }
  if (error && tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={refetch} className="gap-2"><RefreshCw className="h-4 w-4" />Retry</Button>
      </div>
    );
  }
  if (tables.length === 0) {
    return <TableSetupFlow onGenerate={api.generateTables} />;
  }

  const animate = view === 'grid' && tables.length <= ANIMATE_MAX;

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tables</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{dateStr}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex items-center p-0.5 bg-muted rounded-xl shrink-0">
            <ViewBtn active={view === 'grid'} onClick={() => setView('grid')} icon={<LayoutGrid className="h-4 w-4" />} label="Grid" />
            <ViewBtn active={view === 'compact'} onClick={() => setView('compact')} icon={<Rows3 className="h-4 w-4" />} label="Compact" />
          </div>
          <Button variant="outline" className="h-10 px-3 rounded-xl gap-2 shrink-0" onClick={() => setShowManage(true)}>
            <Settings2 className="h-4 w-4" /><span className="hidden sm:inline">Manage</span>
          </Button>
          <Button variant="outline" className="h-10 px-4 rounded-xl gap-2 shrink-0" onClick={() => setWalkInTable('auto')}>
            <UserPlus className="h-4 w-4" />Walk-in
          </Button>
          <Button className="h-10 px-4 rounded-xl gap-2 shrink-0" onClick={() => setReservationCtx({})}>
            <Plus className="h-4 w-4" />Reservation
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<Circle className="h-5 w-5 text-emerald-500" />} value={counts.available} label="Available" />
        <Stat icon={<CalendarCheck className="h-5 w-5 text-amber-500" />} value={counts.reserved} label="Reserved" />
        <Stat icon={<Footprints className="h-5 w-5 text-rose-500" />} value={counts.occupied} label="Occupied" />
        <Stat icon={<TrendingUp className="h-5 w-5 text-violet-500" />} value={`${occupancyRate}%`} label="Occupancy" />
      </div>

      {/* Search (guest / phone — never table numbers) */}
      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search guest or phone…"
          className="w-full h-10 pl-9 pr-9 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"><X className="h-4 w-4" /></button>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <Pill active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={tables.length} />
        {STATUS_ORDER.map((s) => (
          <Pill key={s} active={filter === s} onClick={() => setFilter(s)} label={STATUS_STYLES[s].label} count={counts[s]} dot={STATUS_STYLES[s].dot} />
        ))}
      </div>

      {/* Board */}
      {view === 'grid' ? (
        <GridBoard tables={visibleTables} guestMemory={guestMemory} matches={matches} animate={animate} onTap={setActionTable} />
      ) : (
        <CompactBoard tables={visibleTables} matches={matches} onTap={setActionTable} />
      )}
      {visibleTables.length === 0 && (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">No {filter !== 'all' ? STATUS_STYLES[filter as TableStatus].label.toLowerCase() : ''} tables</div>
      )}

      {/* Activity */}
      <div className="pt-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-2">
          <CalendarCheck className="h-3.5 w-3.5" />Today&apos;s activity
          {searchLc && <span className="font-normal normal-case tracking-normal">· {filteredActivity.length} match{filteredActivity.length !== 1 ? 'es' : ''}</span>}
        </h2>
        <div className="rounded-2xl border border-border p-2 sm:p-3 max-h-[420px] overflow-y-auto">
          <ActivityTimeline items={filteredActivity.slice(0, 50)} />
        </div>
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {actionTable && (
          <TableActionSheet
            key="sheet"
            table={actionTable}
            guest={actionTable.guest_phone ? guestMemory[actionTable.guest_phone] : null}
            onClose={() => setActionTable(null)}
            onAction={handleSheetAction}
          />
        )}
        {detailTable && (
          <TableDetailPanel
            key="detail"
            table={tables.find((t) => t.id === detailTable.id) ?? detailTable}
            guest={detailTable.guest_phone ? guestMemory[detailTable.guest_phone] : null}
            activity={activity}
            onClose={() => setDetailTable(null)}
          />
        )}
        {reservationCtx && (
          <ReservationModal
            key="reserve"
            settings={settings}
            table={reservationCtx.table ? { id: reservationCtx.table.id, name: reservationCtx.table.name, capacity: reservationCtx.table.capacity } : null}
            initial={reservationCtx.initial}
            submitLabel={reservationCtx.bookingId !== undefined ? 'Save changes' : 'Reserve table'}
            onClose={() => setReservationCtx(null)}
            onSubmit={async (payload) => {
              const isEdit = reservationCtx.bookingId !== undefined;
              const res = isEdit
                ? await api.editReservation({ ...payload, bookingId: reservationCtx.bookingId })
                : await api.reserveTable(payload);
              if (res.ok) toast.success(isEdit ? 'Reservation updated' : `Reserved ${res.tableName ?? ''}`.trim());
              return res;
            }}
          />
        )}
        {walkInTable !== null && (
          <WalkInModal
            key="walkin"
            table={walkInTable === 'auto' ? null : { id: walkInTable.id, name: walkInTable.name, capacity: walkInTable.capacity }}
            onClose={() => setWalkInTable(null)}
            onSubmit={async (payload) => {
              const res = await api.seatTable(payload);
              if (res.ok) toast.success(`Seated at ${res.tableName ?? 'table'}`);
              return res;
            }}
          />
        )}
        {showManage && (
          <ManageTablesDrawer
            key="manage"
            tables={tables}
            settings={settings}
            onClose={() => setShowManage(false)}
            onCreate={api.createTable}
            onUpdate={api.updateTable}
            onDeactivate={api.deactivateTable}
            onUpdateSettings={api.updateSettings}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Board renderers ───────────────────────────────────────────────────────

function GridBoard({ tables, guestMemory, matches, animate, onTap }: {
  tables: TableData[]; guestMemory: Record<string, GuestMemory>; matches: (t: TableData) => boolean; animate: boolean; onTap: (t: TableData) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {tables.map((t) => (
        <TableCard key={t.id} table={t} guest={t.guest_phone ? guestMemory[t.guest_phone] : null} highlight={matches(t)} animate={animate} onClick={() => onTap(t)} />
      ))}
    </div>
  );
}

function CompactBoard({ tables, matches, onTap }: { tables: TableData[]; matches: (t: TableData) => boolean; onTap: (t: TableData) => void }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2" style={{ contentVisibility: 'auto' }}>
      {tables.map((t) => {
        const s = STATUS_STYLES[t.status];
        return (
          <button key={t.id} onClick={() => onTap(t)}
            className={`relative rounded-xl border px-2 py-2.5 text-left transition-shadow cursor-pointer hover:shadow-sm ${s.compact} ${matches(t) ? 'ring-2 ring-violet-400' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold truncate">{t.name}</span>
              <span className={`h-2 w-2 rounded-full ${s.dot} shrink-0`} />
            </div>
            <div className="flex items-center gap-1 text-[11px] opacity-80 mt-0.5"><Users className="h-3 w-3" />{t.capacity}</div>
            {(t.guest_name || t.reservation_label) && (
              <p className="text-[10px] mt-0.5 truncate opacity-90">{t.guest_name || t.reservation_label}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

function TableCard({ table, guest, highlight, animate, onClick }: {
  table: TableData; guest?: GuestMemory | null; highlight: boolean; animate: boolean; onClick: () => void;
}) {
  const s = STATUS_STYLES[table.status];
  const isRepeat = guest && guest.visit_count > 1;
  const Cmp: React.ElementType = animate ? motion.button : 'button';
  const animProps = animate ? { layout: true, whileTap: { scale: 0.97 }, whileHover: { scale: 1.02 }, transition: { type: 'spring', stiffness: 500, damping: 30 } } : {};
  return (
    <Cmp
      {...animProps}
      onClick={onClick}
      className={`relative w-full rounded-2xl border p-4 text-left transition-shadow cursor-pointer select-none outline-none hover:ring-2 ${s.cardBg} ${s.cardBorder} ${s.ring} ${highlight ? 'ring-2 ring-violet-400' : ''} min-h-[132px] flex flex-col justify-between`}
    >
      {guest?.vip_status && (
        <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-yellow-400 text-yellow-900 shadow-sm">VIP</span>
      )}
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-2xl font-semibold tracking-tight ${s.text}`}>{table.name}</p>
          <div className={`mt-1 flex items-center gap-1.5 text-sm ${s.meta}`}><Users className="h-3.5 w-3.5" /><span>{table.capacity}</span></div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${s.dot}`} />
          <span className={`text-xs font-medium ${s.meta}`}>{s.label}</span>
        </div>
      </div>
      <div className="mt-3 space-y-0.5">
        {(table.guest_name || table.reservation_label) && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${s.text}`}>
            {table.reservation_type === 'internal' ? <Ban className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            <span className="truncate">{table.guest_name || table.reservation_label}</span>
          </div>
        )}
        {table.guest_count != null && table.status !== 'available' && (
          <p className={`text-xs ${s.meta}`}>{table.guest_count} guest{table.guest_count > 1 ? 's' : ''}</p>
        )}
        {table.status === 'reserved' && table.reservation_time && (
          <div className={`flex items-center gap-1 text-xs ${s.meta}`}><Clock className="h-3 w-3" />{table.reservation_time}</div>
        )}
        {table.status === 'occupied' && table.seated_at && (
          <div className={`flex items-center gap-1 text-xs ${s.meta}`}><Clock className="h-3 w-3" />{elapsed(table.seated_at)}</div>
        )}
        {table.status === 'cleaning' && (
          <div className={`flex items-center gap-1 text-xs ${s.meta}`}><Sparkles className="h-3 w-3" />Needs cleaning</div>
        )}
        {table.status === 'blocked' && (
          <div className={`flex items-center gap-1 text-xs ${s.meta}`}><Ban className="h-3 w-3" />{table.blocked_reason || 'Blocked'}</div>
        )}
        {isRepeat && (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-medium">{guest!.visit_count}x</span>
        )}
        {isBirthdayToday(guest?.birthday) && <span className="text-[10px]">🎂 today</span>}
        {table.status === 'available' && !table.guest_name && <p className={`text-xs ${s.meta}`}>Tap to manage</p>}
      </div>
    </Cmp>
  );
}

// ── Small UI bits ─────────────────────────────────────────────────────────

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      {icon}
      <div>
        <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function ViewBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${active ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function Pill({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button onClick={onClick}
      className={`h-8 px-3 rounded-full text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer border ${active ? 'bg-foreground text-background border-foreground' : 'bg-background text-muted-foreground border-border hover:text-foreground'}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}<span className={active ? 'opacity-80' : 'opacity-60'}>{count}</span>
    </button>
  );
}
