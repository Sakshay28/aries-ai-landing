import { describe, it, expect, vi } from 'vitest';
import { selectInBatches, DEFAULT_IN_BATCH_SIZE } from '../src/lib/supabase/select-in-batches';

const rows = (batch: string[]) => batch.map((id) => ({ id, assigned_to: `agent-${id}` }));

describe('selectInBatches', () => {
  it('returns [] and never queries for an empty id list', async () => {
    const fetchBatch = vi.fn();
    expect(await selectInBatches([], fetchBatch)).toEqual([]);
    expect(fetchBatch).not.toHaveBeenCalled();
  });

  it('chunks the id list and concatenates all rows', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id${i}`);
    const calls: number[] = [];
    const out = await selectInBatches(
      ids,
      async (batch) => { calls.push(batch.length); return { data: rows(batch), error: null }; },
      200,
    );
    expect(calls).toEqual([200, 200, 50]); // 3 batches
    expect(out).toHaveLength(450);
    expect(out[0]).toEqual({ id: 'id0', assigned_to: 'agent-id0' });
  });

  it('REGRESSION: batching avoids the PostgREST URL-length 400 that nulled every assignment', async () => {
    // Mirror the real failure: a single .in() with >300 ids returns { data:null, error }.
    // 999 ids (globesome) previously produced 0 assignments; with batching it returns all 999.
    const ids = Array.from({ length: 999 }, (_, i) => `lead-${i}`);
    const fetchBatch = async (batch: string[]) =>
      batch.length > 300
        ? { data: null, error: { message: 'Bad Request' } }
        : { data: rows(batch), error: null };

    const out = await selectInBatches(ids, fetchBatch, DEFAULT_IN_BATCH_SIZE);
    expect(out).toHaveLength(999);
    expect(out.every((r) => r.assigned_to)).toBe(true);
  });

  it('THROWS on a batch error instead of silently returning partial data', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `id${i}`);
    let call = 0;
    const fetchBatch = async (batch: string[]) => {
      call++;
      return call === 2 ? { data: null, error: { message: 'network down' } } : { data: rows(batch), error: null };
    };
    // The old code did `(data ?? [])` and swallowed this — the whole point of the fix
    // is that a failure is loud, never a half-populated (and thus wrong) result.
    await expect(selectInBatches(ids, fetchBatch, 100)).rejects.toThrow(/network down/);
  });

  it('rejects a nonsensical batch size', async () => {
    await expect(selectInBatches(['a'], async () => ({ data: [], error: null }), 0)).rejects.toThrow(/batchSize/);
  });
});
