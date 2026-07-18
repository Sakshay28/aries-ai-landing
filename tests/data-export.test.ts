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

  it('strips internal tracking fields and null noise from exported rows', async () => {
    (getCurrentUser as any).mockResolvedValue(OWNER);
    mockAllTables({
      tenants: sectionChain([{ id: 't-1', business_name: 'Acme' }]),
      leads: sectionChain([{
        id: 'l-1',
        name: 'Jane',
        phone: '+919999999999',
        lead_status: 'hot',
        ai_score: 82,
        ai_summary: 'Ready to book, asked about dates twice.',
        // Everything below is exactly the kind of internal/technical noise
        // reported as making the export unreadable — should all be dropped.
        meta_campaign_id: null,
        meta_ad_id: null,
        meta_adset_id: null,
        fbclid: null,
        ctwa_clid: null,
        feature_flag_overrides: null,
        wa_contact_synced_at: null,
        score_breakdown: {},
        scoring_reasoning: null,
        manual_status: null,
        manual_status_at: null,
        manual_status_by: null,
        auto_status: 'new',
        ai_buying_intent: null,
        ai_urgency: null,
        ai_trust: null,
        ai_engagement: null,
        ai_conversion_probability: null,
        ai_sales_stage: null,
        ai_confidence: null,
        ai_momentum: null,
        ai_objections: null,
        ai_recommendation: null,
        ai_explanation: null,
        ai_last_analyzed_at: null,
        ai_group_booking: null,
        ai_group_size: null,
        assigned_at: null,
        buying_signals: [],
        negative_signals: [],
        tenant_id: 't-1',
      }]),
    });

    const { GET } = await import('@/app/api/dashboard/settings/export/route');
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    const [lead] = body.leads.rows;

    // Meaningful, human-readable fields survive.
    expect(lead).toMatchObject({
      id: 'l-1', name: 'Jane', phone: '+919999999999', lead_status: 'hot',
      ai_score: 82, ai_summary: 'Ready to book, asked about dates twice.',
    });

    // Internal, technical, or null fields are gone.
    const droppedKeys = [
      'meta_campaign_id', 'meta_ad_id', 'meta_adset_id', 'fbclid', 'ctwa_clid',
      'feature_flag_overrides', 'wa_contact_synced_at', 'score_breakdown', 'scoring_reasoning',
      'manual_status', 'manual_status_at', 'manual_status_by', 'auto_status',
      'ai_buying_intent', 'ai_urgency', 'ai_trust', 'ai_engagement', 'ai_conversion_probability',
      'ai_sales_stage', 'ai_confidence', 'ai_momentum', 'ai_objections', 'ai_recommendation',
      'ai_explanation', 'ai_last_analyzed_at', 'ai_group_booking', 'ai_group_size', 'assigned_at',
      'buying_signals', 'negative_signals', 'tenant_id',
    ];
    for (const key of droppedKeys) {
      expect(lead).not.toHaveProperty(key);
    }
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
