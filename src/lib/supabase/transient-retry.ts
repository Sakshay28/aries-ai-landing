// ═══════════════════════════════════════════════════════════════════════════
// One retry for database errors that a second attempt can fix.
//
// Production Supabase is a free-plan Nano instance. It occasionally stalls for a
// few seconds, and a query that normally takes ~100 ms dies with Postgres 57014
// ("canceling statement due to statement timeout") or a dropped connection. On
// 2026-11-21 one such stall blanked Adventure Island's whole inbox ("Couldn't
// load conversations") right after the owner signed in. The next identical
// query ran in 0.3 s.
//
// Only READ queries should go through this. Retrying a write that may already
// have committed could apply it twice.
// ═══════════════════════════════════════════════════════════════════════════

export type DbErrorLike = { code?: string | null; message?: string | null } | null | undefined;

// Postgres SQLSTATEs and PostgREST codes that mean "the database was briefly
// unreachable or too slow", never "your query is wrong".
const TRANSIENT_CODES = new Set([
  '57014', // query_canceled (statement timeout)
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  'PGRST000', // could not connect with the database
  'PGRST001', // could not connect, internal error
  'PGRST002', // could not connect while building the schema cache
  'PGRST003', // timed out acquiring a connection from the pool
]);

// supabase-js reports network-level failures (fetch threw, gateway 5xx with an
// HTML body) as an error with an empty code and one of these messages.
const TRANSIENT_MESSAGE = /fetch failed|network ?error|\btimed out\b|\btimeout\b|econnreset|econnrefused|etimedout|socket hang up|bad gateway|service unavailable|gateway time-?out/i;

export function isTransientDbError(err: DbErrorLike): boolean {
  if (!err) return false;
  const code = err.code ?? '';
  if (TRANSIENT_CODES.has(code) || code.startsWith('08')) return true; // 08xxx = connection_exception
  return TRANSIENT_MESSAGE.test(err.message ?? '');
}

/**
 * Run a read query; if it fails with a transient error, wait briefly and run it
 * once more. Returns the second result as-is (error included) so callers keep
 * their existing error handling.
 */
export async function withTransientRetry<T extends { error: DbErrorLike }>(
  run: () => PromiseLike<T>,
  delayMs = 400,
): Promise<T> {
  const first = await run();
  if (!isTransientDbError(first.error)) return first;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return run();
}

// Errors where Postgres guarantees the statement did NOT commit: it was
// cancelled or rolled back, or it never got a connection. A write that failed
// this way can be sent again without risk of applying it twice. Dropped
// connections and network errors are deliberately absent — the write may have
// committed before the reply was lost.
const UNCOMMITTED_WRITE_CODES = new Set([
  '57014', // query_canceled (statement timeout) — transaction rolled back
  '40001', // serialization_failure — rolled back
  '40P01', // deadlock_detected — rolled back
  '53300', // too_many_connections — never ran
  '57P03', // cannot_connect_now — never ran
  'PGRST003', // timed out acquiring a pool connection — never ran
]);

export function isUncommittedWriteError(err: DbErrorLike): boolean {
  return !!err && UNCOMMITTED_WRITE_CODES.has(err.code ?? '');
}

/**
 * Run a write; if Postgres says it definitely did not commit (statement
 * timeout, deadlock, no connection), run it once more. Never retries an
 * ambiguous failure, so a write is never applied twice.
 *
 * 2026-11-23: a free-plan stall cancelled an inbox send's INSERT (57014) and
 * the operator had to retype the message.
 */
export async function withUncommittedWriteRetry<T extends { error: DbErrorLike }>(
  run: () => PromiseLike<T>,
  delayMs = 400,
): Promise<T> {
  const first = await run();
  if (!isUncommittedWriteError(first.error)) return first;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return run();
}
