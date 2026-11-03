// Identity must come from the verified session. middleware.ts does not run in this
// app, so a client can send any x-verified-user-id it likes.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  planStatus: 'active',
  lookedUp: [] as string[],
}));

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(fn: T) => fn }));
vi.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: 'u', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k' }, isSupabaseConfigured: true }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-verified-user-id': 'victim-auth-id' }),
  cookies: async () => ({ getAll: () => [] }),
}));
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.sessionUserId ? { id: state.sessionUserId } : null },
        error: null,
      }),
    },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (_col: string, value: string) => { state.lookedUp.push(value); return chain; };
      chain.single = async () => ({
        data: { tenant_id: `tenant-of-${state.lookedUp.at(-1)}`, is_platform_admin: false, tenants: { plan_status: state.planStatus } },
        error: null,
      });
      return chain;
    },
  },
}));

import { getTenantId } from '@/lib/auth/getTenantId';

describe('getTenantId', () => {
  beforeEach(() => {
    state.sessionUserId = null;
    state.planStatus = 'active';
    state.lookedUp = [];
  });

  it('denies a request that only has a forged x-verified-user-id header', async () => {
    expect(await getTenantId()).toBeNull();
    expect(state.lookedUp).toEqual([]);
  });

  it('uses the session user, not the header', async () => {
    state.sessionUserId = 'real-auth-id';
    expect(await getTenantId()).toBe('tenant-of-real-auth-id');
  });

  it('locks out a paused account', async () => {
    state.sessionUserId = 'real-auth-id';
    state.planStatus = 'suspended';
    expect(await getTenantId()).toBeNull();
  });
});
