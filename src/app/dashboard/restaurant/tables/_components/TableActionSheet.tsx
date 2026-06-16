'use client';

import { useState } from 'react';
import {
  CalendarPlus, Footprints, UtensilsCrossed, Pencil, Ban, Sparkles,
  CheckCircle2, XCircle, Info, ShieldOff, Users, Clock, User, Phone,
} from 'lucide-react';
import { Modal } from './overlay';
import { STATUS_STYLES, elapsed, clock } from './status-config';
import type { TableData, GuestMemory } from './use-tables-api';

export type SheetAction =
  | 'reserve' | 'walkin' | 'seat' | 'edit' | 'cancel'
  | 'free' | 'free_to_cleaning' | 'available' | 'block' | 'unblock' | 'details';

export function TableActionSheet({
  table, guest, onClose, onAction,
}: {
  table: TableData;
  guest?: GuestMemory | null;
  onClose: () => void;
  onAction: (action: SheetAction) => void;
}) {
  const s = STATUS_STYLES[table.status];
  const [confirmCancel, setConfirmCancel] = useState(false);

  const run = (a: SheetAction) => { onAction(a); };

  return (
    <Modal
      onClose={onClose}
      title={
        <span className="flex items-center gap-2.5">
          <span>{table.name}</span>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${s.pill}`}>{s.label}</span>
        </span>
      }
    >
      <div className="py-1 space-y-4">
        {/* Summary */}
        <div className="rounded-xl bg-muted/60 p-3.5 space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>Seats {table.capacity}</span>
            {table.section && <span className="text-muted-foreground">· {table.section}</span>}
            {table.server_name && <span className="text-muted-foreground">· {table.server_name}</span>}
          </div>
          {(table.guest_name || table.reservation_label) && (
            <div className="flex items-center gap-2 text-sm text-foreground">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{table.guest_name || table.reservation_label}</span>
              {table.reservation_type === 'internal' && <span className="text-xs text-muted-foreground">(internal hold)</span>}
              {guest?.vip_status && <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-yellow-400 text-yellow-900">VIP</span>}
              {guest && guest.visit_count > 1 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-medium">{guest.visit_count}x</span>
              )}
            </div>
          )}
          {table.guest_phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-4 w-4" />{table.guest_phone}</div>
          )}
          {table.guest_count != null && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" />{table.guest_count} guest{table.guest_count > 1 ? 's' : ''}</div>
          )}
          {table.status === 'reserved' && table.reservation_time && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" />Reserved for {table.reservation_time}</div>
          )}
          {table.status === 'occupied' && table.seated_at && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" />Seated {clock(table.seated_at)} · {elapsed(table.seated_at)}</div>
          )}
          {table.status === 'blocked' && table.blocked_reason && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Ban className="h-4 w-4" />{table.blocked_reason}</div>
          )}
          {table.notes && <p className="text-sm text-muted-foreground italic pt-0.5">{table.notes}</p>}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          {table.status === 'available' && (
            <>
              <ActionRow primary icon={<CalendarPlus className="h-5 w-5" />} label="Reserve table" onClick={() => run('reserve')} />
              <ActionRow icon={<Footprints className="h-5 w-5" />} label="Seat walk-in" onClick={() => run('walkin')} />
              <ActionRow icon={<Ban className="h-5 w-5" />} label="Block table" onClick={() => run('block')} />
            </>
          )}

          {table.status === 'reserved' && (
            <>
              <ActionRow primary icon={<UtensilsCrossed className="h-5 w-5" />} label="Seat guests" onClick={() => run('seat')} />
              <ActionRow icon={<Pencil className="h-5 w-5" />} label="Edit reservation" onClick={() => run('edit')} />
              {confirmCancel ? (
                <div className="flex gap-2">
                  <button onClick={() => run('cancel')} className="grow h-11 rounded-xl bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 transition-colors cursor-pointer">Confirm cancel</button>
                  <button onClick={() => setConfirmCancel(false)} className="h-11 px-4 rounded-xl bg-muted text-foreground text-sm font-medium hover:bg-muted/70 transition-colors cursor-pointer">Keep</button>
                </div>
              ) : (
                <ActionRow destructive icon={<XCircle className="h-5 w-5" />} label="Cancel reservation" onClick={() => setConfirmCancel(true)} />
              )}
            </>
          )}

          {table.status === 'occupied' && (
            <>
              <ActionRow primary icon={<CheckCircle2 className="h-5 w-5" />} label="Free table" onClick={() => run('free')} />
              <ActionRow icon={<Sparkles className="h-5 w-5" />} label="Free → needs cleaning" onClick={() => run('free_to_cleaning')} />
            </>
          )}

          {table.status === 'cleaning' && (
            <>
              <ActionRow primary icon={<CheckCircle2 className="h-5 w-5" />} label="Mark available" onClick={() => run('available')} />
              <ActionRow icon={<Ban className="h-5 w-5" />} label="Block table" onClick={() => run('block')} />
            </>
          )}

          {table.status === 'blocked' && (
            <ActionRow primary icon={<ShieldOff className="h-5 w-5" />} label="Unblock table" onClick={() => run('unblock')} />
          )}

          <ActionRow icon={<Info className="h-5 w-5" />} label="View details & timeline" onClick={() => run('details')} />
        </div>
      </div>
    </Modal>
  );
}

function ActionRow({ icon, label, onClick, primary, destructive }: {
  icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean; destructive?: boolean;
}) {
  const cls = primary
    ? 'bg-foreground text-background hover:opacity-90'
    : destructive
      ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60'
      : 'bg-muted text-foreground hover:bg-muted/70';
  return (
    <button onClick={onClick}
      className={`w-full h-12 rounded-xl px-4 flex items-center gap-3 text-sm font-medium transition-colors cursor-pointer ${cls}`}>
      {icon}{label}
    </button>
  );
}
