'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle } from 'lucide-react';
import { Modal, GuestStepper } from './overlay';
import type { ActionResult, SeatPayload } from './use-tables-api';

export function WalkInModal({
  onClose, onSubmit, table,
}: {
  onClose: () => void;
  onSubmit: (payload: SeatPayload) => Promise<ActionResult>;
  table?: { id: string; name: string; capacity: number } | null;
}) {
  const [guests, setGuests] = useState(table ? Math.min(2, table.capacity) : 2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await onSubmit({
      guestCount: guests,
      guestName: name.trim() || undefined,
      guestPhone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
      tableId: table?.id,
    });
    setSubmitting(false);
    if (res.ok) onClose();
    else setError(res.error || 'No table available.');
  }

  return (
    <Modal
      onClose={onClose}
      title={table ? `Seat walk-in at ${table.name}` : 'Seat walk-in'}
      footer={
        <Button onClick={handleSubmit} disabled={submitting} className="w-full h-12 rounded-xl text-base">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Seat now'}
        </Button>
      }
    >
      <div className="space-y-5 py-1">
        {table && <p className="text-xs text-muted-foreground -mt-1">Seats up to {table.capacity}</p>}

        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1.5 block">How many guests?</label>
          <GuestStepper value={guests} onChange={setGuests} max={table?.capacity ?? 50} />
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
            Name <span className="text-xs font-normal text-muted-foreground/70">(optional)</span>
          </label>
          <Input placeholder="Guest name" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
            Phone <span className="text-xs font-normal text-muted-foreground/70">(optional)</span>
          </label>
          <Input placeholder="Phone number" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl" />
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
            Notes <span className="text-xs font-normal text-muted-foreground/70">(optional)</span>
          </label>
          <Input placeholder="Allergy, seating preference..." value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 rounded-xl" />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
      </div>
    </Modal>
  );
}
