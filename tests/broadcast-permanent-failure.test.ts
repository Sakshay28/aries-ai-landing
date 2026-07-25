// ═══════════════════════════════════════════════════════════════════════════
// 🛑 PERMANENT META REJECTIONS — fail fast, explain why, always finalize
// ═══════════════════════════════════════════════════════════════════════════
// Regression tests for the production incident of 2026-07-24 (tenant
// "Lazy Mozo Banquet"): every broadcast the client had ever launched sent ZERO
// messages. Meta was rejecting each send with
//
//   (#131058) Hello World templates can only be sent from the Public Test Numbers
//
// but the engine classified anything that wasn't a rate/tier limit as transient,
// so each doomed recipient was walked through the full 1/5/15/30/60-minute
// backoff ladder — 6 attempts over ~111 minutes — while the dashboard showed
// "SENDING" with a frozen 0/0/0 and no reason anywhere in the UI. A second
// campaign was left orphaned in 'sending' forever because the tick that
// processed its last queue item was killed by the serverless time limit before
// it could run the end-of-batch completion check.
//
// Run: npx vitest run tests/broadcast-permanent-failure.test.ts
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';
import { MetaApiError, explainMetaError } from '@/lib/meta/service';
import * as metaService from '@/lib/meta/service';
import { validateCampaignPreflight } from '@/app/dashboard/broadcast/validators/broadcast.validator';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('@/lib/utils/crypto', () => ({
  decryptToken: vi.fn(() => 'EAAFAKETOKENFORTESTS1234567890ABCDEF'),
}));
vi.mock('@/lib/meta/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/meta/service')>();
  return { ...actual, sendTemplateMessage: vi.fn() };
});
vi.mock('@/lib/broadcast/services/automation-engine.service', () => ({
  AutomationEngineService: { triggerRule: vi.fn(() => Promise.resolve(false)) },
}));

// ── Minimal Postgres-shaped in-memory mock ──────────────────────────────────
// Same approach as broadcast-adversarial.test.ts: real state mutation across
// calls, so "run the drain 30 times" observes genuine end state rather than a
// canned response.
type Row = Record<string, any>;

class Table {
  constructor(public rows: Row[] = []) {}
}

function buildDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables = new Map<string, Table>();
  const get = (name: string) => {
    if (!tables.has(name)) tables.set(name, new Table(seed[name] ?? []));
    return tables.get(name)!;
  };
  for (const k of Object.keys(seed)) get(k);
  return { get, tables };
}

function matches(row: Row, filters: Array<[string, string, any]>): boolean {
  return filters.every(([col, op, val]) => {
    const v = row[col];
    switch (op) {
      case 'eq': return v === val;
      case 'neq': return v !== val;
      case 'in': return (val as any[]).includes(v);
      case 'is': return val === null ? (v === null || v === undefined) : v === val;
      case 'lt': return v != null && String(v) < String(val);
      case 'lte': return v != null && String(v) <= String(val);
      case 'gt': return v != null && String(v) > String(val);
      case 'gte': return v != null && String(v) >= String(val);
      default: return true;
    }
  });
}

function makeChain(db: ReturnType<typeof buildDb>, tableName: string) {
  const table = db.get(tableName);
  const filters: Array<[string, string, any]> = [];
  let mode: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select';
  let payload: Row | Row[] = {};
  let wantCount = false;
  let headOnly = false;
  let limitN: number | undefined;
  let selectAfterWrite = false;

  const apply = () => {
    const hits = table.rows.filter(r => matches(r, filters));
    if (mode === 'update') {
      hits.forEach(r => Object.assign(r, payload));
      return hits;
    }
    if (mode === 'insert' || mode === 'upsert') {
      const items = Array.isArray(payload) ? payload : [payload];
      items.forEach(i => table.rows.push({ ...i }));
      return items;
    }
    if (mode === 'delete') {
      for (const h of hits) table.rows.splice(table.rows.indexOf(h), 1);
      return hits;
    }
    return limitN != null ? hits.slice(0, limitN) : hits;
  };

  const chain: any = {
    select: (_c?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count) wantCount = true;
      if (opts?.head) headOnly = true;
      if (mode !== 'select') selectAfterWrite = true;
      return chain;
    },
    update: (p: Row) => { mode = 'update'; payload = p; return chain; },
    insert: (p: Row | Row[]) => { mode = 'insert'; payload = p; return chain; },
    upsert: (p: Row | Row[]) => { mode = 'upsert'; payload = p; return chain; },
    delete: () => { mode = 'delete'; return chain; },
    order: () => chain,
    limit: (n: number) => { limitN = n; return chain; },
    or: () => chain,
    not: () => chain,
  };
  for (const op of ['eq', 'neq', 'in', 'is', 'lt', 'lte', 'gt', 'gte']) {
    chain[op] = (col: string, val: any) => { filters.push([col, op, val]); return chain; };
  }
  chain.single = () => {
    const r = apply();
    return Promise.resolve(r.length ? { data: r[0], error: null } : { data: null, error: { message: 'no rows' } });
  };
  chain.maybeSingle = () => {
    const r = apply();
    return Promise.resolve({ data: r.length ? r[0] : null, error: null });
  };
  chain.then = (resolve: any) => {
    const r = apply();
    const out: Row = { error: null };
    if (wantCount) out.count = r.length;
    out.data = headOnly ? null : (selectAfterWrite || mode === 'select' ? r : null);
    return Promise.resolve(resolve(out));
  };
  return chain;
}

type RpcHandlers = Record<string, (args: any) => any>;

function installDb(seed: Partial<Record<string, Row[]>>, rpcHandlers: RpcHandlers = {}) {
  const db = buildDb(seed);
  vi.spyOn(supabaseAdmin, 'from').mockImplementation((t: string): any => makeChain(db, t));
  vi.spyOn(supabaseAdmin, 'rpc').mockImplementation(((name: string, args: any) => {
    if (rpcHandlers[name]) return Promise.resolve({ data: rpcHandlers[name](args), error: null });
    return Promise.resolve({ data: null, error: null });
  }) as any);
  return db;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

const TENANT_ID = 'tenant-1';
const CAMPAIGN_ID = 'campaign-1';

function baseSeed(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    tenants: [{ id: TENANT_ID, wa_access_token: 'enc:v1:x:y:z', wa_phone_number_id: 'PN1', timezone: 'Asia/Kolkata', wa_messaging_tier: 'TIER_10K', wa_daily_conversation_cap: null }],
    broadcast_optouts: [],
    broadcast_campaigns: [{ id: CAMPAIGN_ID, tenant_id: TENANT_ID, status: 'sending', template_name: 'hello_world', template_language: 'en_US', updated_at: new Date().toISOString(), auto_resumed: false }],
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
    phone: '919875152290',
    status: 'processing',
    attempt_count: 0,
    next_attempt_at: new Date().toISOString(),
    language_code: 'en_US',
    payload: { name: null },
    locked_at: new Date().toISOString(),
    ...overrides,
  };
}

const runBatch = (items: Row[], opts: Record<string, any> = {}) =>
  (BroadcastEngineService as any).processItemsForTenant(TENANT_ID, items, opts);

// The exact error body Meta returned in production.
const HELLO_WORLD_ERROR = () => new MetaApiError(
  'Meta Cloud API template error 400: {"error":{"message":"(#131058) Hello World templates can only be sent from the Public Test Numbers","code":131058,"type":"OAuthException","fbtrace_id":"ABrZ2hC6ZtJkQNRPLelIwr8"}} [fbtrace_id=ABrZ2hC6ZtJkQNRPLelIwr8]',
  400,
  { code: 131058, fbtraceId: 'ABrZ2hC6ZtJkQNRPLelIwr8' },
);

describe('MetaApiError permanent-vs-transient classification', () => {
  it('flags #131058 (sample template on a real number) as permanent', () => {
    const err = HELLO_WORLD_ERROR();
    expect(err.isPermanent).toBe(true);
    expect(err.isRateLimited).toBe(false);
    expect(err.isTierLimited).toBe(false);
  });

  it.each([
    ['template does not exist', 132001],
    ['param count mismatch', 132000],
    ['template paused', 132015],
    ['template disabled', 132016],
    ['recipient undeliverable', 131026],
    ['number not registered', 133010],
  ])('flags %s (code %i) as permanent', (_label, code) => {
    expect(new MetaApiError('x', 400, { code }).isPermanent).toBe(true);
  });

  it.each([
    ['cloud API rate limit', 130429],
    ['spam rate limit', 131048],
    ['pair rate limit', 131056],
    ['app request limit', 4],
  ])('does NOT flag transient throttle %s (code %i) as permanent', (_label, code) => {
    const err = new MetaApiError('x', 429, { code });
    expect(err.isPermanent).toBe(false);
    expect(err.isRateLimited).toBe(true);
  });

  it('leaves an UNRECOGNISED error retryable — never guesses "permanent"', () => {
    // A 500, a network blip, or a brand-new Meta code must keep the old
    // bounded-retry behaviour. Misclassifying one of these as permanent would
    // silently drop deliverable messages, which is worse than retrying.
    expect(new MetaApiError('server error', 500).isPermanent).toBe(false);
    expect(new MetaApiError('unknown', 400, { code: 999999 }).isPermanent).toBe(false);
    expect(new MetaApiError('no code at all', 400).isPermanent).toBe(false);
  });
});

describe('explainMetaError — actionable reasons, not raw JSON envelopes', () => {
  it('turns the #131058 envelope into an instruction the business owner can act on', () => {
    const msg = explainMetaError(HELLO_WORLD_ERROR());
    expect(msg).toContain('hello_world');
    expect(msg).toMatch(/test numbers/i);
    expect(msg).toContain('ABrZ2hC6ZtJkQNRPLelIwr8'); // fbtrace kept for Meta support
    expect(msg).not.toContain('{"error"');            // no raw envelope
    expect(msg).not.toContain('OAuthException');
  });

  it('falls back to Meta\'s own message for an unmapped code instead of dumping JSON', () => {
    const err = new MetaApiError(
      'Meta Cloud API template error 400: {"error":{"message":"(#99999) Something new broke","code":99999}}',
      400, { code: 99999 },
    );
    const msg = explainMetaError(err);
    expect(msg).toContain('Something new broke');
    expect(msg).not.toContain('{"error"');
  });

  it('passes a plain non-Meta Error through untouched', () => {
    expect(explainMetaError(new Error('socket hang up'))).toBe('socket hang up');
  });
});

describe('Engine — a permanently-rejected send fails immediately, without the backoff ladder', () => {
  it('marks the item failed on the FIRST attempt (no 111-minute retry ladder)', async () => {
    (metaService.sendTemplateMessage as any).mockRejectedValue(HELLO_WORLD_ERROR());
    const db = installDb(baseSeed({ broadcast_queue: [queueItem()] }));

    await runBatch([{ ...db.get('broadcast_queue').rows[0] }]);

    const row = db.get('broadcast_queue').rows[0];
    expect(row.status).toBe('failed');       // not 'retrying'
    expect(row.attempt_count).toBe(1);       // burned exactly one attempt
    expect(row.next_attempt_at).toBeTruthy(); // untouched; nothing is scheduled
    expect(row.processed_at).toBeTruthy();   // terminal
  });

  it('records the actionable reason — and does NOT claim "max attempts reached"', async () => {
    (metaService.sendTemplateMessage as any).mockRejectedValue(HELLO_WORLD_ERROR());
    const db = installDb(baseSeed({ broadcast_queue: [queueItem()] }));

    await runBatch([{ ...db.get('broadcast_queue').rows[0] }]);

    const reason = db.get('broadcast_queue').rows[0].failure_reason as string;
    // The old text sent people hunting for a flaky network instead of the
    // actual template misconfiguration.
    expect(reason).not.toMatch(/max attempts reached/i);
    expect(reason).toMatch(/test numbers/i);
    expect(reason).toContain('hello_world');
  });

  it('still routes the permanent failure to the DLQ and increments failed_count', async () => {
    (metaService.sendTemplateMessage as any).mockRejectedValue(HELLO_WORLD_ERROR());
    const rpcCalls: Array<[string, any]> = [];
    const db = installDb(baseSeed({ broadcast_queue: [queueItem()] }), {
      increment_broadcast_analytics: (a: any) => { rpcCalls.push(['increment_broadcast_analytics', a]); return null; },
      increment_campaign_counter: (a: any) => { rpcCalls.push(['increment_campaign_counter', a]); return null; },
    });

    await runBatch([{ ...db.get('broadcast_queue').rows[0] }]);

    expect(db.get('dead_letter_queue').rows.length).toBe(1);
    expect(rpcCalls.some(([n, a]) => n === 'increment_broadcast_analytics' && a.col_name === 'failed_count')).toBe(true);
    expect(rpcCalls.some(([n, a]) => n === 'increment_campaign_counter' && a.p_status === 'failed')).toBe(true);
  });

  it('a whole campaign of permanently-rejected recipients terminates in ONE pass', async () => {
    // This is the production shape: 3 recipients, same broken template. Before
    // the fix this took 6 passes each across ~111 minutes and the campaign sat
    // on "SENDING" throughout.
    (metaService.sendTemplateMessage as any).mockRejectedValue(HELLO_WORLD_ERROR());
    const db = installDb(baseSeed({
      broadcast_queue: [
        queueItem({ id: 'q-1', phone: '919875152290' }),
        queueItem({ id: 'q-2', phone: '918233451667' }),
        queueItem({ id: 'q-3', phone: '919887064208' }),
      ],
    }));

    await runBatch(db.get('broadcast_queue').rows.map(r => ({ ...r })));

    expect(db.get('broadcast_queue').rows.every(r => r.status === 'failed')).toBe(true);
    // Queue fully drained => the end-of-batch check finalizes the campaign, so
    // the owner sees a terminal state with a reason instead of a frozen 0/0/0.
    expect(db.get('broadcast_campaigns').rows[0].status).toBe('completed');
  });

  it('a TRANSIENT failure still gets its retry ladder (the fix is narrow)', async () => {
    (metaService.sendTemplateMessage as any).mockRejectedValue(
      new MetaApiError('Meta Cloud API template error 500: upstream boom', 500),
    );
    const db = installDb(baseSeed({ broadcast_queue: [queueItem()] }));

    await runBatch([{ ...db.get('broadcast_queue').rows[0] }]);

    const row = db.get('broadcast_queue').rows[0];
    expect(row.status).toBe('retrying'); // NOT failed — deliverable later
    expect(row.attempt_count).toBe(1);
    expect(db.get('dead_letter_queue').rows.length).toBe(0);
  });
});

describe('Engine — deadline handoff keeps the serverless tick under its time limit', () => {
  it('releases unsent claimed items back to pending instead of overrunning', async () => {
    // Every send "takes" long enough that finishing the batch would blow the
    // function limit — the exact condition that produced the cron provider's
    // 504 Gateway Timeout emails.
    (metaService.sendTemplateMessage as any).mockImplementation(async () => ({ messageId: 'wamid.ok', status: 'sent' }));
    const db = installDb(baseSeed({
      broadcast_queue: [
        queueItem({ id: 'q-1' }),
        queueItem({ id: 'q-2' }),
        queueItem({ id: 'q-3' }),
      ],
    }));

    // A deadline already in the past: nothing should be sent, everything released.
    await runBatch(db.get('broadcast_queue').rows.map(r => ({ ...r })), { deadlineAt: Date.now() - 1 });

    const rows = db.get('broadcast_queue').rows;
    expect(rows.every(r => r.status === 'pending')).toBe(true);
    expect(rows.every(r => r.locked_at === null)).toBe(true);
    // Nothing was stranded in 'processing' waiting on resetStaleProcessing.
    expect(rows.some(r => r.status === 'processing')).toBe(false);
    expect(metaService.sendTemplateMessage as any).not.toHaveBeenCalled();
  });

  it('with no deadline set, behaviour is unchanged (all items processed)', async () => {
    (metaService.sendTemplateMessage as any).mockResolvedValue({ messageId: 'wamid.ok', status: 'sent' });
    const db = installDb(baseSeed({
      broadcast_queue: [queueItem({ id: 'q-1' }), queueItem({ id: 'q-2' })],
    }));

    await runBatch(db.get('broadcast_queue').rows.map(r => ({ ...r })));

    expect(db.get('broadcast_queue').rows.every(r => r.status === 'sent')).toBe(true);
  });
});

describe('Engine — reconcileFinishedCampaigns rescues campaigns orphaned on "sending"', () => {
  const stale = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  it('finalizes a campaign whose queue is drained but whose status was never flipped', async () => {
    // Reproduces production campaign a4443261: 1 recipient, failed, yet stuck on
    // 'sending' because the tick that failed it was killed before step E ran.
    const db = installDb(baseSeed({
      broadcast_campaigns: [{ id: CAMPAIGN_ID, tenant_id: TENANT_ID, status: 'sending', updated_at: stale }],
      broadcast_queue: [queueItem({ status: 'failed', processed_at: stale })],
    }));

    const fixed = await BroadcastEngineService.reconcileFinishedCampaigns();

    expect(fixed).toBe(1);
    const camp = db.get('broadcast_campaigns').rows[0];
    expect(camp.status).toBe('completed');
    expect(camp.completed_at).toBeTruthy();
  });

  it('leaves a genuinely-active campaign alone', async () => {
    const db = installDb(baseSeed({
      broadcast_campaigns: [{ id: CAMPAIGN_ID, tenant_id: TENANT_ID, status: 'sending', updated_at: stale }],
      broadcast_queue: [queueItem({ status: 'pending' })],
    }));

    const fixed = await BroadcastEngineService.reconcileFinishedCampaigns();

    expect(fixed).toBe(0);
    expect(db.get('broadcast_campaigns').rows[0].status).toBe('sending');
  });

  it('does not race a drain that just started (recently-updated campaigns are skipped)', async () => {
    const db = installDb(baseSeed({
      broadcast_campaigns: [{ id: CAMPAIGN_ID, tenant_id: TENANT_ID, status: 'sending', updated_at: new Date().toISOString() }],
      broadcast_queue: [queueItem({ status: 'failed' })],
    }));

    expect(await BroadcastEngineService.reconcileFinishedCampaigns()).toBe(0);
    expect(db.get('broadcast_campaigns').rows[0].status).toBe('sending');
  });

  it('is idempotent — a second run finds nothing left to fix', async () => {
    const db = installDb(baseSeed({
      broadcast_campaigns: [{ id: CAMPAIGN_ID, tenant_id: TENANT_ID, status: 'sending', updated_at: stale }],
      broadcast_queue: [queueItem({ status: 'failed' })],
    }));

    expect(await BroadcastEngineService.reconcileFinishedCampaigns()).toBe(1);
    expect(await BroadcastEngineService.reconcileFinishedCampaigns()).toBe(0);
    expect(db.get('broadcast_campaigns').rows[0].status).toBe('completed');
  });

  it('never touches a cancelled or paused campaign', async () => {
    for (const status of ['cancelled', 'paused', 'completed', 'draft']) {
      const db = installDb(baseSeed({
        broadcast_campaigns: [{ id: CAMPAIGN_ID, tenant_id: TENANT_ID, status, updated_at: stale }],
        broadcast_queue: [queueItem({ status: 'failed' })],
      }));
      expect(await BroadcastEngineService.reconcileFinishedCampaigns()).toBe(0);
      expect(db.get('broadcast_campaigns').rows[0].status).toBe(status);
    }
  });
});

describe('Preflight — the sample template is blocked before launch', () => {
  const values = { name: 'July offer', template_name: 'hello_world', variables: {} } as any;

  it('blocks hello_world with an explanation', () => {
    const checks = validateCampaignPreflight(values, [], 25);
    const check = checks.find(c => c.id === 'template_not_sample');
    expect(check?.status).toBe('fail');
    expect(check?.message).toMatch(/test numbers/i);
  });

  it('is case- and whitespace-insensitive', () => {
    for (const name of ['HELLO_WORLD', ' hello_world ', 'Hello_World']) {
      const checks = validateCampaignPreflight({ ...values, template_name: name }, [], 25);
      expect(checks.find(c => c.id === 'template_not_sample')?.status).toBe('fail');
    }
  });

  it('passes a real approved template', () => {
    const checks = validateCampaignPreflight({ ...values, template_name: 'order_update' }, [], 25);
    expect(checks.find(c => c.id === 'template_not_sample')?.status).toBe('pass');
  });

  it('does not add the check when no template is selected (the "select a template" blocker owns that case)', () => {
    const checks = validateCampaignPreflight({ ...values, template_name: '' }, [], 25);
    expect(checks.find(c => c.id === 'template_not_sample')).toBeUndefined();
    expect(checks.find(c => c.id === 'template')?.status).toBe('fail');
  });
});
