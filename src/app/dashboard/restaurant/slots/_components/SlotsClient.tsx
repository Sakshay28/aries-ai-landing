'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RestaurantSlot } from '@/lib/types';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';

const DAY_TYPE_LABELS: Record<string, string> = {
  weekday: 'Weekdays',
  weekend: 'Weekends',
  both: 'Every Day',
};

function formatSlotTime(timeStr: string): string {
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return timeStr;
  }
}

export function SlotsClient() {
  const [slots, setSlots] = useState<RestaurantSlot[]>([]);
  const [loading, setLoading] = useState(true);

  // Add slot form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSlotTime, setNewSlotTime] = useState('19:00');
  const [newDayType, setNewDayType] = useState<'weekday' | 'weekend' | 'both'>('both');
  const [newCapacity, setNewCapacity] = useState(20);
  const [adding, setAdding] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCapacity, setEditCapacity] = useState(0);
  const [editDayType, setEditDayType] = useState<'weekday' | 'weekend' | 'both'>('both');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
      const res = await fetch(`/api/restaurant/slots?date=${today}`);
      if (!res.ok) throw new Error('Failed to load slots');
      const { data } = await res.json();
      setSlots(data ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSlots(); }, [fetchSlots]);

  const addSlot = async () => {
    if (!newSlotTime || newCapacity < 1) {
      toast.error('Please fill in all fields correctly');
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/restaurant/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_time: `${newSlotTime}:00`,
          day_type: newDayType,
          total_capacity: newCapacity,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Failed to create slot');
      }
      toast.success('Slot created');
      setShowAddForm(false);
      setNewSlotTime('19:00');
      setNewCapacity(20);
      await fetchSlots();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (slot: RestaurantSlot) => {
    setEditingId(slot.id);
    setEditCapacity(slot.total_capacity);
    setEditDayType(slot.day_type);
  };

  const saveEdit = async (slotId: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/restaurant/slots/${slotId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_capacity: editCapacity, day_type: editDayType }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Failed to update slot');
      }
      toast.success('Slot updated');
      setEditingId(null);
      await fetchSlots();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteSlot = async (slotId: string) => {
    if (!confirm('Deactivate this slot? Future bookings will not be affected automatically.')) return;
    setDeletingId(slotId);
    try {
      const res = await fetch(`/api/restaurant/slots/${slotId}`, { method: 'DELETE' });
      const { warning } = await res.json();
      if (warning) toast.warning(warning);
      else toast.success('Slot deactivated');
      await fetchSlots();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Slot Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Define your restaurant's time slots and seating capacity.</p>
        </div>
        <Button
          id="add-slot-btn"
          size="sm"
          onClick={() => setShowAddForm((v) => !v)}
        >
          <Plus className="size-4 mr-1" />
          Add Slot
        </Button>
      </div>

      {/* Add Slot Form */}
      {showAddForm && (
        <Card className="bg-card border-border shadow-none rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">New Slot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Time</label>
                <input
                  id="new-slot-time"
                  type="time"
                  value={newSlotTime}
                  onChange={(e) => setNewSlotTime(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Day Type</label>
                <select
                  id="new-slot-day-type"
                  value={newDayType}
                  onChange={(e) => setNewDayType(e.target.value as typeof newDayType)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="both">Every Day</option>
                  <option value="weekday">Weekdays Only</option>
                  <option value="weekend">Weekends Only</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Capacity (seats)</label>
                <input
                  id="new-slot-capacity"
                  type="number"
                  min={1}
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(parseInt(e.target.value) || 1)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button id="confirm-add-slot" size="sm" onClick={addSlot} disabled={adding}>
                {adding ? 'Creating…' : 'Create Slot'}
              </Button>
              <Button id="cancel-add-slot" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Slots list */}
      <div className="space-y-2">
        {loading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)
        ) : slots.length === 0 ? (
          <Card className="bg-card border-border shadow-none rounded-xl">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No active slots yet. Add your first slot above.
            </CardContent>
          </Card>
        ) : (
          slots.map((slot) => (
            <Card key={slot.id} className="bg-card border-border shadow-none rounded-xl">
              <CardContent className="p-4">
                {editingId === slot.id ? (
                  // Inline edit mode
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <span className="text-base font-semibold text-foreground w-28 shrink-0">
                      {formatSlotTime(slot.slot_time)}
                    </span>
                    <div className="flex flex-wrap gap-2 flex-1">
                      <select
                        id={`edit-day-type-${slot.id}`}
                        value={editDayType}
                        onChange={(e) => setEditDayType(e.target.value as typeof editDayType)}
                        className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                      >
                        <option value="both">Every Day</option>
                        <option value="weekday">Weekdays Only</option>
                        <option value="weekend">Weekends Only</option>
                      </select>
                      <input
                        id={`edit-capacity-${slot.id}`}
                        type="number"
                        min={1}
                        value={editCapacity}
                        onChange={(e) => setEditCapacity(parseInt(e.target.value) || 1)}
                        className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                        placeholder="Capacity"
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button
                        id={`save-slot-${slot.id}`}
                        size="icon"
                        variant="default"
                        className="size-8"
                        disabled={saving}
                        onClick={() => saveEdit(slot.id)}
                      >
                        <Check className="size-4" />
                      </Button>
                      <Button
                        id={`cancel-edit-${slot.id}`}
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  // Display mode
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-semibold text-foreground">
                          {formatSlotTime(slot.slot_time)}
                        </span>
                        <Badge variant="secondary">{DAY_TYPE_LABELS[slot.day_type]}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        {slot.remaining_capacity !== undefined ? (
                          <span className={`text-sm font-medium tabular-nums ${
                            slot.remaining_capacity === 0
                              ? 'text-destructive'
                              : slot.remaining_capacity / slot.total_capacity < 0.2
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-muted-foreground'
                          }`}>
                            {slot.remaining_capacity === 0
                              ? 'FULL'
                              : `${slot.remaining_capacity} / ${slot.total_capacity} left`}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">{slot.total_capacity} seats</span>
                        )}
                        <Button
                          id={`edit-slot-${slot.id}`}
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => startEdit(slot)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          id={`delete-slot-${slot.id}`}
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive hover:text-destructive"
                          disabled={deletingId === slot.id}
                          onClick={() => deleteSlot(slot.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Capacity progress bar */}
                    {slot.remaining_capacity !== undefined && (() => {
                      const booked = slot.total_capacity - slot.remaining_capacity;
                      const pct    = slot.total_capacity > 0 ? Math.round((booked / slot.total_capacity) * 100) : 0;
                      const bar    = slot.remaining_capacity === 0
                        ? 'bg-destructive'
                        : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
                      return (
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
