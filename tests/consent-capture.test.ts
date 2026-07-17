/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Shared mocks ───────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: vi.fn(),
        generateLink: vi.fn(),
        deleteUser: vi.fn(),
      },
    },
    from: vi.fn(),
  },
}));

vi.mock('@/lib/redis/client', () => ({
  checkRedisRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 5 }),
}));

vi.mock('@/lib/auth/events', () => ({
  logAuthEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/legal/consent', () => ({
  recordConsent: vi.fn().mockResolvedValue(undefined),
  CURRENT_POLICY_VERSION: '2026-05-07',
}));

vi.mock('@/lib/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    GOOGLE_CLIENT_ID: 'test-client-id',
  },
  isSupabaseConfigured: true,
}));

const mockGetUser = vi.fn();
const mockSignInWithIdToken = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockGetUser, signInWithIdToken: mockSignInWithIdToken },
  })),
}));

import { supabaseAdmin } from '@/lib/supabase/admin';
import { recordConsent } from '@/lib/legal/consent';

// A single mock "row" chain that's both chainable (select/eq/etc return
// itself) AND thenable, so `await x.insert(...)` and `x.insert(...).then(cb)`
// (the fire-and-forget analytics_events pattern used across these routes)
// both resolve without needing a real Postgres round trip.
function chain(overrides: Record<string, any> = {}) {
  const c: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve: (v: { data: null; error: null }) => void) => resolve({ data: null, error: null }),
    ...overrides,
  };
  return c;
}

describe('POST /api/auth/provision — consent gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-1', email: 'owner@acme.com' } }, error: null });
  });

  function makeReq(body: Record<string, unknown>) {
    return {
      json: () => Promise.resolve(body),
      cookies: { getAll: () => [] },
      headers: { get: () => 'unknown' },
    } as any;
  }

  it('rejects when consentAccepted is missing, without ever creating a tenant', async () => {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'users') return chain({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
      return chain();
    });
    const { POST } = await import('@/app/api/auth/provision/route');
    const res = await POST(makeReq({ email: 'owner@acme.com', fullName: 'Owner' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Terms of Service');
    const tenantsCalls = (supabaseAdmin.from as any).mock.calls.filter((c: any[]) => c[0] === 'tenants');
    expect(tenantsCalls.length).toBe(0);
  });

  it('rejects when consentAccepted is false', async () => {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'users') return chain({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
      return chain();
    });
    const { POST } = await import('@/app/api/auth/provision/route');
    const res = await POST(makeReq({ email: 'owner@acme.com', fullName: 'Owner', consentAccepted: false }));
    expect(res.status).toBe(400);
  });

  it('does not re-demand consent when the account is already provisioned', async () => {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'users') return chain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'u-1', tenant_id: 't-existing' }, error: null }) });
      return chain();
    });
    const { POST } = await import('@/app/api/auth/provision/route');
    const res = await POST(makeReq({ email: 'owner@acme.com', fullName: 'Owner' })); // no consentAccepted at all
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenantId).toBe('t-existing');
  });

  it('records consent after successfully provisioning when consentAccepted is true', async () => {
    const { POST } = await import('@/app/api/auth/provision/route');

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'users') return chain({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
      if (table === 'tenants') return chain({ single: vi.fn().mockResolvedValue({ data: { id: 't-9' }, error: null }) });
      return chain();
    });

    const res = await POST(makeReq({ email: 'owner@acme.com', fullName: 'Owner', businessName: 'Acme', consentAccepted: true }));

    expect(res.status).toBe(200);
    expect(recordConsent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't-9', email: 'owner@acme.com', source: 'otp_signup' })
    );
  });

  it('rolls back the tenant and user if consent recording fails', async () => {
    (recordConsent as any).mockRejectedValueOnce(new Error('insert failed'));
    const { POST } = await import('@/app/api/auth/provision/route');

    const tenantDelete = vi.fn().mockReturnThis();
    const userDelete = vi.fn().mockReturnThis();
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'users') return chain({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), delete: userDelete });
      if (table === 'tenants') return chain({ single: vi.fn().mockResolvedValue({ data: { id: 't-9' }, error: null }), delete: tenantDelete });
      return chain();
    });

    const res = await POST(makeReq({ email: 'owner@acme.com', fullName: 'Owner', businessName: 'Acme', consentAccepted: true }));

    expect(res.status).toBe(500);
    expect(tenantDelete).toHaveBeenCalled();
    expect(userDelete).toHaveBeenCalled();
  });
});

describe('POST /api/auth/signup (legacy) — consent gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-key';
  });

  function makeReq(body: Record<string, unknown>) {
    return new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const VALID_BASE = {
    email: 'owner@acme.com',
    password: 'password123',
    fullName: 'Owner Name',
    businessName: 'Acme Co',
  };

  it('rejects signup without consentAccepted', async () => {
    const { POST } = await import('@/app/api/auth/signup/route');
    const res = await POST(makeReq(VALID_BASE) as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Terms of Service');
  });

  it('records consent on a successful signup', async () => {
    const { POST } = await import('@/app/api/auth/signup/route');

    (supabaseAdmin.auth.admin.createUser as any).mockResolvedValue({ data: { user: { id: 'auth-1' } }, error: null });
    (supabaseAdmin.auth.admin.generateLink as any).mockResolvedValue({ data: {}, error: null }); // no action_link → skips real Resend call
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ single: vi.fn().mockResolvedValue({ data: { id: 't-5' }, error: null }) });
      return chain();
    });

    const res = await POST(makeReq({ ...VALID_BASE, consentAccepted: true }) as any);

    expect(res.status).toBe(200);
    expect(recordConsent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't-5', email: 'owner@acme.com', source: 'password_signup' })
    );
  });
});

describe('GET /api/auth/google — consent cookie', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets google_oauth_consent cookie only when ?consent=1 is present', async () => {
    const { GET } = await import('@/app/api/auth/google/route');

    const withConsent = await GET(new NextRequest('http://localhost/api/auth/google?consent=1'));
    expect(withConsent.cookies.get('google_oauth_consent')?.value).toBe('1');

    const withoutConsent = await GET(new NextRequest('http://localhost/api/auth/google'));
    expect(withoutConsent.cookies.get('google_oauth_consent')).toBeUndefined();
  });
});

describe('GET /api/auth/google/callback — consent gate on new-tenant provisioning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ id_token: 'fake-id-token' }),
    }) as any;
  });

  function makeCallbackReq(cookieHeader: string) {
    return new NextRequest(
      'http://localhost/api/auth/google/callback?code=abc&state=matching-state',
      { headers: { cookie: cookieHeader } }
    );
  }

  it('refuses to auto-provision a new tenant without the consent cookie', async () => {
    mockSignInWithIdToken.mockResolvedValue({ data: { user: { id: 'auth-new', email: 'newuser@acme.com' } }, error: null });
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'users') return chain({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
      return chain();
    });

    const { GET } = await import('@/app/api/auth/google/callback/route');
    const cookieHeader = 'google_oauth_state=matching-state; google_oauth_nonce=raw-nonce';
    const res = await GET(makeCallbackReq(cookieHeader));

    expect(res.headers.get('location')).toContain('/signup?error=consent_required');
    const tenantsCalls = (supabaseAdmin.from as any).mock.calls.filter((c: any[]) => c[0] === 'tenants');
    expect(tenantsCalls.length).toBe(0);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it('provisions and records consent when the cookie is present', async () => {
    mockSignInWithIdToken.mockResolvedValue({ data: { user: { id: 'auth-new', email: 'newuser@acme.com' } }, error: null });
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'users') return chain({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) });
      if (table === 'tenants') return chain({ single: vi.fn().mockResolvedValue({ data: { id: 't-new' }, error: null }) });
      return chain();
    });

    const { GET } = await import('@/app/api/auth/google/callback/route');
    const cookieHeader = 'google_oauth_state=matching-state; google_oauth_nonce=raw-nonce; google_oauth_consent=1';
    const res = await GET(makeCallbackReq(cookieHeader));

    expect(res.headers.get('location')).toContain('/onboard');
    expect(recordConsent).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't-new', email: 'newuser@acme.com', source: 'google_oauth' })
    );
  });
});
