'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, LayoutGrid, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';
import type { ActionResult } from './use-tables-api';

interface CapRow { capacity: number; count: number }

const PRESETS: { label: string; rows: CapRow[] }[] = [
  { label: 'Café (8)', rows: [{ capacity: 2, count: 4 }, { capacity: 4, count: 4 }] },
  { label: 'Restaurant (24)', rows: [{ capacity: 2, count: 8 }, { capacity: 4, count: 12 }, { capacity: 6, count: 4 }] },
  { label: 'Fine dining (40)', rows: [{ capacity: 2, count: 14 }, { capacity: 4, count: 18 }, { capacity: 6, count: 6 }, { capacity: 8, count: 2 }] },
];

export function TableSetupFlow({ onGenerate }: { onGenerate: (payload: { count: number; mix: CapRow[] }) => Promise<ActionResult> }) {
  const [rows, setRows] = useState<CapRow[]>([{ capacity: 2, count: 6 }, { capacity: 4, count: 6 }]);
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(() => rows.reduce((sum, r) => sum + Math.max(0, r.count), 0), [rows]);

  function setRow(i: number, patch: Partial<CapRow>) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function addRow() { setRows((prev) => [...prev, { capacity: 6, count: 2 }]); }
  function removeRow(i: number) { setRows((prev) => prev.filter((_, idx) => idx !== i)); }

  async function generate() {
    if (total < 1) { toast.error('Add at least one table.'); return; }
    if (total > 500) { toast.error('Max 500 tables.'); return; }
    setSubmitting(true);
    const res = await onGenerate({ count: total, mix: rows.filter((r) => r.count > 0 && r.capacity > 0) });
    setSubmitting(false);
    if (res.ok) toast.success(`${total} tables created`);
    else toast.error(res.error || 'Failed to create tables');
  }

  return (
    <div className="max-w-xl mx-auto py-12 sm:py-16">
      <div className="text-center mb-8">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-foreground flex items-center justify-center mb-5">
          <LayoutGrid className="h-7 w-7 text-background" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Set up your floor</h2>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
          How many tables does your restaurant have, and how many seats each? We&apos;ll create T1–T{total || 'n'} automatically.
        </p>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap justify-center gap-2 mb-6">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => setRows(p.rows.map((r) => ({ ...r })))}
            className="h-8 px-3 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            {p.label}
          </button>
        ))}
      </div>

      {/* Capacity mix editor */}
      <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 px-4 py-2.5 bg-muted/50 text-xs font-medium text-muted-foreground">
          <span>Seats per table</span><span>How many tables</span><span className="w-8" />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-3 px-4 py-3 items-center">
            <Stepper value={r.capacity} min={1} max={30} onChange={(v) => setRow(i, { capacity: v })} suffix="seats" />
            <Stepper value={r.count} min={0} max={300} onChange={(v) => setRow(i, { count: v })} suffix="tables" />
            <button onClick={() => removeRow(i)} disabled={rows.length <= 1}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30 transition-colors cursor-pointer flex items-center justify-center">
              <Minus className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button onClick={addRow} className="w-full px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer flex items-center justify-center gap-1.5">
          <Plus className="h-4 w-4" /> Add another size
        </button>
      </div>

      <div className="flex items-center justify-between mt-6">
        <p className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{total} tables</span></p>
        <Button onClick={generate} disabled={submitting || total < 1} className="h-11 px-6 rounded-xl gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutGrid className="h-4 w-4" />}
          Create {total > 0 ? total : ''} tables
        </Button>
      </div>
    </div>
  );
}

function Stepper({ value, onChange, min, max, suffix }: { value: number; onChange: (n: number) => void; min: number; max: number; suffix: string }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onChange(clamp(value - 1))} className="h-8 w-8 rounded-lg border border-border text-foreground hover:bg-muted transition-colors cursor-pointer flex items-center justify-center"><Minus className="h-3.5 w-3.5" /></button>
      <div className="h-8 grow min-w-[3.5rem] rounded-lg bg-muted flex items-center justify-center gap-1 text-sm font-medium tabular-nums">
        {value}<span className="text-[10px] text-muted-foreground">{suffix}</span>
      </div>
      <button onClick={() => onChange(clamp(value + 1))} className="h-8 w-8 rounded-lg border border-border text-foreground hover:bg-muted transition-colors cursor-pointer flex items-center justify-center"><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}
