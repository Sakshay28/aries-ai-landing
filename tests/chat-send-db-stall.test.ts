/* eslint-disable @typescript-eslint/no-explicit-any */
// 2026-11-23: Adventure Island's operator "had to try 4-5 times" to send a
// reply. One cause: a free-plan DB stall cancelled the send's INSERT (57014)
// and the route returned 500 "Failed to store message". The route now retries
// a write once — but only when Postgres guarantees the first try did not commit.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: vi.fn() }));
vi.mock('@/lib/auth/getTenantId', () => ({ getTenantId: vi.fn(async () => 'tenant-1') }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/whatsapp/credentialHealth.server', () => ({ noteSendFailure: vi.fn() }));
vi.mock('@/lib/instagram/service', () => ({ sendInstagramMessage: vi.fn() }));

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isUncommittedWriteError, withUncommittedWriteRetry } from '@/lib/supabase/transient-retry';
import { POST as send } from '@/app/api/chat/send/route';

const STATEMENT_TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' };
const CONNECTION_LOST = { code: '08006', message: 'connection failure' };

// Chainable supabase-js stand-in; awaiting it yields the next queued result.
function builder(results: any[], calls: { n: number }) {
  const b: any = {};
  for (const m of ['select', 'eq', 'single', 'insert', 'update']) b[m] = () => b;
  b.then = (resolve: any, reject: any) => {
    const r = results[Math.min(calls.n, results.length - 1)];
    calls.n++;
    return Promise.resolve(r).then(resolve, reject);
  };
  return b;
}

const CONV = { data: { id: 'c1', sender_id: '919999999999', tenant_id: 'tenant-1', channel: 'whatsapp', leads: { phone: '919999999999' } }, error: null };
const TENANT = { data: { wa_access_token: 'enc', wa_phone_number_id: 'pn1', business_name: 'AI' }, error: null };
const INSERTED = { data: { id: 'm1', content: 'hi' }, error: null };

function wire(opts: { conv?: any[]; tenant?: any[]; insert: any[] }) {
  const calls = { conv: { n: 0 }, tenant: { n: 0 }, insert: { n: 0 } };
  (createServerSupabaseClient as any).mockResolvedValue({
    from: () => builder(opts.conv ?? [CONV], calls.conv),
  });
  (supabaseAdmin.from as any).mockImplementation((table: string) => {
    if (table === 'tenants') return builder(opts.tenant ?? [TENANT], calls.tenant);
    if (table === 'messages') return builder(opts.insert, calls.insert);
    throw new Error('unexpected table ' + table);
  });
  return calls;
}

const req = () => new NextRequest('http://localhost/api/chat/send', {
  method: 'POST',
  body: JSON.stringify({ conversationId: 'c1', message: 'hi' }),
});

describe('isUncommittedWriteError', () => {
  it('accepts only errors where Postgres guarantees nothing committed', () => {
    expect(isUncommittedWriteError(STATEMENT_TIMEOUT)).toBe(true);
    expect(isUncommittedWriteError({ code: '40P01', message: 'deadlock detected' })).toBe(true);
    expect(isUncommittedWriteError({ code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' })).toBe(true);
  });

  it('rejects ambiguous failures, where the write may already have landed', () => {
    expect(isUncommittedWriteError(CONNECTION_LOST)).toBe(false);
    expect(isUncommittedWriteError({ code: '', message: 'TypeError: fetch failed' })).toBe(false);
    expect(isUncommittedWriteError({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(isUncommittedWriteError(null)).toBe(false);
  });

  it('withUncommittedWriteRetry runs the write at most twice', async () => {
    const run = vi.fn(async () => ({ error: STATEMENT_TIMEOUT }));
    const r = await withUncommittedWriteRetry(run, 0);
    expect(run).toHaveBeenCalledTimes(2);
    expect(r.error).toEqual(STATEMENT_TIMEOUT);
  });
});

describe('POST /api/chat/send during a DB stall', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores the message when the first INSERT hits a statement timeout', async () => {
    const calls = wire({ insert: [{ data: null, error: STATEMENT_TIMEOUT }, INSERTED] });
    const res = await send(req());
    expect(res.status).toBe(200);
    expect((await res.json()).messageId).toBe('m1');
    expect(calls.insert.n).toBe(2);
  });

  it('never re-sends an INSERT whose outcome is unknown', async () => {
    const calls = wire({ insert: [{ data: null, error: CONNECTION_LOST }, INSERTED] });
    const res = await send(req());
    expect(res.status).toBe(500);
    expect(calls.insert.n).toBe(1);
  });

  it('retries the conversation lookup instead of answering "Conversation not found"', async () => {
    const calls = wire({ conv: [{ data: null, error: STATEMENT_TIMEOUT }, CONV], insert: [INSERTED] });
    const res = await send(req());
    expect(res.status).toBe(200);
    expect(calls.conv.n).toBe(2);
  });
});
