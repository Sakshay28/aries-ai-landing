// tests/send-staff-alert.test.ts
// ═══════════════════════════════════════════════════════════════════════
// Integration tests for sendStaffAlert — verifies the WhatsApp Cloud API
// call count for every recipient scenario.
//
// Strategy: mock global `fetch` so no real HTTP calls are made. Each mock
// call returns a FRESH Response object (Response is single-read). Count
// how many times fetch was called — that equals WhatsApp API call count.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock decryptToken as identity ────────────────────────────────────────────
vi.mock('@/lib/utils/crypto', () => ({
  decryptToken: (v: string) => v,
  encryptToken: (v: string) => v,
}));

import { sendStaffAlert } from '@/lib/meta/service';

// ── Constants ────────────────────────────────────────────────────────────────
const PHONE_TOKEN = 'EAAtest_token_valid';
const WA_PHONE_ID = 'wa_phone_123';
const STAFF_PHONE = '919876543210';
const MGR_PHONE   = '918010307249';

// ── Response factories — always produce FRESH Response objects ───────────────
// Response body can only be read once; reuse would cause "Body is unusable"
function makeOkResponse(messageId = 'wamid.test') {
  return new Response(
    JSON.stringify({ messages: [{ id: messageId }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function makeErrorResponse(code = 401, msg = 'Invalid token') {
  return new Response(
    JSON.stringify({ error: { message: msg, code } }),
    { status: code, headers: { 'Content-Type': 'application/json' } }
  );
}

// ── Tracked fetch calls ───────────────────────────────────────────────────────
// We accumulate calls per-test. Each call entry stores url + body text.
interface FetchCall { url: string; body: Record<string, unknown> }
let calls: FetchCall[] = [];

// ── fetchMock: fresh call log per test ───────────────────────────────────────
// The mock implementation appends to `calls` and returns a fresh response.
// Tests that need failures override individual call slots via a call queue.
let responseQueue: (() => Response)[] = [];

function defaultFetchImpl(url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const bodyStr = (init?.body as string) || '{}';
  calls.push({ url: String(url), body: JSON.parse(bodyStr) });
  // Consume from queue if present, else return ok response
  const factory = responseQueue.shift();
  return Promise.resolve(factory ? factory() : makeOkResponse());
}

beforeEach(() => {
  calls = [];
  responseQueue = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(defaultFetchImpl));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function msgCalls() {
  return calls.filter(c => c.url.includes('/messages'));
}

function makeTenant(overrides: {
  staff_phone?: string | null;
  manager_phone?: string | null;
  wa_phone_number_id?: string | null;
  wa_access_token?: string | null;
}) {
  return {
    wa_phone_number_id: WA_PHONE_ID as string | null,
    wa_access_token:    PHONE_TOKEN as string | null,
    staff_phone:        null as string | null,
    manager_phone:      null as string | null,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
describe('sendStaffAlert — recipient routing', () => {

  // ── Scenario 1 ──────────────────────────────────────────────────────────
  it('Scenario 1: only staff_phone configured → exactly 1 API call', async () => {
    const tenant = makeTenant({ staff_phone: STAFF_PHONE, manager_phone: null });
    const results = await sendStaffAlert(tenant, 'Test alert');

    expect(msgCalls()).toHaveLength(1);
    expect(msgCalls()[0].body.to).toBe(STAFF_PHONE);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
  });

  // ── Scenario 2 ──────────────────────────────────────────────────────────
  it('Scenario 2: only manager_phone configured → exactly 1 API call', async () => {
    const tenant = makeTenant({ staff_phone: null, manager_phone: MGR_PHONE });
    const results = await sendStaffAlert(tenant, 'Test alert');

    expect(msgCalls()).toHaveLength(1);
    expect(msgCalls()[0].body.to).toBe(MGR_PHONE);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
  });

  // ── Scenario 3 ──────────────────────────────────────────────────────────
  it('Scenario 3: both configured (different numbers) → exactly 2 API calls', async () => {
    const tenant = makeTenant({ staff_phone: STAFF_PHONE, manager_phone: MGR_PHONE });
    const results = await sendStaffAlert(tenant, 'Escalation!');

    const mc = msgCalls();
    expect(mc).toHaveLength(2);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.ok)).toBe(true);

    const toPhones = mc.map(c => c.body.to as string);
    expect(toPhones).toContain(STAFF_PHONE);
    expect(toPhones).toContain(MGR_PHONE);
  });

  // ── Scenario 4 ──────────────────────────────────────────────────────────
  it('Scenario 4: same number in both fields → exactly 1 API call (deduplicated)', async () => {
    const tenant = makeTenant({ staff_phone: STAFF_PHONE, manager_phone: STAFF_PHONE });
    const results = await sendStaffAlert(tenant, 'Dedup test');

    expect(msgCalls()).toHaveLength(1);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
  });

  // ── Scenario 4b ─────────────────────────────────────────────────────────
  it('Scenario 4b: same number different format (10-digit vs 12-digit) → 1 API call', async () => {
    const tenant = makeTenant({
      staff_phone:   '9876543210',    // 10-digit → normalised to 919876543210
      manager_phone: '919876543210',  // already 12-digit
    });
    const results = await sendStaffAlert(tenant, 'Format dedup test');

    expect(msgCalls()).toHaveLength(1);
    expect(results).toHaveLength(1);
  });

  // ── Scenario 5 ──────────────────────────────────────────────────────────
  it('Scenario 5: one recipient fails → the other still succeeds', async () => {
    const tenant = makeTenant({ staff_phone: STAFF_PHONE, manager_phone: MGR_PHONE });

    // withMetaRetry retries 429s up to 3 times (maxRetries=3, so 4 total attempts).
    // We make ONE phone always return 401 (non-retryable — fails immediately on first try)
    // and the OTHER return 200. This gives us exactly 2 fetch calls total.
    responseQueue.push(() => makeErrorResponse(401, 'unauthorized'));   // non-retryable, fails on 1st attempt
    responseQueue.push(() => makeOkResponse('wamid.ok'));               // success for other phone

    const results = await sendStaffAlert(tenant, 'Partial failure test');

    // 401 is non-retryable → 1 call for failed, 1 call for success = 2 total
    expect(msgCalls()).toHaveLength(2);
    expect(results).toHaveLength(2);

    const failed  = results.filter(r => !r.ok);
    const success = results.filter(r =>  r.ok);

    expect(failed).toHaveLength(1);
    expect(success).toHaveLength(1);
    expect(failed[0].error).toBeDefined();
  });

  // ── Scenario 6 ──────────────────────────────────────────────────────────
  it('Scenario 6: no phones configured → 0 API calls', async () => {
    const tenant = makeTenant({ staff_phone: null, manager_phone: null });
    const results = await sendStaffAlert(tenant, 'Should not send');

    expect(msgCalls()).toHaveLength(0);
    expect(results).toHaveLength(0);
  });

  it('Scenario 6b: missing wa_phone_number_id → 0 API calls', async () => {
    const tenant = makeTenant({
      wa_phone_number_id: null,
      staff_phone:   STAFF_PHONE,
      manager_phone: MGR_PHONE,
    });
    const results = await sendStaffAlert(tenant, 'Should not send');

    expect(msgCalls()).toHaveLength(0);
    expect(results).toHaveLength(0);
  });

  it('Scenario 6c: missing wa_access_token → 0 API calls', async () => {
    const tenant = makeTenant({
      wa_access_token: null,
      staff_phone:   STAFF_PHONE,
      manager_phone: MGR_PHONE,
    });
    const results = await sendStaffAlert(tenant, 'Should not send');

    expect(msgCalls()).toHaveLength(0);
    expect(results).toHaveLength(0);
  });

  it('Both recipients fail → results carry errors, function does not throw', async () => {
    const tenant = makeTenant({ staff_phone: STAFF_PHONE, manager_phone: MGR_PHONE });
    // Use 401 (non-retryable) so each phone fails in exactly 1 attempt = 2 total calls
    responseQueue.push(() => makeErrorResponse(401, 'unauthorized'));
    responseQueue.push(() => makeErrorResponse(401, 'unauthorized'));

    const results = await sendStaffAlert(tenant, 'Full failure test');

    // 2 phones × 1 attempt each (401 is not retried) = 2 total fetch calls
    expect(msgCalls()).toHaveLength(2);
    expect(results).toHaveLength(2);
    expect(results.every(r => !r.ok)).toBe(true);
    expect(results.every(r => typeof r.error === 'string')).toBe(true);
  });

  it('Result shape: each result has phone (string), ok (boolean)', async () => {
    const tenant = makeTenant({ staff_phone: STAFF_PHONE, manager_phone: MGR_PHONE });
    const results = await sendStaffAlert(tenant, 'Shape test');

    for (const r of results) {
      expect(typeof r.phone).toBe('string');
      expect(r.phone.length).toBeGreaterThan(0);
      expect(typeof r.ok).toBe('boolean');
    }
  });

  it('Both sends use the correct wa_phone_number_id in the endpoint URL', async () => {
    const tenant = makeTenant({ staff_phone: STAFF_PHONE, manager_phone: MGR_PHONE });
    await sendStaffAlert(tenant, 'URL check');

    const mc = msgCalls();
    expect(mc).toHaveLength(2);
    for (const c of mc) {
      expect(c.url).toContain(WA_PHONE_ID);
    }
  });

  it('Both sends carry the exact same alert text body', async () => {
    const tenant = makeTenant({ staff_phone: STAFF_PHONE, manager_phone: MGR_PHONE });
    const alertText = '🚨 New escalation from customer +911234567890';
    await sendStaffAlert(tenant, alertText);

    const mc = msgCalls();
    expect(mc).toHaveLength(2);
    for (const c of mc) {
      expect((c.body as any).text?.body).toBe(alertText);
    }
  });

});
