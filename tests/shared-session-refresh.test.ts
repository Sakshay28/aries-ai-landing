/* eslint-disable @typescript-eslint/no-explicit-any */
// 2026-11-21: every dashboard API call refreshed the Supabase session on its own
// (refreshed cookies are never saved), tripping Supabase Auth's refresh limits:
// 401 "Too many concurrent token refresh requests on the same session" /
// "Request rate limit reached" on every route for ~5 minutes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServerClient } from '@supabase/ssr';
import { sharedRefreshFetch, resetSharedRefreshCache } from '@/lib/supabase/shared-session-refresh';

const SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const REFRESH_URL = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'owner@example.com',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-09-12T12:33:07Z',
};

function jwt(expSecondsFromNow: number, sid = 'session-1'): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, exp: now + expSecondsFromNow, iat: now, session_id: sid, role: 'authenticated' })}.sig`;
}

function refreshBody(token: string) {
  return JSON.stringify({ refresh_token: token });
}

function sessionJson(refreshToken: string) {
  return {
    access_token: jwt(3600),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: refreshToken,
    user: USER,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let network: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetSharedRefreshCache();
  network = vi.fn();
  vi.stubGlobal('fetch', network);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sharedRefreshFetch', () => {
  it('sends ONE refresh for concurrent requests with the same refresh token', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    network.mockImplementation(async () => { await gate; return jsonResponse(sessionJson('R1')); });

    const calls = Array.from({ length: 6 }, () =>
      sharedRefreshFetch(REFRESH_URL, { method: 'POST', body: refreshBody('R0') }));
    release();
    const responses = await Promise.all(calls);

    expect(network).toHaveBeenCalledTimes(1);
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect((await res.json()).refresh_token).toBe('R1');
    }
  });

  it('reuses a successful refresh for later requests instead of calling Supabase again', async () => {
    network.mockImplementation(async () => jsonResponse(sessionJson('R1')));
    await sharedRefreshFetch(REFRESH_URL, { method: 'POST', body: refreshBody('R0') });
    const again = await sharedRefreshFetch(REFRESH_URL, { method: 'POST', body: refreshBody('R0') });
    expect(network).toHaveBeenCalledTimes(1);
    expect((await again.json()).refresh_token).toBe('R1');
  });

  it('keeps different sessions apart', async () => {
    network.mockImplementation(async (_url: string, init: RequestInit) =>
      jsonResponse(sessionJson(`next-${JSON.parse(init.body as string).refresh_token}`)));
    const a = await sharedRefreshFetch(REFRESH_URL, { method: 'POST', body: refreshBody('A0') });
    const b = await sharedRefreshFetch(REFRESH_URL, { method: 'POST', body: refreshBody('B0') });
    expect(network).toHaveBeenCalledTimes(2);
    expect((await a.json()).refresh_token).toBe('next-A0');
    expect((await b.json()).refresh_token).toBe('next-B0');
  });

  it('does not remember a failed refresh', async () => {
    network
      .mockResolvedValueOnce(jsonResponse({ code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }, 429))
      .mockResolvedValueOnce(jsonResponse(sessionJson('R1')));
    const first = await sharedRefreshFetch(REFRESH_URL, { method: 'POST', body: refreshBody('R0') });
    expect(first.status).toBe(429);
    const second = await sharedRefreshFetch(REFRESH_URL, { method: 'POST', body: refreshBody('R0') });
    expect(second.status).toBe(200);
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('stops reusing a refresh shortly before its access token expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      network.mockImplementation(async () => jsonResponse(sessionJson('R1')));
      await sharedRefreshFetch(REFRESH_URL, { method: 'POST', body: refreshBody('R0') });
      vi.setSystemTime(Date.now() + 54 * 60_000);
      await sharedRefreshFetch(REFRESH_URL, { method: 'POST', body: refreshBody('R0') });
      expect(network).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 2 * 60_000); // 56 min: inside the 5-min safety margin
      await sharedRefreshFetch(REFRESH_URL, { method: 'POST', body: refreshBody('R0') });
      expect(network).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes every other request straight through', async () => {
    network.mockImplementation(async () => jsonResponse({ ok: true }));
    await sharedRefreshFetch(`${SUPABASE_URL}/auth/v1/user`, { method: 'GET' });
    await sharedRefreshFetch(`${SUPABASE_URL}/auth/v1/user`, { method: 'GET' });
    await sharedRefreshFetch(`${SUPABASE_URL}/rest/v1/users?select=*`, { method: 'GET' });
    await sharedRefreshFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', body: '{}' });
    expect(network).toHaveBeenCalledTimes(4);
  });
});

describe('real @supabase/ssr server client with an expired session cookie', () => {
  const COOKIE_NAME = 'sb-abcdefghijklmnopqrst-auth-token';

  function expiredSessionCookie() {
    const session = {
      access_token: jwt(-600), // expired 10 min ago
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) - 600,
      refresh_token: 'R0',
      user: USER,
    };
    return { name: COOKIE_NAME, value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}` };
  }

  function clientForOneRequest() {
    const cookie = expiredSessionCookie();
    return createServerClient(SUPABASE_URL, 'anon-key', {
      global: { fetch: sharedRefreshFetch },
      cookies: { getAll: () => [cookie], setAll: () => {} },
    });
  }

  it('many dashboard requests from one session cost Supabase a single refresh', async () => {
    network.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('grant_type=refresh_token')) return jsonResponse(sessionJson('R1'));
      if (url.endsWith('/auth/v1/user')) return jsonResponse(USER);
      throw new Error(`unexpected ${url}`);
    });

    // e.g. the inbox's parallel polls: conversations, digest, statuses, new-messages, team…
    const results = await Promise.all(
      Array.from({ length: 8 }, () => clientForOneRequest().auth.getUser()),
    );
    // …and a later poll from the same browser, still sending the old cookie.
    results.push(await clientForOneRequest().auth.getUser());

    for (const { data, error } of results) {
      expect(error).toBeNull();
      expect(data.user?.id).toBe(USER.id);
    }
    const refreshCalls = network.mock.calls.filter(([u]) => String(typeof u === 'string' ? u : (u as any).url ?? u).includes('grant_type=refresh_token'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('still rejects a session Supabase says is gone', async () => {
    network.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('grant_type=refresh_token')) return jsonResponse(sessionJson('R1'));
      if (url.endsWith('/auth/v1/user')) {
        return jsonResponse({ code: 403, error_code: 'session_not_found', msg: 'Session from session_id claim in JWT does not exist' }, 403);
      }
      throw new Error(`unexpected ${url}`);
    });
    const { data, error } = await clientForOneRequest().auth.getUser();
    expect(data.user).toBeNull();
    expect(error).not.toBeNull();
  });
});
