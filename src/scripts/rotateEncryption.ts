// ═══════════════════════════════════════════════════════════
// 🔄 Encryption Rotation Script
// ═══════════════════════════════════════════════════════════
// Re-encrypts all stored tokens from old key versions to the
// current CURRENT_ENCRYPTION_VERSION.
//
// Usage:
//   DRY_RUN=true npx ts-node src/scripts/rotateEncryption.ts
//   npx ts-node src/scripts/rotateEncryption.ts
//
// Required env vars:
//   ENCRYPTION_KEYS='{"v1":"old_key","v2":"new_key"}'
//   CURRENT_ENCRYPTION_VERSION=v2
//   SUPABASE_SERVICE_ROLE_KEY=...
//   NEXT_PUBLIC_SUPABASE_URL=...
// ═══════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import { encryptTokenV2, decryptTokenV2, needsRotation } from '../lib/security/keyManager';

const DRY_RUN = process.env.DRY_RUN === 'true';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RotationResult {
  table: string;
  column: string;
  total: number;
  rotated: number;
  skipped: number;
  errors: number;
}

async function rotateColumn(
  table: string,
  idColumn: string,
  tokenColumn: string
): Promise<RotationResult> {
  const result: RotationResult = { table, column: tokenColumn, total: 0, rotated: 0, skipped: 0, errors: 0 };

  // Fetch all rows with an encrypted token
  const { data: rows, error } = await supabase
    .from(table)
    .select(`${idColumn}, ${tokenColumn}`)
    .not(tokenColumn, 'is', null);

  if (error) {
    console.error(`❌ Failed to fetch ${table}.${tokenColumn}:`, error.message);
    result.errors++;
    return result;
  }

  const typedRows = (rows ?? []) as unknown as Array<Record<string, unknown>>;
  result.total = typedRows.length;

  for (const row of typedRows) {
    const rawValue = row[tokenColumn] as string | null;
    if (!rawValue) { result.skipped++; continue; }
    if (!needsRotation(rawValue)) { result.skipped++; continue; }

    // Decrypt with old key, re-encrypt with new key
    const plaintext = decryptTokenV2(rawValue);
    if (!plaintext) {
      console.error(`❌ Could not decrypt row ${String(row[idColumn])} in ${table}.${tokenColumn}`);
      result.errors++;
      continue;
    }

    const reEncrypted = encryptTokenV2(plaintext);
    const rowId = row[idColumn];

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would rotate ${table}.${tokenColumn} for id=${String(rowId)}`);
      result.rotated++;
      continue;
    }

    const { error: updateError } = await supabase
      .from(table)
      .update({ [tokenColumn]: reEncrypted })
      .eq(idColumn, rowId as string);

    if (updateError) {
      console.error(`❌ Failed to update ${table} id=${String(rowId)}:`, updateError.message);
      result.errors++;
    } else {
      result.rotated++;
    }
  }

  return result;
}

async function main() {
  console.log(`\n🔄 Encryption Rotation ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'}`);
  console.log(`Target version: ${process.env.CURRENT_ENCRYPTION_VERSION ?? 'v1'}\n`);

  const targets: Array<{ table: string; idCol: string; tokenCol: string }> = [
    { table: 'tenants', idCol: 'id', tokenCol: 'wa_access_token' },
    { table: 'tenants', idCol: 'id', tokenCol: 'instagram_access_token' },
    { table: 'tenants', idCol: 'id', tokenCol: 'google_calendar_token' },
    { table: 'tenants', idCol: 'id', tokenCol: 'google_sheets_token' },
  ];

  let totalRotated = 0;
  let totalErrors = 0;

  for (const t of targets) {
    const result = await rotateColumn(t.table, t.idCol, t.tokenCol);
    console.log(`  ${t.table}.${t.tokenCol}: total=${result.total} rotated=${result.rotated} skipped=${result.skipped} errors=${result.errors}`);
    totalRotated += result.rotated;
    totalErrors += result.errors;
  }

  console.log(`\n✅ Rotation complete: ${totalRotated} tokens rotated, ${totalErrors} errors`);
  if (DRY_RUN) console.log('   (DRY RUN — no changes written to DB)');
  if (totalErrors > 0) process.exit(1);
}

main().catch(err => {
  console.error('❌ Rotation script failed:', err);
  process.exit(1);
});
