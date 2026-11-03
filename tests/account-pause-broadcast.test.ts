// A paused account's broadcast is held for after the restore: recipients must not
// be marked failed, nothing is sent, and the rows leave the global claim for a while
// so a paused campaign cannot starve other tenants.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  planStatus: 'suspended',
  updates: [] as Array<{ table: string; values: Record<string, unknown>; ids?: string[] }>,
  sendTemplateMessage: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.single = async () => ({
        data: { wa_access_token: 'enc', wa_phone_number_id: 'P1', timezone: 'Asia/Kolkata', plan_status: state.planStatus },
        error: null,
      });
      chain.update = (values: Record<string, unknown>) => ({
        in: async (_col: string, ids: string[]) => {
          state.updates.push({ table, values, ids });
          return { error: null };
        },
      });
      return chain;
    }),
  },
}));
vi.mock('@/lib/meta/service', () => ({
  sendTemplateMessage: state.sendTemplateMessage,
  MetaApiError: class extends Error {},
  explainMetaError: (e: unknown) => String(e),
}));

import { BroadcastEngineService } from '@/lib/broadcast/services/broadcast-engine.service';

describe('broadcast engine: paused account', () => {
  beforeEach(() => {
    state.updates = [];
    state.sendTemplateMessage.mockReset();
  });

  it('hands the batch back as pending, delayed, and sends nothing', async () => {
    const before = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processed = await (BroadcastEngineService as any).processItemsForTenant('t1', [
      { id: 'q1', campaign_id: 'c1' },
      { id: 'q2', campaign_id: 'c1' },
    ]);

    expect(processed).toBe(0);
    expect(state.sendTemplateMessage).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(1);

    const [{ table, values, ids }] = state.updates;
    expect(table).toBe('broadcast_queue');
    expect(ids).toEqual(['q1', 'q2']);
    expect(values.status).toBe('pending');
    expect(values.locked_at).toBeNull();
    expect(values).not.toHaveProperty('failure_reason');
    expect(new Date(values.next_attempt_at as string).getTime()).toBeGreaterThan(before + 30 * 60 * 1000);
  });
});
