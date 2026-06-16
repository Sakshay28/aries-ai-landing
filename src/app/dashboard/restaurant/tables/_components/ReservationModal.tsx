'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, User, Building2 } from 'lucide-react';
import { Modal, GuestStepper } from './overlay';
import { INTERNAL_LABELS } from './status-config';
import { generateTimeSlots, defaultSlotValue, formatTime12h } from './time-utils';
import type { ActionResult, ReservePayload, ReservationType, TableSettings } from './use-tables-api';

export interface ReservationInitial {
  reservationType?: ReservationType;
  guestName?: string;
  guestPhone?: string;
  reservationLabel?: string;
  guestCount?: number;
  time?: string;        // "HH:MM" or display
  notes?: string;
  durationMin?: number;
}

const DURATIONS = [60, 90, 120, 180];

export function ReservationModal({
  onClose, onSubmit, settings, table, initial, submitLabel = 'Reserve table',
}: {
  onClose: () => void;
  onSubmit: (payload: ReservePayload) => Promise<ActionResult>;
  settings: TableSettings;
  table?: { id: string; name: string; capacity: number } | null;
  initial?: ReservationInitial;
  submitLabel?: string;
}) {
  const slots = useMemo(
    () => generateTimeSlots(settings.open_time, settings.close_time, settings.slot_interval),
    [settings.open_time, settings.close_time, settings.slot_interval]
  );

  const [type, setType] = useState<ReservationType>(initial?.reservationType ?? 'guest');
  const [name, setName] = useState(initial?.guestName ?? '');
  const [phone, setPhone] = useState(initial?.guestPhone ?? '');
  const [label, setLabel] = useState(initial?.reservationLabel ?? '');
  const [guests, setGuests] = useState(initial?.guestCount ?? (table ? Math.min(2, table.capacity) : 2));
  const [time, setTime] = useState(() => normalizeInitialTime(initial?.time) || defaultSlotValue(slots));
  const [duration, setDuration] = useState(initial?.durationMin ?? 120);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = type === 'guest' ? !!name.trim() && !!time : !!label.trim() && !!time;

  async function handleSubmit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const payload: ReservePayload = {
      reservationType: type,
      guestName: type === 'guest' ? name.trim() : undefined,
      guestPhone: type === 'guest' ? phone.trim() : undefined,
      reservationLabel: type === 'internal' ? label.trim() : undefined,
      guestCount: guests,
      time,
      notes: notes.trim(),
      durationMin: duration,
      tableId: table?.id,
    };
    const res = await onSubmit(payload);
    setSubmitting(false);
    if (res.ok) onClose();
    else setError(res.error || 'Could not save reservation.');
  }

  return (
    <Modal
      onClose={onClose}
      title={table ? `Reserve ${table.name}` : 'New reservation'}
      footer={
        <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="w-full h-12 rounded-xl text-base">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : submitLabel}
        </Button>
      }
    >
      <div className="space-y-5 py-1">
        {table && (
          <p className="text-xs text-muted-foreground -mt-1">Seats up to {table.capacity}</p>
        )}

        {/* Reservation type */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl">
          <TypeTab active={type === 'guest'} onClick={() => setType('guest')} icon={<User className="h-4 w-4" />} label="Guest" />
          <TypeTab active={type === 'internal'} onClick={() => setType('internal')} icon={<Building2 className="h-4 w-4" />} label="Internal hold" />
        </div>

        {type === 'guest' ? (
          <>
            <Field label="Guest name" required>
              <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-11 rounded-xl" />
            </Field>
            <Field label="Phone" hint="optional">
              <Input placeholder="Phone number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl" />
            </Field>
          </>
        ) : (
          <Field label="Reservation label" required>
            <Input placeholder="e.g. VIP Hold" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus className="h-11 rounded-xl" />
            <div className="flex flex-wrap gap-2 mt-2">
              {INTERNAL_LABELS.map((l) => (
                <button key={l} type="button" onClick={() => setLabel(l)}
                  className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${label === l ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                  {l}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Party size">
          <GuestStepper value={guests} onChange={setGuests} max={table?.capacity ?? 50} />
        </Field>

        <Field label="Time">
          {slots.length > 0 ? (
            <select value={time} onChange={(e) => setTime(e.target.value)}
              className="w-full h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 cursor-pointer">
              {slots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          ) : (
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 rounded-xl" />
          )}
        </Field>

        <Field label="Hold for">
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)}
                className={`h-9 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${duration === d ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h ${d % 60}m`}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Notes" hint="optional">
          <Input placeholder="Birthday, allergy, preference..." value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 rounded-xl" />
        </Field>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function TypeTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`h-9 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${active ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
      {icon}{label}
    </button>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
        {label}{required && <span className="text-rose-500">*</span>}
        {hint && <span className="text-xs font-normal text-muted-foreground/70">({hint})</span>}
      </label>
      {children}
    </div>
  );
}

function normalizeInitialTime(t?: string): string {
  if (!t) return '';
  // already "HH:MM"
  if (/^\d{1,2}:\d{2}$/.test(t)) return t.padStart(5, '0');
  // "7:30 PM" -> "19:30"
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return '';
  let h = parseInt(m[1]);
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

export { formatTime12h };
