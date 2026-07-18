// ═══════════════════════════════════════════════════════════════════════════
// 🔥 ADVERSARIAL / FAULT-INJECTION TESTS — broadcast reliability
// ═══════════════════════════════════════════════════════════════════════════
// These tests do not re-read the code and assert it "looks correct" — they
// drive the REAL production functions (BroadcastEngineService, the webhook
// route's status-update logic) through an in-memory Postgres-shaped mock and
// inject the exact failure modes a production audit is required to prove are
// handled: DB errors, Meta rate limits, invalid tokens, worker crashes,
// concurrent launches, out-of-order/duplicate webhooks, and cancellation
// racing an in-flight send.
//
// Run: npx vitest run tests/broadcast-adversarial.test.ts
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';
import { AudienceEngineService } from '@/lib/broadcast/services/audience-engine.service';
import { MetaApiError } from '@/lib/meta/service';
import * as metaService from '@/lib/meta/service';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('@/lib/utils/crypto', () => ({
  decryptToken: vi.fn(() => 'EAAFAKETOKENFORTESTS1234567890ABCDEF'),
}));
vi.mock('@/lib/meta/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/meta/service')>();
  return { ...actual, sendTemplateMessage: vi.fn(), verifySignature: vi.fn(() => true) };
});
vi.mock('@/lib/broadcast/services/automation-engine.service', () => ({
  AutomationEngineService: { triggerRule: vi.fn(() => Promise.resolve(false)) },
}));

// ── In-memory, Postgres-shaped mock ─────────────────────────────────────────
// A small query builder that supports the subset of the Supabase JS API the
// broadcast engine actually uses, backed by plain in-memory arrays so state
// (e.g. a queue item's status) is genuinely mutated across calls — this is
// what lets a test simulate "run the drain cycle 25 times" and observe the
// row's real end state, not a canned response.
type Row = Record<string, any>;

class Table {
  rows: Row[] = [];
  constructor(rows: Row[] = []) { this.rows = rows; }
}

function buildDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables = new Map<string, Table>();
  const get = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Table(seed[name] ?? []));
    return tables.get(name)!;
  };
  for (const k of Object.keys(seed)) get(k);
  return { tables, get };
}

function matches(row: Row, filters: Array<[string, string, any]>): boolean {
  return filters.every(([col, op, val]) => {
    const v = row[col];
    switch (op) {
      case 'eq': return v === val;
      case 'neq': return v !== val;
      case 'in': return (val as any[]).includes(v);
      case 'gte': return v >= val;
      case 'lte': return v <= val;
      case 'gt': return v > val;
      case 'lt': return v < val;
      case 'is': return val === null ? (v === null || v === undefined) : v === val;
      case 'not_is': return !(val === null ? (v === null || v === undefined) : v === val);
      default: return true;
    }
  });
}

function makeChain(db: ReturnType<typeof buildDb>, tableName: string) {
  const table = db.get(tableName);
  const filters: Array<[string, string, any]> = [];
  let op: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select';
  let payload: any = null;
  let upsertOpts: any = null;
  let selectCols: string | null = null;
  let countMode = false;
  let orderCol: string | null = null;
  let orderAsc = true;
  let limitN: number | null = null;

  const chain: any = {};
  chain.select = (cols?: string, opts?: any) => { selectCols = cols || '*'; if (opts?.count) countMode = true; return chain; };
  chain.eq = (c: string, v: any) => { filters.push([c, 'eq', v]); return chain; };
  chain.neq = (c: string, v: any) => { filters.push([c, 'neq', v]); return chain; };
  chain.in = (c: string, v: any[]) => { filters.push([c, 'in', v]); return chain; };
  chain.gte = (c: string, v: any) => { filters.push([c, 'gte', v]); return chain; };
  chain.lte = (c: string, v: any) => { filters.push([c, 'lte', v]); return chain; };
  chain.gt = (c: string, v: any) => { filters.push([c, 'gt', v]); return chain; };
  chain.lt = (c: string, v: any) => { filters.push([c, 'lt', v]); return chain; };
  chain.is = (c: string, v: any) => { filters.push([c, 'is', v]); return chain; };
  chain.not = (c: string, _op: string, v: any) => { filters.push([c, 'not_is', v]); return chain; };
  chain.or = () => chain; // not exercised by these tests
  chain.order = (c: string, opts?: any) => { orderCol = c; orderAsc = opts?.ascending !== false; return chain; };
  chain.limit = (n: number) => { limitN = n; return chain; };
  chain.update = (p: any) => { op = 'update'; payload = p; return chain; };
  chain.insert = (p: any) => { op = 'insert'; payload = p; return chain; };
  chain.upsert = (p: any, opts?: any) => { op = 'upsert'; payload = p; upsertOpts = opts; return chain; };
  chain.delete = () => { op = 'delete'; return chain; };

  function applyFiltersToTable(): Row[] {
    return table.rows.filter((r) => matches(r, filters));
  }

  function execute(): { data: any; error: any; count?: number } {
    if (op === 'update') {
      const targets = applyFiltersToTable();
      targets.forEach((r) => Object.assign(r, payload));
      return { data: targets, error: null };
    }
    if (op === 'insert') {
      const arr = Array.isArray(payload) ? payload : [payload];
      arr.forEach((p) => table.rows.push({ id: p.id ?? `row-${table.rows.length}-${Math.random().toString(36).slice(2)}`, ...p }));
      return { data: arr, error: null };
    }
    if (op === 'upsert') {
      const arr = Array.isArray(payload) ? payload : [payload];
      // Prefer the real conflict-key columns the caller specified (Supabase's
      // actual onConflict option) over guessing — guessing by field presence
      // previously collapsed composite keys like 'campaign_id,contact_id'
      // (every row in a launch shares campaign_id) down to a single row.
      const conflictCols = upsertOpts?.onConflict
        ? String(upsertOpts.onConflict).split(',').map((s: string) => s.trim())
        : (arr.length && 'message_id' in arr[0] ? ['message_id'] : (arr.length && 'campaign_id' in arr[0] ? ['campaign_id'] : ['id']));
      const keyOf = (r: Row) => conflictCols.map((c: string) => r[c]).join('\u0000');
      arr.forEach((p) => {
        const pKey = keyOf(p);
        const existing = table.rows.find((r) => keyOf(r) === pKey);
        if (existing) {
          if (!upsertOpts?.ignoreDuplicates) Object.assign(existing, p);
          // ignoreDuplicates: true -> leave the existing row untouched
        } else {
          table.rows.push({ id: p.id ?? `row-${table.rows.length}-${Math.random().toString(36).slice(2)}`, ...p });
        }
      });
      return { data: arr, error: null };
    }
    if (op === 'delete') {
      const targets = applyFiltersToTable();
      table.rows = table.rows.filter((r) => !targets.includes(r));
      return { data: targets, error: null };
    }
    // select
    let result = applyFiltersToTable();
    if (orderCol) {
      const col = orderCol;
      result = [...result].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (orderAsc ? 1 : -1));
    }
    if (limitN != null) result = result.slice(0, limitN);
    if (countMode) return { data: null, error: null, count: result.length };
    return { data: result, error: null };
  }

  chain.single = () => {
    const { data, error } = execute();
    const arr = data as Row[];
    if (!arr || arr.length === 0) return Promise.resolve({ data: null, error: error || { message: 'no rows' } });
    return Promise.resolve({ data: arr[0], error: null });
  };
  chain.maybeSingle = () => {
    const { data, error } = execute();
    const arr = data as Row[];
    return Promise.resolve({ data: arr && arr.length ? arr[0] : null, error });
  };
  chain.then = (resolve: any, reject?: any) => {
    try {
      const r = execute();
      return Promise.resolve(resolve(r));
    } catch (e) {
      return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
    }
  };
  return chain;
}

interface RpcHandlers { [name: string]: (args: any) => any; }

function installDb(seed: Partial<Record<string, Row[]>>, rpcHandlers: RpcHandlers = {}, tableErrors: Record<string, string> = {}) {
  const db = buildDb(seed);
  vi.spyOn(supabaseAdmin, 'from').mockImplementation((tableName: string): any => {
    if (tableErrors[tableName]) {
      // Simulate a DB-outage-shaped failure: every operation on this table
      // resolves with a real Postgres-style {data:null, error} — the same
      // shape a genuine outage produces (Supabase-js does not throw for
      // query-level failures).
      const errChain: any = {};
      const self = () => errChain;
      for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'gt', 'lt', 'is', 'not', 'or', 'order', 'limit', 'update', 'insert', 'upsert', 'delete']) {
        errChain[m] = self;
      }
      const err = { message: tableErrors[tableName], code: 'PGRST_TEST_INJECTED' };
      errChain.single = () => Promise.resolve({ data: null, error: err });
      errChain.maybeSingle = () => Promise.resolve({ data: null, error: err });
      errChain.then = (resolve: any) => Promise.resolve(resolve({ data: null, error: err, count: null }));
      return errChain;
    }
    return makeChain(db, tableName);
  });
  vi.spyOn(supabaseAdmin, 'rpc').mockImplementation(((name: string, args: any) => {
    if (rpcHandlers[name]) return Promise.resolve({ data: rpcHandlers[name](args), error: null });
    return Promise.resolve({ data: null, error: null });
  }) as any);
  return db;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

// ── Shared fixtures ──────────────────────────────────────────────────────────
const TENANT_ID = 'tenant-1';
const CAMPAIGN_ID = 'campaign-1';

function baseSeed(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    tenants: [{ id: TENANT_ID, wa_access_token: 'enc:v1:x:y:z', wa_phone_number_id: 'PN1', timezone: 'Asia/Kolkata', wa_messaging_tier: 'TIER_10K', wa_daily_conversation_cap: null }],
    broadcast_optouts: [],
    broadcast_campaigns: [{ id: CAMPAIGN_ID, tenant_id: TENANT_ID, status: 'sending', template_name: 'order_update', template_language: 'en', updated_at: new Date().toISOString(), auto_resumed: false }],
    broadcast_delivery_settings: [],
    broadcast_variable_mapping: [],
    broadcast_templates_cache: [],
    broadcast_contact_sends: [],
    broadcast_deliveries: [],
    dead_letter_queue: [],
    broadcast_execution_events: [],
    ...overrides,
  };
}

function queueItem(overrides: Partial<Row> = {}): Row {
  return {
    id: 'q-1',
    tenant_id: TENANT_ID,
    campaign_id: CAMPAIGN_ID,
    contact_id: 'lead-1',
    phone: '919999999999',
    status: 'processing',
    attempt_count: 0,
    next_attempt_at: new Date().toISOString(),
    language_code: 'en',
    payload: { name: 'Test User' },
    locked_at: new Date().toISOString(),
    ...overrides,
  };
}

// Call the private static method the way the real worker/cron does.
async function runBatch(items: Row[], db: ReturnType<typeof buildDb>) {
  return (BroadcastEngineService as any).processItemsForTenant(TENANT_ID, items, {});
}

describe('ADVERSARIAL — poison recipient / unbounded retry (Finding 5)', () => {
  it('a recipient that ALWAYS gets Meta-rate-limited eventually reaches a terminal state, not infinite retry', async () => {
    (metaService.sendTemplateMessage as any).mockRejectedValue(
      new MetaApiError('rate limited', 429, { code: 130429 })
    );

    const seed = baseSeed({ broadcast_queue: [queueItem()] });
    const db = installDb(seed);

    // Simulate the drain running this exact item's retry cycle repeatedly —
    // exactly what happens in production as next_attempt_at comes due again
    // and again for a persistently-throttled recipient.
    for (let cycle = 0; cycle < 30; cycle++) {
      const row = db.get('broadcast_queue').rows[0];
      if (row.status === 'failed' || row.status === 'cancelled') break;
      row.status = 'processing'; // simulate the claim RPC re-claiming it
      await runBatch([{ ...row }], db);
    }

    const finalRow = db.get('broadcast_queue').rows[0];
    expect(finalRow.status).toBe('failed'); // NOT stuck in 'retrying' forever
    expect(finalRow.attempt_count).toBeGreaterThan(0);
    expect(finalRow.attempt_count).toBeLessThanOrEqual(21); // MAX_THROTTLE_ATTEMPTS + 1

    const dlq = db.get('dead_letter_queue').rows;
    expect(dlq.length).toBe(1); // permanent failure recorded for recovery/audit
  });

  it('a poison item does NOT block a healthy sibling item in the same campaign from completing', async () => {
    let callCount = 0;
    (metaService.sendTemplateMessage as any).mockImplementation(async (_t: any, _p: any, to: string) => {
      callCount++;
      if (to === '919999999999') throw new MetaApiError('rate limited', 429, { code: 130429 });
      return { messageId: `wamid.${to}.${callCount}`, status: 'sent' };
    });

    const seed = baseSeed({
      broadcast_queue: [
        queueItem({ id: 'poison', phone: '919999999999' }),
        queueItem({ id: 'healthy', phone: '918888888888' }),
      ],
    });
    const db = installDb(seed);

    await runBatch(db.get('broadcast_queue').rows.map((r) => ({ ...r })), db);

    const healthy = db.get('broadcast_queue').rows.find((r) => r.id === 'healthy')!;
    const poison = db.get('broadcast_queue').rows.find((r) => r.id === 'poison')!;
    expect(healthy.status).toBe('sent');
    expect(poison.status).toBe('retrying'); // deferred, not blocking the sibling
  });
});

describe('ADVERSARIAL — invalid / expired Meta token', () => {
  it('a permanent 401 is retried with bounded backoff, then fails to DLQ — never infinite', async () => {
    (metaService.sendTemplateMessage as any).mockRejectedValue(
      new MetaApiError('Meta Cloud API template error 401: invalid token', 401)
    );
    const seed = baseSeed({ broadcast_queue: [queueItem()] });
    const db = installDb(seed);

    for (let cycle = 0; cycle < 10; cycle++) {
      const row = db.get('broadcast_queue').rows[0];
      if (row.status === 'failed') break;
      row.status = 'processing';
      await runBatch([{ ...row }], db);
    }

    const finalRow = db.get('broadcast_queue').rows[0];
    expect(finalRow.status).toBe('failed');
    expect(finalRow.attempt_count).toBe(6); // 5 backoff stages then permanent fail
    expect(db.get('dead_letter_queue').rows.length).toBe(1);
  });

  it('missing WhatsApp credentials fails fast and notifies — does not silently drop the batch', async () => {
    const seed = baseSeed({
      tenants: [{ id: TENANT_ID, wa_access_token: null, wa_phone_number_id: null, timezone: 'Asia/Kolkata' }],
      broadcast_queue: [queueItem()],
    });
    const db = installDb(seed);

    const processed = await runBatch(db.get('broadcast_queue').rows.map((r) => ({ ...r })), db);
    expect(processed).toBe(0); // this specific code path returns 0 (not counted as "processed")
    const row = db.get('broadcast_queue').rows[0];
    expect(row.status).toBe('failed');
    expect(row.failure_reason).toMatch(/credentials/i);
  });
});

describe('ADVERSARIAL — database outage during audience resolution (Finding 4)', () => {
  it('a thrown error during resolveAudience does NOT complete the campaign at 0 recipients', async () => {
    // AudienceEngineService.resolveAudience for type 'all' calls fetchLeadsByFilter,
    // which reads the `leads` table — simulate that table being down.
    installDb(baseSeed(), {}, { leads: 'simulated outage' });

    await expect(
      AudienceEngineService.resolveAudience(TENANT_ID, {
        type: 'all', tags: [], customFilters: [], retargetCampaignId: null,
        retargetCondition: 'unread', retargetDelayDays: 1, manualContactIds: [],
        excludedContactIds: [], csvFile: null,
      } as any)
    ).rejects.toBeTruthy(); // propagates — does NOT silently resolve to {total:0}
  });
});

describe('ADVERSARIAL — concurrent launch requests (Finding 6)', () => {
  it('CAS predicate correctly rejects a second claim once the first has committed', async () => {
    // NOTE ON METHODOLOGY: a real Postgres CAS race is arbitrated by the
    // database's row-level locking — whichever `UPDATE ... WHERE status='draft'`
    // commits first wins, and the loser's WHERE clause matches zero rows
    // because it evaluates AFTER the winner's write is visible. That
    // serialization comes from real transactional I/O, which a synchronous
    // in-process mock cannot faithfully reproduce by racing two `Promise.all`
    // calls — doing so would be asserting something about this mock's
    // microtask scheduling, not about the database. What CAN be verified here,
    // deterministically, is the actual safety mechanism itself: that the CAS
    // predicate (`WHERE status = 'draft'`) correctly becomes a no-op once the
    // row has already moved to 'launching' — which is exactly what makes the
    // real race safe regardless of arrival order. So: run the first call to
    // completion (modeling "call A's transaction won"), then run the second
    // against that now-committed state (modeling "call B's transaction lost").
    const seed = baseSeed({
      broadcast_campaigns: [{ id: CAMPAIGN_ID, tenant_id: TENANT_ID, status: 'draft', template_name: 'order_update', template_language: 'en' }],
      broadcast_audiences: [{ campaign_id: CAMPAIGN_ID, audience_type: 'manual', tag_ids: [], filters: { manualContactIds: ['lead-1'] } }],
      broadcast_templates_cache: [{ tenant_id: TENANT_ID, name: 'order_update', status: 'APPROVED', template_json: {} }],
      leads: [{ id: 'lead-1', tenant_id: TENANT_ID, name: 'Test User', phone: '919999999999', tags: [], channel: 'whatsapp', last_message_at: new Date().toISOString() }],
    } as any);
    const db = installDb(seed);

    const r1 = await BroadcastEngineService.launchCampaign(TENANT_ID, CAMPAIGN_ID);
    const r2 = await BroadcastEngineService.launchCampaign(TENANT_ID, CAMPAIGN_ID);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(false);
    expect(r2.error).toMatch(/already in progress|already "/i);

    // Only ONE set of queue rows exists — the second call's audience
    // resolution never even ran (it was rejected before reaching that step).
    const queueRows = db.get('broadcast_queue').rows.filter((r) => r.campaign_id === CAMPAIGN_ID);
    expect(queueRows.length).toBe(1);
  });

  it('sanity check: the CAS predicate genuinely depends on current DB state, not a cached read (proves the mock is not just returning canned answers)', async () => {
    const seed = baseSeed({
      broadcast_campaigns: [{ id: CAMPAIGN_ID, tenant_id: TENANT_ID, status: 'draft', template_name: 'order_update', template_language: 'en' }],
      broadcast_audiences: [{ campaign_id: CAMPAIGN_ID, audience_type: 'manual', tag_ids: [], filters: { manualContactIds: ['lead-1'] } }],
      broadcast_templates_cache: [{ tenant_id: TENANT_ID, name: 'order_update', status: 'APPROVED', template_json: {} }],
      leads: [{ id: 'lead-1', tenant_id: TENANT_ID, name: 'Test User', phone: '919999999999', tags: [], channel: 'whatsapp', last_message_at: new Date().toISOString() }],
    } as any);
    const db = installDb(seed);

    // Manually revert status back to 'draft' after the first launch (as if an
    // admin reset it) — a THIRD launch attempt must be allowed again, proving
    // the guard is a live status check, not a one-shot flag.
    await BroadcastEngineService.launchCampaign(TENANT_ID, CAMPAIGN_ID);
    db.get('broadcast_campaigns').rows.find((r: any) => r.id === CAMPAIGN_ID)!.status = 'draft';
    db.get('broadcast_queue').rows.length = 0;

    const r3 = await BroadcastEngineService.launchCampaign(TENANT_ID, CAMPAIGN_ID);
    expect(r3.success).toBe(true);
  });
});

describe('ADVERSARIAL — dead / never-synced template blocks launch server-side (Finding 7)', () => {
  it('a REJECTED template cannot be launched even via a direct API call', async () => {
    const seed = baseSeed({
      broadcast_campaigns: [{ id: CAMPAIGN_ID, tenant_id: TENANT_ID, status: 'draft', template_name: 'bad_template', template_language: 'en' }],
      broadcast_audiences: [{ campaign_id: CAMPAIGN_ID, audience_type: 'manual', tag_ids: [], filters: { manualContactIds: ['lead-1'] } }],
      broadcast_templates_cache: [{ tenant_id: TENANT_ID, name: 'bad_template', status: 'REJECTED', template_json: {} }],
      leads: [{ id: 'lead-1', tenant_id: TENANT_ID, name: 'Test User', phone: '919999999999', tags: [], channel: 'whatsapp', last_message_at: new Date().toISOString() }],
    } as any);
    const db = installDb(seed);

    const result = await BroadcastEngineService.launchCampaign(TENANT_ID, CAMPAIGN_ID);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/REJECTED/);
    expect(db.get('broadcast_queue').rows.length).toBe(0); // nothing was queued
  });
});

describe('ADVERSARIAL — worker crash mid-batch / process restart', () => {
  it('resetStaleProcessing recovers items stuck >10min in processing, and logs a real DB failure instead of swallowing it', async () => {
    const staleLockedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const seed = baseSeed({
      broadcast_queue: [
        queueItem({ id: 'stuck', status: 'processing', locked_at: staleLockedAt }),
        queueItem({ id: 'fresh', status: 'processing', locked_at: new Date().toISOString() }),
      ],
    });
    const db = installDb(seed);

    await BroadcastEngineService.resetStaleProcessing();

    expect(db.get('broadcast_queue').rows.find((r) => r.id === 'stuck')!.status).toBe('pending');
    expect(db.get('broadcast_queue').rows.find((r) => r.id === 'fresh')!.status).toBe('processing'); // untouched

    // Now simulate the recovery step itself failing (e.g. RLS/schema drift) —
    // must not throw uncaught (process-queue/route.ts has no top-level catch).
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    installDb(seed, {}, { broadcast_queue: 'simulated permission error' });
    await expect(BroadcastEngineService.resetStaleProcessing()).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('resetStaleProcessing failed'), expect.anything());
  });
});

describe('ADVERSARIAL — campaign cancellation racing an in-flight send', () => {
  it('a send that FAILS after the campaign was cancelled mid-flight does not resurrect the row as retrying', async () => {
    (metaService.sendTemplateMessage as any).mockRejectedValue(new Error('network blip'));
    const seed = baseSeed({ broadcast_queue: [queueItem({ status: 'processing' })] });
    const db = installDb(seed);

    // Simulate the cancel route firing WHILE the (mocked) Meta call is "in
    // flight" by flipping the row to 'cancelled' before processItemsForTenant's
    // catch block writes its own outcome — this mirrors the real race exactly:
    // the cancel route's own update already landed by the time our code tries
    // to write status='retrying'.
    const origSend = metaService.sendTemplateMessage as any;
    origSend.mockImplementation(async () => {
      db.get('broadcast_queue').rows[0].status = 'cancelled';
      throw new Error('network blip');
    });

    await runBatch(db.get('broadcast_queue').rows.map((r) => ({ ...r })), db);

    const row = db.get('broadcast_queue').rows[0];
    expect(row.status).toBe('cancelled'); // NOT overwritten back to 'retrying'
    expect(db.get('dead_letter_queue').rows.length).toBe(0); // not recorded as a real failure
  });
});

describe('ADVERSARIAL — network interruption (generic, non-MetaApiError failure)', () => {
  it('a plain network error (not a MetaApiError) still resolves via the bounded 5-stage backoff, not forever', async () => {
    (metaService.sendTemplateMessage as any).mockRejectedValue(new Error('fetch failed: ECONNRESET'));
    const seed = baseSeed({ broadcast_queue: [queueItem()] });
    const db = installDb(seed);

    for (let cycle = 0; cycle < 10; cycle++) {
      const row = db.get('broadcast_queue').rows[0];
      if (row.status === 'failed') break;
      row.status = 'processing';
      await runBatch([{ ...row }], db);
    }

    const finalRow = db.get('broadcast_queue').rows[0];
    expect(finalRow.status).toBe('failed');
    expect(finalRow.attempt_count).toBe(6);
    expect(db.get('dead_letter_queue').rows.length).toBe(1);
  });
});

describe('ADVERSARIAL — large audience (chunking/pagination stress)', () => {
  it('a 1,200-recipient CRM audience crosses the 1000-row page cap and 500-row insert-chunk boundary without dropping anyone', async () => {
    const N = 1200;
    const leads = Array.from({ length: N }, (_, i) => ({
      id: `lead-${String(i).padStart(5, '0')}`,
      tenant_id: TENANT_ID,
      name: `Contact ${i}`,
      phone: `9199990${String(i).padStart(5, '0')}`,
      tags: [],
      channel: 'whatsapp',
      last_message_at: new Date().toISOString(),
    }));
    const seed = baseSeed({
      broadcast_campaigns: [{ id: CAMPAIGN_ID, tenant_id: TENANT_ID, status: 'draft', template_name: 'order_update', template_language: 'en' }],
      broadcast_audiences: [{ campaign_id: CAMPAIGN_ID, audience_type: 'all', tag_ids: [], filters: {} }],
      broadcast_templates_cache: [{ tenant_id: TENANT_ID, name: 'order_update', status: 'APPROVED', template_json: {} }],
      leads,
    } as any);
    const db = installDb(seed);

    const result = await BroadcastEngineService.launchCampaign(TENANT_ID, CAMPAIGN_ID);
    expect(result.success).toBe(true);
    expect(result.queuedCount).toBe(N);

    const queueRows = db.get('broadcast_queue').rows.filter((r) => r.campaign_id === CAMPAIGN_ID);
    expect(queueRows.length).toBe(N); // no truncation at the 1000-row PostgREST cap or the 500-row insert chunk
    const uniquePhones = new Set(queueRows.map((r) => r.phone));
    expect(uniquePhones.size).toBe(N); // no dupes introduced by chunked pagination
  });
});

describe('ADVERSARIAL — webhook: duplicate delivery + out-of-order delivery', () => {
  async function postWebhook(payload: any) {
    const { POST } = await import('@/app/api/broadcast/webhook/route');
    const req = new Request('http://localhost/api/broadcast/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=fake', 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const origSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
    process.env.WHATSAPP_WEBHOOK_SECRET = 'test-secret'; // just needs to be present; verifySignature is mocked true
    try {
      return await POST(req as any);
    } finally {
      process.env.WHATSAPP_WEBHOOK_SECRET = origSecret;
    }
  }

  function statusPayload(messageId: string, status: string, tsSec: number) {
    return {
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: 'PN1' },
            statuses: [{ id: messageId, status, timestamp: String(tsSec), recipient_id: '919999999999' }],
          },
        }],
      }],
    };
  }

  it('the same "delivered" webhook arriving twice only increments analytics once', async () => {
    const seed = baseSeed({
      broadcast_deliveries: [{ id: 'd1', tenant_id: TENANT_ID, campaign_id: CAMPAIGN_ID, contact_id: 'lead-1', phone: '919999999999', message_id: 'wamid.1', status: 'sent' }],
      tenants: [{ id: TENANT_ID, wa_phone_number_id: 'PN1' }],
    });
    const db = installDb(seed);
    const rpcSpy = vi.spyOn(supabaseAdmin, 'rpc');

    await postWebhook(statusPayload('wamid.1', 'delivered', 1700000000));
    await postWebhook(statusPayload('wamid.1', 'delivered', 1700000000)); // Meta at-least-once redelivery

    const counterCalls = rpcSpy.mock.calls.filter((c) => c[0] === 'increment_campaign_counter');
    expect(counterCalls.length).toBe(1); // NOT double-counted
    expect(db.get('broadcast_deliveries').rows[0].status).toBe('delivered');
  });

  it('a late/out-of-order "sent" arriving AFTER "read" does not regress status or double-count analytics', async () => {
    const seed = baseSeed({
      broadcast_deliveries: [{ id: 'd1', tenant_id: TENANT_ID, campaign_id: CAMPAIGN_ID, contact_id: 'lead-1', phone: '919999999999', message_id: 'wamid.2', status: 'sent' }],
      tenants: [{ id: TENANT_ID, wa_phone_number_id: 'PN1' }],
    });
    const db = installDb(seed);
    const rpcSpy = vi.spyOn(supabaseAdmin, 'rpc');

    // 'read' arrives first (e.g. the customer opened it fast, and Meta's own
    // 'sent'/'delivered' confirmations got delayed in Meta's infrastructure).
    await postWebhook(statusPayload('wamid.2', 'read', 1700000100));
    expect(db.get('broadcast_deliveries').rows[0].status).toBe('read');

    // The stale 'sent' event for the SAME message finally arrives.
    await postWebhook(statusPayload('wamid.2', 'sent', 1700000000));

    expect(db.get('broadcast_deliveries').rows[0].status).toBe('read'); // NOT regressed to 'sent'
    const counterCalls = rpcSpy.mock.calls.filter((c) => c[0] === 'increment_campaign_counter');
    expect(counterCalls.length).toBe(1); // only the original 'read' transition counted — the stale 'sent' did not
  });
});
