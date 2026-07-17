/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('@/lib/redis/client', () => ({
  checkRedisRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 2 }),
}));

vi.mock('@/lib/audit/logger', () => ({
  logAudit: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRedisRateLimit } from '@/lib/redis/client';
import { logAudit } from '@/lib/audit/logger';

const OWNER = {
  id: 'u-1', tenant_id: 't-1', email: 'owner@acme.com', full_name: 'Owner',
  role: 'owner', is_sales_agent: false, is_platform_admin: false,
};
const STAFF = { ...OWNER, role: 'staff' };

// Projects rows down to the requested columns, the same way PostgREST's real
// .select('a, b') restricts what comes back — a mock that ignored this would
// let a test pass even if the route accidentally selected '*' on a table with
// secret columns (e.g. tenants.wa_access_token).
function project(row: Record<string, unknown>, columns: string): Record<string, unknown> {
  if (columns.trim() === '*') return row;
  const cols = columns.split(',').map(c => c.trim());
  const out: Record<string, unknown> = {};
  for (const c of cols) if (c in row) out[c] = row[c];
  return out;
}

function sectionChain(rows: Record<string, unknown>[] = [], error: { message: string } | null = null) {
  let selectedColumns = '*';
  const projectedRows = () => rows.map(r => project(r, selectedColumns));
  const chain: any = {
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: error ? null : projectedRows(), error })),
    single: vi.fn(() => Promise.resolve({ data: error ? null : (projectedRows()[0] ?? null), error })),
  };
  chain.select = vi.fn((cols: string) => { selectedColumns = cols; return chain; });
  return chain;
}

function mockAllTables(overrides: Record<string, ReturnType<typeof sectionChain>> = {}) {
  (supabaseAdmin.from as any).mockImplementation((table: string) => {
    if (overrides[table]) return overrides[table];
    return sectionChain([]);
  });
}

describe('GET /api/dashboard/settings/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (checkRedisRateLimit as any).mockResolvedValue({ allowed: true, remaining: 2 });
  });

  function req() {
    return new NextRequest('http://localhost/api/dashboard/settings/export');
  }

  it('rejects unauthenticated requests', async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    const { GET } = await import('@/app/api/dashboard/settings/export/route');
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('rejects roles below owner/admin', async () => {
    (getCurrentUser as any).mockResolvedValue(STAFF);
    const { GET } = await import('@/app/api/dashboard/settings/export/route');
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it('enforces the 3/day rate limit', async () => {
    (getCurrentUser as any).mockResolvedValue(OWNER);
    (checkRedisRateLimit as any).mockResolvedValue({ allowed: false, remaining: 0 });
    const { GET } = await import('@/app/api/dashboard/settings/export/route');
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(checkRedisRateLimit).toHaveBeenCalledWith('export:full:t-1', 3, 86400);
  });

  it('returns a downloadable JSON bundle, excludes WhatsApp secrets, and logs the export', async () => {
    (getCurrentUser as any).mockResolvedValue(OWNER);
    mockAllTables({
      tenants: sectionChain([{
        id: 't-1', business_name: 'Acme', wa_access_token: 'should-never-appear', wa_app_secret: 'nor-this',
      }]),
      leads: sectionChain([{ id: 'l-1', name: 'Jane' }]),
      messages: sectionChain([{ id: 'm-1', content: 'hi' }]),
    });

    const { GET } = await import('@/app/api/dashboard/settings/export/route');
    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-type')).toContain('application/json');

    const text = await res.text();
    expect(text).not.toContain('should-never-appear');
    expect(text).not.toContain('nor-this');

    const body = JSON.parse(text);
    expect(body.businessName).toBe('Acme');
    expect(body.leads.rows).toEqual([{ id: 'l-1', name: 'Jane' }]);
    expect(body.messages.rows).toEqual([{ id: 'm-1', content: 'hi' }]);

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 't-1', action: 'data_export_requested', entity_id: 't-1' })
    );
  });

  it('degrades gracefully when one section table errors, instead of failing the whole export', async () => {
    (getCurrentUser as any).mockResolvedValue(OWNER);
    mockAllTables({
      tenants: sectionChain([{ id: 't-1', business_name: 'Acme' }]),
      notes: sectionChain([], { message: 'relation "notes" does not exist' }),
    });

    const { GET } = await import('@/app/api/dashboard/settings/export/route');
    const res = await GET(req());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toEqual([]);
  });

  it('marks a section truncated when it exceeds the row cap', async () => {
    (getCurrentUser as any).mockResolvedValue(OWNER);
    const bigMessages = Array.from({ length: 20001 }, (_, i) => ({ id: `m-${i}` }));
    mockAllTables({
      tenants: sectionChain([{ id: 't-1', business_name: 'Acme' }]),
      messages: sectionChain(bigMessages),
    });

    const { GET } = await import('@/app/api/dashboard/settings/export/route');
    const res = await GET(req());
    const body = await res.json();

    expect(body.messages.truncated).toBe(true);
    expect(body.messages.rows.length).toBe(20000);
  });
});
