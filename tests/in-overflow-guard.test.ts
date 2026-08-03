import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ═══════════════════════════════════════════════════════════════════════════
// Reintroduction ratchet for the 2026-07-27 "Assigned to me" class of bug.
//
// A single `.in('<col>', <list>)` with more than ~300 values 400s in PostgREST
// (the id=in.(…) filter overflows the request URL). The error is easy to swallow,
// silently returning an empty/partial result — which broke the live-chat inbox
// for every large tenant.
//
// This test scans the codebase for `.in('<hot column>', <someVariable>)` and
// FAILS on any occurrence that is not either:
//   • batched (the argument is `batch`/`chunk`/`slice`), or
//   • on the ALLOWLIST below (a site verified to be inherently bounded).
//
// If you add a new `.in()` on a hot column with a growable list, route it through
// selectInBatches / runInBatches (src/lib/supabase/select-in-batches.ts). Only add
// to ALLOWLIST when you have PROVEN the list is small (a fixed enum, a claim batch,
// an upstream .limit(≤200), a handful of tenants/dupes, etc.) — and say why.
// ═══════════════════════════════════════════════════════════════════════════

const HOT_COLUMNS = [
  'id', 'lead_id', 'conversation_id', 'phone', 'sender_id',
  'customer_phone', 'campaign_id', 'automation_id', 'tenant_id', 'wa_message_id',
];
const BATCHED_ARGS = new Set(['batch', 'chunk', 'slice']);

// key = "<repo-relative path>::<argument identifier>"  →  reason it is bounded.
const ALLOWLIST: Record<string, string> = {
  'src/app/api/admin/provision/route.ts::ids': 'admin acting on a handful of tenant ids',
  'src/app/api/admin/approvals/route.ts::ids': 'admin acting on a handful of tenant ids',
  'src/app/api/dashboard/conversations/route.ts::convIds': 'bounded by .limit(Math.min(limit,50))',
  'src/app/api/dashboard/automations/bulk/route.ts::targetIds': 'automations per tenant are few (bulk selection)',
  'src/app/api/dashboard/automations/bulk/route.ts::affectedIds': 'automations per tenant are few',
  'src/app/api/dashboard/notifications/route.ts::ids': 'notification ids from one page/selection',
  'src/app/api/data-deletion/route.ts::tenantIds': 'deletes a specific tenant (usually one)',
  'src/app/api/webhooks/whatsapp/route.ts::dupeIds': 'duplicate conversations for ONE contact — tiny',
  'src/app/api/cron/ai-scoring/route.ts::jobIds': 'bounded by BATCH_SIZE = 3',
  'src/lib/webhook/coexistence.ts::dupeIds': 'duplicate conversations for ONE contact — tiny',
  'src/lib/followup/engine.ts::ids': 'bounded by .limit(200) hard cap per call',
  'src/lib/followup/engine.ts::timedOutIds': 'bounded by .limit(200) hard cap per call',
  'src/lib/integrations/google-sheets-worker.ts::ids': 'bounded by the claim batch size',
  'src/lib/integrations/microsoft-excel-worker.ts::ids': 'bounded by the claim batch size',
  'src/lib/automations/engine.ts::claimedIds': 'bounded by CLAIM_BATCH = 15',
  'src/lib/automations/engine.ts::automationIds': 'bounded — active automations per tenant are few',
  'src/lib/broadcast/services/performance-intelligence.service.ts::campaignIds': 'a tenant has few campaigns',
  'src/lib/whatsapp/businessNotify.ts::idsToLock': 'ids for one notify pass — bounded',
  'src/lib/broadcast/services/broadcast-engine.service.ts::ids': 'bounded by the queue claim batch (processQueue default 100; callers pass 10–50)',
  'src/lib/broadcast/services/broadcast-engine.service.ts::remaining': 'subset of the claimed batch (≤ claim limit, 10–50 in practice)',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

describe('.in() overflow ratchet', () => {
  it('has no unbatched, un-allowlisted .in() on a hot column', () => {
    const root = process.cwd();
    const srcDir = join(root, 'src');
    const colAlt = HOT_COLUMNS.join('|');
    const re = new RegExp(`\\.in\\(\\s*'(${colAlt})'\\s*,\\s*([A-Za-z_$][\\w$]*)\\s*\\)`, 'g');

    const offenders: string[] = [];
    for (const file of walk(srcDir)) {
      const rel = relative(root, file);
      // The helper file and the test scripts are exempt by definition.
      if (rel.endsWith('src/lib/supabase/select-in-batches.ts') || rel.includes('/scripts/')) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      for (const rawLine of lines) {
        const line = rawLine.split('//')[0]; // strip line comments to avoid false hits
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(line))) {
          const arg = m[2];
          if (BATCHED_ARGS.has(arg)) continue;
          const key = `${rel}::${arg}`;
          if (ALLOWLIST[key]) continue;
          offenders.push(`${rel}  →  .in('${m[1]}', ${arg})`);
        }
      }
    }

    expect(
      offenders,
      offenders.length
        ? `\nUnbatched .in() on a hot column (route through selectInBatches/runInBatches, ` +
          `or add to ALLOWLIST with a proven-bounded reason):\n  ${offenders.join('\n  ')}\n`
        : '',
    ).toEqual([]);
  });
});
