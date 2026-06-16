'use client';

import { Users, Clock, User, Phone, MapPin, UserCog, StickyNote, CalendarClock } from 'lucide-react';
import { SidePanel } from './overlay';
import { ActivityTimeline } from './ActivityTimeline';
import { STATUS_STYLES, elapsed, clock, isBirthdayToday } from './status-config';
import type { TableData, GuestMemory, ActivityItem } from './use-tables-api';

export function TableDetailPanel({
  table, guest, activity, onClose,
}: {
  table: TableData;
  guest?: GuestMemory | null;
  activity: ActivityItem[];
  onClose: () => void;
}) {
  const s = STATUS_STYLES[table.status];
  const tableActivity = activity.filter((a) => a.table_id === table.id);

  return (
    <SidePanel
      onClose={onClose}
      title={
        <span className="flex items-center gap-2.5">
          <span>{table.name}</span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${s.pill}`}>{s.label}</span>
        </span>
      }
    >
      <div className="space-y-6">
        {/* Facts */}
        <section className="space-y-3">
          <Row icon={<Users className="h-4 w-4" />} label="Capacity" value={`${table.capacity} seats`} />
          {table.section && <Row icon={<MapPin className="h-4 w-4" />} label="Section" value={table.section} />}
          {table.server_name && <Row icon={<UserCog className="h-4 w-4" />} label="Server" value={table.server_name} />}
        </section>

        {/* Current reservation / occupancy */}
        {(table.status === 'reserved' || table.status === 'occupied') && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
              {table.status === 'reserved' ? 'Current reservation' : 'Currently seated'}
            </h3>
            <div className="rounded-xl border border-border p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">{table.guest_name || table.reservation_label || 'Guest'}</span>
                {table.reservation_type === 'internal' && <span className="text-xs text-muted-foreground">(internal hold)</span>}
                {guest?.vip_status && <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-yellow-400 text-yellow-900">VIP</span>}
                {guest && guest.visit_count > 1 && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-medium">{guest.visit_count}x visitor</span>
                )}
              </div>
              {table.guest_phone && <Row icon={<Phone className="h-4 w-4" />} label="Phone" value={table.guest_phone} />}
              {table.guest_count != null && <Row icon={<Users className="h-4 w-4" />} label="Party" value={`${table.guest_count} guests`} />}
              {table.status === 'reserved' && table.reservation_time && (
                <Row icon={<CalendarClock className="h-4 w-4" />} label="Reserved for" value={table.reservation_time} />
              )}
              {table.status === 'occupied' && table.seated_at && (
                <Row icon={<Clock className="h-4 w-4" />} label="Seated" value={`${clock(table.seated_at)} · ${elapsed(table.seated_at)} ago`} />
              )}
              {table.notes && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground pt-1">
                  <StickyNote className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="italic">{table.notes}</span>
                </div>
              )}
              {guest?.preferences && <p className="text-xs text-violet-600 dark:text-violet-400">Prefers: {guest.preferences}</p>}
              {isBirthdayToday(guest?.birthday) && <p className="text-xs">🎂 Birthday today!</p>}
            </div>
          </section>
        )}

        {table.status === 'blocked' && table.blocked_reason && (
          <section>
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Blocked</h3>
            <p className="text-sm text-muted-foreground">{table.blocked_reason}</p>
          </section>
        )}

        {/* Timeline */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Activity timeline</h3>
          <ActivityTimeline items={tableActivity} />
        </section>
      </div>
    </SidePanel>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">{icon}{label}</span>
      <span className="text-foreground font-medium text-right">{value}</span>
    </div>
  );
}
