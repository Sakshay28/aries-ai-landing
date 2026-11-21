/* eslint-disable @typescript-eslint/no-explicit-any */
// 2026-11-21: one free-plan DB stall (Postgres 57014 statement timeout) blanked
// Adventure Island's inbox. Read paths on the inbox now retry such errors once.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/getCurrentUser', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/alerts/admin', () => ({ notifyAdmin: vi.fn(() => Promise.resolve()) }));

import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isTransientDbError, withTransientRetry } from '@/lib/supabase/transient-retry';
import { GET as getConversations } from '@/app/api/dashboard/chat/conversations/route';
import { GET as getDigest } from '@/app/api/dashboard/chat/conversations/digest/route';

const STATEMENT_TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' };

// A supabase-js style query builder: every chained call returns itself and
// awaiting it yields the next queued result.
function queryReturning(results: any[]) {
  const calls = { count: 0 };
  const make = () => {
    const builder: any = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in', 'single']) builder[m] = () => builder;
    builder.then = (resolve: any, reject: any) => {
      const r = results[Math.min(calls.count, results.length - 1)];
      calls.count++;
      return Promise.resolve(r).then(resolve, reject);
    };
    return builder;
  };
  return { make, calls };
}

describe('isTransientDbError', () => {
  it('treats timeouts, dropped connections and network failures as transient', () => {
    expect(isTransientDbError(STATEMENT_TIMEOUT)).toBe(true);
    expect(isTransientDbError({ code: '08006', message: 'connection failure' })).toBe(true);
    expect(isTransientDbError({ code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' })).toBe(true);
    expect(isTransientDbError({ code: '', message: 'TypeError: fetch failed' })).toBe(true);
    expect(isTransientDbError({ message: '504 Gateway Timeout' })).toBe(true);
  });

  it('does not retry real query errors or "no rows"', () => {
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
    expect(isTransientDbError({ code: '42703', message: 'column tenants.phone_number_id does not exist' })).toBe(false);
    expect(isTransientDbError({ code: '42703', message: 'column network_id does not exist' })).toBe(false);
    expect(isTransientDbError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toBe(false);
    expect(isTransientDbError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
  });
});

describe('withTransientRetry', () => {
  it('retries once after a statement timeout and returns the second result', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({ data: null, error: STATEMENT_TIMEOUT })
      .mockResolvedValueOnce({ data: [1], error: null });
    const res = await withTransientRetry(run, 1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ data: [1], error: null });
  });

  it('does not retry a non-transient error', async () => {
    const run = vi.fn().mockResolvedValue({ data: null, error: { code: '42703', message: 'bad column' } });
    const res = await withTransientRetry(run, 1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(res.error?.code).toBe('42703');
  });

  it('tries at most twice and hands back the last error', async () => {
    const run = vi.fn().mockResolvedValue({ data: null, error: STATEMENT_TIMEOUT });
    const res = await withTransientRetry(run, 1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(res.error?.code).toBe('57014');
  });

  it('does not retry a success', async () => {
    const run = vi.fn().mockResolvedValue({ data: [], error: null });
    await withTransientRetry(run, 1);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('chat inbox routes survive one DB stall', () => {
  const ME = { id: 'u-1', tenant_id: 't-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentUser as any).mockResolvedValue(ME);
  });

  it('GET /api/dashboard/chat/conversations returns the list after a timed-out first query', async () => {
    const convo = {
      id: 'c-1', last_message_at: '2026-11-21T13:25:00Z', is_active: true, bot_paused: false,
      sender_id: '919000000001', lead_id: 'l-1', escalated: false, message_count: 3,
      last_message_preview: 'hi', last_message_type: 'text',
    };
    const conversations = queryReturning([
      { data: null, error: STATEMENT_TIMEOUT, count: null },
      { data: [convo], error: null, count: 1 },
    ]);
    const leads = queryReturning([
      { data: [{ id: 'l-1', name: 'Asha', phone: '919000000001', assigned_to: 'u-1' }], error: null },
    ]);
    (supabaseAdmin.from as any).mockImplementation((table: string) =>
      table === 'conversations' ? conversations.make() : leads.make());

    const res = await getConversations(new NextRequest('http://localhost/api/dashboard/chat/conversations'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].assigned_to).toBe('u-1');
    expect(conversations.calls.count).toBe(2);
  });

  it('still reports a 500 when the DB stays stalled (so the sidebar keeps retrying)', async () => {
    const conversations = queryReturning([{ data: null, error: STATEMENT_TIMEOUT, count: null }]);
    (supabaseAdmin.from as any).mockImplementation(() => conversations.make());

    const res = await getConversations(new NextRequest('http://localhost/api/dashboard/chat/conversations'));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
    expect(conversations.calls.count).toBe(2);
  });

  it('GET /api/dashboard/chat/conversations/digest retries a timed-out probe', async () => {
    const q = queryReturning([
      { data: null, error: STATEMENT_TIMEOUT, count: null },
      { data: [{ last_message_at: '2026-11-21T13:25:00Z' }], error: null, count: 4638 },
    ]);
    (supabaseAdmin.from as any).mockImplementation(() => q.make());

    const res = await getDigest();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, count: 4638, maxTs: '2026-11-21T13:25:00Z' });
    expect(q.calls.count).toBe(2);
  });
});
