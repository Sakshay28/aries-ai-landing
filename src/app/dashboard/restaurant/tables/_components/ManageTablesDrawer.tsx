'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Trash2, Check, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { SidePanel } from './overlay';
import type { TableData, TableSettings, ActionResult } from './use-tables-api';

const INTERVALS = [15, 30, 60];

export function ManageTablesDrawer({
  tables, settings, onClose, onCreate, onUpdate, onDeactivate, onUpdateSettings,
}: {
  tables: TableData[];
  settings: TableSettings;
  onClose: () => void;
  onCreate: (name: string, capacity: number) => Promise<ActionResult>;
  onUpdate: (id: string, fields: { name?: string; capacity?: number }) => Promise<ActionResult>;
  onDeactivate: (id: string) => Promise<ActionResult>;
  onUpdateSettings: (fields: { open_time?: string; close_time?: string; slot_interval?: number }) => Promise<ActionResult>;
}) {
  // Settings
  const [open, setOpen] = useState(toHHMM(settings.open_time));
  const [close, setClose] = useState(toHHMM(settings.close_time));
  const [interval, setIntervalVal] = useState(settings.slot_interval || 30);
  const [savingSettings, setSavingSettings] = useState(false);

  // New table
  const [newName, setNewName] = useState('');
  const [newCap, setNewCap] = useState(4);
  const [creating, setCreating] = useState(false);

  async function saveSettings() {
    setSavingSettings(true);
    const res = await onUpdateSettings({ open_time: open, close_time: close, slot_interval: interval });
    setSavingSettings(false);
    if (res.ok) toast.success('Hours updated'); else toast.error(res.error || 'Failed');
  }

  async function addTable() {
    if (!newName.trim()) { toast.error('Enter a table name'); return; }
    setCreating(true);
    const res = await onCreate(newName.trim(), newCap);
    setCreating(false);
    if (res.ok) { toast.success(`${newName.trim()} added`); setNewName(''); }
    else toast.error(res.error || 'Failed to add table');
  }

  return (
    <SidePanel onClose={onClose} title="Manage tables">
      <div className="space-y-7">
        {/* Operating hours */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Reservation hours
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-muted-foreground text-xs">Opens</span>
              <Input type="time" value={open} onChange={(e) => setOpen(e.target.value)} className="h-10 rounded-xl mt-1" />
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground text-xs">Closes</span>
              <Input type="time" value={close} onChange={(e) => setClose(e.target.value)} className="h-10 rounded-xl mt-1" />
            </label>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Slot interval</span>
            <div className="flex gap-2 mt-1">
              {INTERVALS.map((iv) => (
                <button key={iv} onClick={() => setIntervalVal(iv)}
                  className={`h-9 px-4 rounded-lg text-sm font-medium transition-colors cursor-pointer ${interval === iv ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                  {iv} min
                </button>
              ))}
            </div>
          </div>
          <Button onClick={saveSettings} disabled={savingSettings} variant="outline" className="h-9 rounded-xl gap-2">
            {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save hours
          </Button>
        </section>

        {/* Add table */}
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Add a table</h3>
          <div className="flex items-end gap-2">
            <label className="grow text-sm">
              <span className="text-muted-foreground text-xs">Name</span>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="T25" className="h-10 rounded-xl mt-1" />
            </label>
            <label className="w-24 text-sm">
              <span className="text-muted-foreground text-xs">Seats</span>
              <Input type="number" min={1} max={30} value={newCap} onChange={(e) => setNewCap(Math.max(1, Number(e.target.value) || 1))} className="h-10 rounded-xl mt-1" />
            </label>
            <Button onClick={addTable} disabled={creating} className="h-10 rounded-xl gap-1.5 shrink-0">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </Button>
          </div>
        </section>

        {/* Existing tables */}
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Tables ({tables.length})
          </h3>
          <div className="rounded-xl border border-border divide-y divide-border">
            {tables.map((t) => (
              <TableRow key={t.id} table={t} onUpdate={onUpdate} onDeactivate={onDeactivate} />
            ))}
            {tables.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No tables yet.</p>}
          </div>
        </section>
      </div>
    </SidePanel>
  );
}

function TableRow({
  table, onUpdate, onDeactivate,
}: {
  table: TableData;
  onUpdate: (id: string, fields: { name?: string; capacity?: number }) => Promise<ActionResult>;
  onDeactivate: (id: string) => Promise<ActionResult>;
}) {
  const [cap, setCap] = useState(table.capacity);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const dirty = cap !== table.capacity;

  async function save() {
    setBusy(true);
    const res = await onUpdate(table.id, { capacity: cap });
    setBusy(false);
    if (res.ok) toast.success(`${table.name} updated`); else { toast.error(res.error || 'Failed'); setCap(table.capacity); }
  }
  async function remove() {
    setBusy(true);
    const res = await onDeactivate(table.id);
    setBusy(false);
    if (res.ok) toast.success(`${table.name} removed`); else toast.error(res.error || 'Failed');
  }

  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <span className="font-medium text-sm text-foreground w-12">{table.name}</span>
      <div className="flex items-center gap-1.5">
        <button onClick={() => setCap((c) => Math.max(1, c - 1))} className="h-7 w-7 rounded-md border border-border text-foreground hover:bg-muted cursor-pointer">−</button>
        <span className="w-9 text-center text-sm tabular-nums">{cap}</span>
        <button onClick={() => setCap((c) => Math.min(30, c + 1))} className="h-7 w-7 rounded-md border border-border text-foreground hover:bg-muted cursor-pointer">+</button>
        <span className="text-xs text-muted-foreground ml-0.5">seats</span>
      </div>
      <div className="grow" />
      {dirty && (
        <button onClick={save} disabled={busy} className="h-7 px-2.5 rounded-md bg-foreground text-background text-xs font-medium cursor-pointer disabled:opacity-50">
          {busy ? '…' : 'Save'}
        </button>
      )}
      {confirmDel ? (
        <div className="flex items-center gap-1">
          <button onClick={remove} disabled={busy} className="h-7 px-2 rounded-md bg-rose-600 text-white text-xs font-medium cursor-pointer">Remove</button>
          <button onClick={() => setConfirmDel(false)} className="h-7 px-2 rounded-md bg-muted text-foreground text-xs cursor-pointer">No</button>
        </div>
      ) : (
        <button onClick={() => setConfirmDel(true)} className="h-7 w-7 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer flex items-center justify-center">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function toHHMM(t: string): string {
  const m = String(t).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '11:00';
}
