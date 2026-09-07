// ═══════════════════════════════════════════════════════════
// Settings persistence — regression guard
// ═══════════════════════════════════════════════════════════
// A save used to be lost wholesale whenever the payload carried
// `default_lead_assignee_id: ''`: Postgres rejects '' for a uuid column with
// 22P02 and aborts the ENTIRE update, so changing a WhatsApp credential
// persisted nothing. The empty string got there because ONE un-run migration
// (bot_paused_auto_resume_hours) made the GET's select fail, and the old
// all-or-nothing fallback then dropped every optional column from the
// response — including default_lead_assignee_id — leaving the client's
// DEFAULT_SETTINGS placeholder '' in its place.
//
// These tests pin both halves of that chain plus the success/failure contract.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const TENANT = '00000000-0000-4000-8000-000000000001';

interface DbCall {
  op: 'select' | 'update';
  selectCols?: string;
  payload?: Record<string, unknown>;
  eq?: [string, unknown];
}

const calls: DbCall[] = [];
let handler: (call: DbCall) => { data: unknown; error: unknown };

vi.mock('@/lib/supabase/admin', () => {
  const chainFor = () => {
    const ctx: DbCall = { op: 'select' };
    const chain = {
      select(cols: string) { ctx.selectCols = cols; return chain; },
      update(payload: Record<string, unknown>) { ctx.op = 'update'; ctx.payload = payload; return chain; },
      eq(col: string, val: unknown) { ctx.eq = [col, val]; return chain; },
      single() { calls.push({ ...ctx }); return Promise.resolve(handler({ ...ctx })); },
      maybeSingle() { calls.push({ ...ctx }); return Promise.resolve(handler({ ...ctx })); },
    };
    return chain;
  };
  return { supabaseAdmin: { from: () => chainFor() } };
});

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: async () => ({
    id: 'u1', tenant_id: TENANT, email: 'owner@example.com',
    full_name: null, role: 'owner', is_sales_agent: false, is_platform_admin: false,
  }),
  canManageTeam: (r: string) => r === 'owner' || r === 'admin',
}));
vi.mock('@/lib/auth/getTenantId', () => ({ getTenantId: async () => TENANT }));
vi.mock('@/lib/tenant/manager', () => ({ invalidateTenantAllCaches: async () => {} }));

import { GET, PATCH } from '@/app/api/dashboard/settings/route';

const ROW = {
  business_name: 'Acme', wa_phone_number_id: 'OLD_PHONE', wa_business_account_id: 'WABA_1',
  wa_access_token: 'ENCRYPTED_TOKEN', wa_app_secret: 'ENCRYPTED_SECRET',
  default_lead_assignee_id: null, bot_language_mode: 'auto',
};

// Emulates Postgres refusing a column that a pending migration hasn't added.
const MISSING = 'bot_paused_auto_resume_hours';
function rejectMissingColumn(call: DbCall) {
  if (call.selectCols?.includes(MISSING)) {
    return { data: null, error: { code: '42703', message: `column tenants.${MISSING} does not exist` } };
  }
  if (call.payload && MISSING in call.payload) {
    return { data: null, error: { code: 'PGRST204', message: `Could not find the '${MISSING}' column of 'tenants' in the schema cache` } };
  }
  return { data: { ...ROW }, error: null };
}

function patchReq(body: unknown) {
  return new Request('http://localhost/api/dashboard/settings', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as never;
}

const lastUpdate = () => [...calls].reverse().find(c => c.op === 'update')!;

beforeEach(() => {
  calls.length = 0;
  handler = () => ({ data: { ...ROW }, error: null });
});

describe('settings GET — one pending migration must not blank out every optional field', () => {
  it('drops only the missing column and still returns the rest', async () => {
    handler = rejectMissingColumn;
    const body = await (await GET()).json();

    expect(body.success).toBe(true);
    // The field whose absence poisoned every save
    expect(Object.keys(body.data)).toContain('default_lead_assignee_id');
    expect(Object.keys(body.data)).toContain('bot_language_mode');
    expect(body.pendingMigrationFields).toEqual([MISSING]);

    const finalSelect = calls[calls.length - 1].selectCols!;
    expect(finalSelect).not.toContain(MISSING);
    expect(finalSelect).toContain('default_lead_assignee_id');
  });

  it('gives up rather than looping when a BASE column is missing', async () => {
    handler = () => ({ data: null, error: { code: '42703', message: 'column tenants.business_name does not exist' } });
    const res = await GET();
    expect(res.status).toBe(500);
    expect(calls.length).toBeLessThanOrEqual(2);
  });

  it('masks stored secrets', async () => {
    const body = await (await GET()).json();
    expect(body.data.wa_access_token).toBe('••••••••');
    expect(body.data.wa_app_secret).toBe('••••••••');
  });
});

describe('settings PATCH — nullable uuid coercion (the root cause)', () => {
  it("converts default_lead_assignee_id '' to null instead of aborting the update", async () => {
    const res = await PATCH(patchReq({ wa_phone_number_id: 'NEW_PHONE', default_lead_assignee_id: '' }));

    expect(res.status).toBe(200);
    expect(lastUpdate().payload!.default_lead_assignee_id).toBeNull();
    expect(lastUpdate().payload!.wa_phone_number_id).toBe('NEW_PHONE');
  });

  it('still writes a real assignee id through untouched', async () => {
    const id = '11111111-2222-4333-8444-555555555555';
    await PATCH(patchReq({ default_lead_assignee_id: id }));
    expect(lastUpdate().payload!.default_lead_assignee_id).toBe(id);
  });
});

describe('settings PATCH — credential persistence', () => {
  it('persists all four WhatsApp fields', async () => {
    await PATCH(patchReq({
      wa_phone_number_id: 'P1', wa_business_account_id: 'W1',
      wa_access_token: 'plain-token', wa_app_secret: 'plain-secret',
    }));
    const p = lastUpdate().payload!;
    expect(p.wa_phone_number_id).toBe('P1');
    expect(p.wa_business_account_id).toBe('W1');
    expect(p.wa_access_token).not.toBe('plain-token');   // encrypted
    expect(p.wa_app_secret).not.toBe('plain-secret');
  });

  it('never writes the mask over a stored secret', async () => {
    await PATCH(patchReq({
      wa_phone_number_id: 'P2', wa_access_token: '••••••••', wa_app_secret: '••••••••',
    }));
    const p = lastUpdate().payload!;
    expect('wa_access_token' in p).toBe(false);
    expect('wa_app_secret' in p).toBe(false);
    expect(p.wa_phone_number_id).toBe('P2');
  });

  it('treats any all-bullets string as the mask, not as a new secret', async () => {
    await PATCH(patchReq({ wa_phone_number_id: 'P3', wa_access_token: '•••••••••••' }));
    expect('wa_access_token' in lastUpdate().payload!).toBe(false);
  });

  it('clears a secret only on an explicit empty string', async () => {
    await PATCH(patchReq({ wa_access_token: '', wa_app_secret: null }));
    const p = lastUpdate().payload!;
    expect(p.wa_access_token).toBeNull();
    expect(p.wa_app_secret).toBeNull();
  });

  it('trims whitespace around identifiers and tokens', async () => {
    await PATCH(patchReq({ wa_phone_number_id: '  P4  ', wa_business_account_id: ' W4 ' }));
    const p = lastUpdate().payload!;
    expect(p.wa_phone_number_id).toBe('P4');
    expect(p.wa_business_account_id).toBe('W4');
  });
});

describe('settings PATCH — no false success', () => {
  it('reports failure when the update matches zero rows', async () => {
    handler = () => ({ data: null, error: null });   // maybeSingle() on 0 rows
    const res = await PATCH(patchReq({ wa_phone_number_id: 'X' }));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('explains a duplicate phone number id instead of leaking the index name', async () => {
    handler = () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "idx_tenants_wa_phone"' } });
    const res = await PATCH(patchReq({ wa_phone_number_id: 'TAKEN' }));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already connected to another account/i);
    expect(body.error).not.toMatch(/idx_tenants_wa_phone/);
  });

  it('surfaces a genuine DB error as a failure', async () => {
    handler = () => ({ data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid: ""' } });
    const res = await PATCH(patchReq({ wa_phone_number_id: 'X' }));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it('saves the rest and names what it skipped when a migration is pending', async () => {
    handler = rejectMissingColumn;
    const res = await PATCH(patchReq({ wa_phone_number_id: 'P5', bot_paused_auto_resume_hours: 12 }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.pendingMigrationFields).toEqual([MISSING]);
    expect(lastUpdate().payload!.wa_phone_number_id).toBe('P5');
    expect(MISSING in lastUpdate().payload!).toBe(false);
  });
});

describe('settings PATCH — response shape', () => {
  it('returns only the settings columns, never every tenant secret', async () => {
    await PATCH(patchReq({ wa_phone_number_id: 'P6' }));
    const cols = lastUpdate().selectCols!;
    expect(cols).toBeTruthy();                       // never a bare select('*')
    expect(cols).toContain('wa_phone_number_id');
    for (const secret of ['shopify_access_token', 'meta_ads_app_secret', 'ig_access_token', 'api_key']) {
      expect(cols).not.toContain(secret);
    }
  });

  it('scopes every write to the caller tenant', async () => {
    await PATCH(patchReq({ wa_phone_number_id: 'P7' }));
    expect(lastUpdate().eq).toEqual(['id', TENANT]);
  });
});
