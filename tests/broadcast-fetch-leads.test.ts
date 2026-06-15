// ═══════════════════════════════════════════════════════════
// 🧪 fetch-leads — pagination past the PostgREST row cap (C5)
// Run: npx vitest run tests/broadcast-fetch-leads.test.ts
// ═══════════════════════════════════════════════════════════
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchLeadsByFilter, fetchLeadsByIds } from '@/lib/broadcast/fetch-leads';
import { supabaseAdmin } from '@/lib/supabase/admin';

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: { from: vi.fn() } }));

const makeLeads = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: String(start + i), phone: `9${start + i}` }));

beforeEach(() => vi.restoreAllMocks());

describe('fetchLeadsByFilter — pages through >1000 rows', () => {
  it('returns every matching row, not just the first page', async () => {
    // 2,500 contacts → server returns pages of 1000, 1000, 500.
    const pages = [makeLeads(1, 1000), makeLeads(1001, 1000), makeLeads(2001, 500)];
    let pageIdx = 0;

    vi.spyOn(supabaseAdmin, 'from').mockImplementation(() => {
      const chain: any = {};
      for (const m of ['select', 'eq', 'not', 'overlaps', 'order', 'limit', 'gt', 'in']) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.then = (resolve: any) => resolve({ data: pages[pageIdx++] ?? [], error: null });
      return chain;
    });

    const res = await fetchLeadsByFilter('tenant-1', 'id, phone');
    expect(res).toHaveLength(2500);              // ← would be 1000 before the fix
    expect(res[0].id).toBe('1');
    expect(res[2499].id).toBe('2500');
  });

  it('stops after a single partial page (no infinite loop)', async () => {
    let calls = 0;
    vi.spyOn(supabaseAdmin, 'from').mockImplementation(() => {
      const chain: any = {};
      for (const m of ['select', 'eq', 'not', 'overlaps', 'order', 'limit', 'gt', 'in']) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.then = (resolve: any) => { calls++; resolve({ data: makeLeads(1, 42), error: null }); };
      return chain;
    });

    const res = await fetchLeadsByFilter('tenant-1', 'id, phone');
    expect(res).toHaveLength(42);
    expect(calls).toBe(1);
  });
});

describe('fetchLeadsByIds — chunks large id lists', () => {
  it('fetches all ids across 500-id chunks', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => String(i + 1));
    let chunkCalls = 0;

    vi.spyOn(supabaseAdmin, 'from').mockImplementation(() => {
      const chain: any = {};
      for (const m of ['select', 'eq', 'not', 'overlaps', 'order', 'limit', 'gt']) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      chain.in = vi.fn((_col: string, arr: string[]) => { chain._ids = arr; return chain; });
      chain.then = (resolve: any) => {
        chunkCalls++;
        resolve({ data: (chain._ids || []).map((id: string) => ({ id, phone: `9${id}` })), error: null });
      };
      return chain;
    });

    const res = await fetchLeadsByIds('tenant-1', 'id, phone', ids);
    expect(res).toHaveLength(1200);             // ← would silently cap before the fix
    expect(chunkCalls).toBe(3);                 // 500 + 500 + 200
  });
});
