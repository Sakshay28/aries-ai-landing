import { describe, it, expect } from 'vitest';
import { runInBatches, DEFAULT_IN_BATCH_SIZE } from '../src/lib/supabase/select-in-batches';

describe('runInBatches (UPDATE/DELETE counterpart)', () => {
  it('returns without running for an empty id list', async () => {
    let called = 0;
    await runInBatches([], async () => { called++; return { error: null }; });
    expect(called).toBe(0);
  });

  it('chunks the write and calls the runner once per batch', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id${i}`);
    const sizes: number[] = [];
    await runInBatches(ids, async (batch) => { sizes.push(batch.length); return { error: null }; }, 200);
    expect(sizes).toEqual([200, 200, 50]);
  });

  it('REGRESSION: batching keeps a large DELETE/UPDATE under the PostgREST 400 threshold', async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `m${i}`); // e.g. message-retention BATCH_SIZE
    let maxBatch = 0;
    await runInBatches(ids, async (batch) => {
      maxBatch = Math.max(maxBatch, batch.length);
      // Mirror PostgREST: a chunk >300 would 400. Batching must never send one.
      if (batch.length > 300) return { error: { message: 'Bad Request' } };
      return { error: null };
    }, DEFAULT_IN_BATCH_SIZE);
    expect(maxBatch).toBeLessThanOrEqual(DEFAULT_IN_BATCH_SIZE);
  });

  it('THROWS on a batch error — a bulk write must never partially/silently fail', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `id${i}`);
    let call = 0;
    await expect(
      runInBatches(ids, async () => { call++; return call === 2 ? { error: { message: 'deadlock' } } : { error: null }; }, 100),
    ).rejects.toThrow(/deadlock/);
  });

  it('rejects a nonsensical batch size', async () => {
    await expect(runInBatches(['a'], async () => ({ error: null }), 0)).rejects.toThrow(/batchSize/);
  });
});
