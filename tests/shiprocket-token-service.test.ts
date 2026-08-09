/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '@/lib/supabase/admin';
import { ShiprocketClient } from '@/lib/shiprocket/client';
import { encryptTokenV2 } from '@/lib/security/keyManager';
import { getValidShiprocketToken } from '@/lib/shiprocket/service';

function thenable(result: { data: unknown; error: unknown }) {
  const builder: any = {};
  const chainMethods = ['select', 'eq', 'in', 'order', 'limit', 'range', 'insert', 'update', 'delete'];
  for (const m of chainMethods) builder[m] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe('getValidShiprocketToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reuses a cached token that is still valid (past the refresh buffer)', async () => {
    const farFutureExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    (supabaseAdmin.from as any).mockReturnValue(thenable({
      data: { email: 'a@b.com', password_enc: encryptTokenV2('pw'), auth_token_enc: encryptTokenV2('cached-jwt'), token_expires_at: farFutureExpiry },
      error: null,
    }));
    const loginSpy = vi.spyOn(ShiprocketClient, 'login');

    const token = await getValidShiprocketToken('tenant-1');

    expect(token).toBe('cached-jwt');
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it('re-authenticates when the stored token is expired', async () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    let updateCalled = false;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table !== 'shiprocket_connections') return thenable({ data: null, error: null });
      const builder = thenable({
        data: { email: 'a@b.com', password_enc: encryptTokenV2('pw'), auth_token_enc: null, token_expires_at: pastExpiry },
        error: null,
      });
      const originalUpdate = builder.update;
      builder.update = vi.fn((...args: unknown[]) => { updateCalled = true; return originalUpdate(...args); });
      return builder;
    });
    vi.spyOn(ShiprocketClient, 'login').mockResolvedValue({ token: 'fresh-jwt' });

    const token = await getValidShiprocketToken('tenant-1');

    expect(token).toBe('fresh-jwt');
    expect(updateCalled).toBe(true);
  });

  it('also re-authenticates when within the 1-day refresh buffer even though not technically expired', async () => {
    const almostExpired = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(); // 6h out, inside the 1-day buffer
    (supabaseAdmin.from as any).mockReturnValue(thenable({
      data: { email: 'a@b.com', password_enc: encryptTokenV2('pw'), auth_token_enc: encryptTokenV2('stale-jwt'), token_expires_at: almostExpired },
      error: null,
    }));
    vi.spyOn(ShiprocketClient, 'login').mockResolvedValue({ token: 'refreshed-jwt' });

    const token = await getValidShiprocketToken('tenant-1');

    expect(token).toBe('refreshed-jwt');
  });

  it('sets status=error and returns null on login failure, without throwing', async () => {
    (supabaseAdmin.from as any).mockReturnValue(thenable({
      data: { email: 'a@b.com', password_enc: encryptTokenV2('pw'), auth_token_enc: null, token_expires_at: null },
      error: null,
    }));
    vi.spyOn(ShiprocketClient, 'login').mockRejectedValue(new Error('Invalid email or password'));

    const token = await getValidShiprocketToken('tenant-1');

    expect(token).toBeNull();
  });

  it('returns null when there is no connection row for the tenant', async () => {
    (supabaseAdmin.from as any).mockReturnValue(thenable({ data: null, error: null }));

    const token = await getValidShiprocketToken('tenant-without-connection');

    expect(token).toBeNull();
  });
});
