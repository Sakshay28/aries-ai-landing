/**
 * Detects Postgres / PostgREST errors that mean a deployed code path references a
 * column or table the live database does not have yet — i.e. a migration that
 * shipped with the code was never applied to prod.
 *
 * These otherwise surface as opaque 500s. Concretely: a deploy started writing
 * `broadcast_campaigns.header_media_url` on every campaign save, but the matching
 * migration never ran, so PostgREST returned PGRST204 and every Save/Launch died
 * with a raw 500 and no hint that the fix was "apply the pending migration."
 * Catch it and return an actionable message instead.
 */
export interface PendingMigrationInfo {
  isPending: boolean;
  /** The missing column/table identifier, when we can extract it from the error. */
  missing?: string;
}

interface DbLikeError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function detectPendingMigration(err: unknown): PendingMigrationInfo {
  if (!err || typeof err !== 'object') return { isPending: false };
  const e = err as DbLikeError;
  const code = e.code || '';
  const blob = `${e.message || ''} ${e.details || ''} ${e.hint || ''}`;

  // PostgREST: PGRST204 = target column not found in the schema cache (the classic
  // "added a column in code but not in the DB" signal). PGRST205 = table not found.
  // Postgres SQLSTATEs: 42703 undefined_column, 42P01 undefined_table,
  // 42704 undefined_object.
  const codeHit =
    code === 'PGRST204' || code === 'PGRST205' ||
    code === '42703' || code === '42P01' || code === '42704';

  const msgHit =
    /column .* does not exist/i.test(blob) ||
    /could not find the .* column/i.test(blob) ||
    /relation .* does not exist/i.test(blob) ||
    /find the table .* in the schema cache/i.test(blob);

  if (!codeHit && !msgHit) return { isPending: false };

  // Best-effort extraction of the missing identifier for the operator alert.
  const m =
    blob.match(/column "?([\w.]+)"? does not exist/i) ||
    blob.match(/find the '([\w.]+)' column/i) ||
    blob.match(/relation "?([\w.]+)"? does not exist/i) ||
    blob.match(/table '([\w.]+)'/i);

  return { isPending: true, missing: m?.[1] };
}

/** Short user-facing message — never leaks raw SQL, frames it as our setup step. */
export function pendingMigrationUserMessage(info: PendingMigrationInfo): string {
  return `This feature needs a pending database update that hasn't been applied yet${
    info.missing ? ` (missing: ${info.missing})` : ''
  }. It's a setup step on our side, not a problem with your campaign — please retry shortly, and if it persists, contact support.`;
}

/** Operator-facing alert summary for notifyAdmin. */
export function pendingMigrationAdminSummary(info: PendingMigrationInfo, where: string): string {
  return `A ${where} request failed because the live database is missing ${
    info.missing ? `\`${info.missing}\`` : 'a column/table'
  } — a migration was deployed in code but never applied to prod. Run the pending migration in Supabase to restore this flow.`;
}
