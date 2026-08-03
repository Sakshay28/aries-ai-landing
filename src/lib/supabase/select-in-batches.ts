// ═══════════════════════════════════════════════════════════════════════════
// Batched `.in(...)` fetch — guards against PostgREST's URL-length limit.
//
// A single `.in('id', ids)` with more than ~300 UUIDs produces an HTTP 400
// ("Bad Request"): the `id=in.(uuid,uuid,…)` filter is encoded in the request
// URL and overflows the server's URL length cap. supabase-js returns
// `{ data: null, error }`, and callers that do `(data ?? [])` silently proceed
// with an EMPTY result — which is exactly how the live-chat inbox lost every
// lead's `assigned_to` for large tenants (see 2026-07-27 "Assigned to me" RCA:
// globesome had 999 ids → 400 → all conversations enriched with assigned_to=null
// → "Assigned to me" empty for everyone).
//
// This splits the id list into safe chunks and — critically — THROWS on any
// batch error instead of returning partial/empty data, so a failure surfaces
// loudly to the caller rather than masquerading as "nothing assigned".
// ═══════════════════════════════════════════════════════════════════════════

// 200 keeps the encoded filter well under the observed ~300–400 id failure
// threshold (36-char UUID × 200 ≈ 7.4 KB URL) with comfortable margin.
export const DEFAULT_IN_BATCH_SIZE = 200;

interface BatchResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Fetch rows for a large id list by chunking the `.in(...)` filter.
 *
 * @param ids        the full list of ids to look up (deduped by the caller if desired)
 * @param fetchBatch runs one `.in(...)` query for a chunk and returns supabase-js's
 *                   `{ data, error }` shape. Typed as PromiseLike so a Supabase
 *                   query builder (a thenable, not a real Promise) can be returned
 *                   directly without an extra `.then`.
 * @param batchSize  max ids per query (default 200)
 * @returns          all matched rows concatenated
 * @throws           if ANY batch returns an error (never returns partial data silently)
 */
export async function selectInBatches<T>(
  ids: string[],
  fetchBatch: (batch: string[]) => PromiseLike<BatchResult<T>>,
  batchSize: number = DEFAULT_IN_BATCH_SIZE,
): Promise<T[]> {
  if (batchSize < 1) throw new Error('selectInBatches: batchSize must be >= 1');
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    if (batch.length === 0) continue;
    const { data, error } = await fetchBatch(batch);
    if (error) {
      throw new Error(
        `selectInBatches: batch ${i}–${i + batch.length} of ${ids.length} failed: ${error.message}`,
      );
    }
    if (data) out.push(...data);
  }
  return out;
}

/**
 * The UPDATE/DELETE counterpart of {@link selectInBatches}. `UPDATE … .in('id', ids)`
 * and `DELETE … .in('id', ids)` hit the exact same URL-length 400 for large id
 * lists, so a bulk write silently no-ops. This runs the write one safe chunk at a
 * time and THROWS on any batch error (the write must never partially/​silently fail).
 *
 * @param ids      the full list of ids to operate on
 * @param runBatch runs one `.in(...)` write for a chunk; returns supabase-js's `{ error }`
 * @param batchSize max ids per statement (default 200)
 * @throws         if ANY batch returns an error
 */
export async function runInBatches(
  ids: string[],
  runBatch: (batch: string[]) => PromiseLike<{ error: { message: string } | null }>,
  batchSize: number = DEFAULT_IN_BATCH_SIZE,
): Promise<void> {
  if (batchSize < 1) throw new Error('runInBatches: batchSize must be >= 1');
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    if (batch.length === 0) continue;
    const { error } = await runBatch(batch);
    if (error) {
      throw new Error(
        `runInBatches: batch ${i}–${i + batch.length} of ${ids.length} failed: ${error.message}`,
      );
    }
  }
}
