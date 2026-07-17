/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('@/lib/billing/razorpay', () => ({
  cancelSubscription: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/audit/logger', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/lib/alerts/admin', () => ({
  notifyAdmin: vi.fn().mockResolvedValue(undefined),
}));

const mockSend = vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null });
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function MockResend() { return { emails: { send: mockSend } }; }),
}));

import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { cancelSubscription } from '@/lib/billing/razorpay';
import { logAudit } from '@/lib/audit/logger';

const OWNER = {
  id: 'u-1', tenant_id: 't-1', email: 'owner@acme.com', full_name: 'Owner',
  role: 'owner', is_sales_agent: false, is_platform_admin: false,
};
const STAFF = { ...OWNER, role: 'staff' };

function chain(overrides: Record<string, any> = {}) {
  const c: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve: (v: { data: null; error: null }) => void) => resolve({ data: null, error: null }),
    ...overrides,
  };
  return c;
}

describe('POST /api/dashboard/data-deletion — request deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-key';
    process.env.NEXT_PUBLIC_APP_URL = 'https://ariesai.in';
  });

  function req(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/dashboard/data-deletion', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('rejects unauthenticated requests', async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    const { POST } = await import('@/app/api/dashboard/data-deletion/route');
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it('rejects non-owner roles', async () => {
    (getCurrentUser as any).mockResolvedValue(STAFF);
    const { POST } = await import('@/app/api/dashboard/data-deletion/route');
    const res = await POST(req({ confirmBusinessName: 'Acme' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('owner');
  });

  it('rejects a business-name confirmation that does not match', async () => {
    (getCurrentUser as any).mockResolvedValue(OWNER);
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ single: vi.fn().mockResolvedValue({ data: { business_name: 'Acme Co', business_email: 'a@acme.com' }, error: null }) });
      return chain();
    });
    const { POST } = await import('@/app/api/dashboard/data-deletion/route');
    const res = await POST(req({ confirmBusinessName: 'wrong name' }));
    expect(res.status).toBe(400);
  });

  it('on a correct confirmation: creates the request, pauses the bot, cancels billing, and logs it', async () => {
    (getCurrentUser as any).mockResolvedValue(OWNER);
    const tenantUpdate = vi.fn().mockReturnThis();
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'tenants') {
        return chain({
          single: vi.fn().mockResolvedValue({ data: { business_name: 'Acme Co', business_email: 'a@acme.com' }, error: null }),
          update: tenantUpdate,
        });
      }
      if (table === 'data_deletion_requests') {
        return chain({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // no existing pending request
          single: vi.fn().mockResolvedValue({
            data: { id: 'r-1', confirmation_code: 'abc123', scheduled_for: '2026-08-16T00:00:00Z' },
            error: null,
          }),
        });
      }
      return chain();
    });

    const { POST } = await import('@/app/api/dashboard/data-deletion/route');
    const res = await POST(req({ confirmBusinessName: 'Acme Co' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(tenantUpdate).toHaveBeenCalledWith({ is_active: false });
    expect(cancelSubscription).toHaveBeenCalledWith('t-1');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 't-1', action: 'account_deletion_requested' })
    );
    expect(mockSend).toHaveBeenCalled();
  });

  it('is idempotent — returns the existing pending request instead of creating a duplicate', async () => {
    (getCurrentUser as any).mockResolvedValue(OWNER);
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'tenants') return chain({ single: vi.fn().mockResolvedValue({ data: { business_name: 'Acme Co', business_email: 'a@acme.com' }, error: null }) });
      if (table === 'data_deletion_requests') {
        return chain({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'r-existing', scheduled_for: '2026-08-01T00:00:00Z', confirmation_code: 'xyz' },
            error: null,
          }),
        });
      }
      return chain();
    });

    const { POST } = await import('@/app/api/dashboard/data-deletion/route');
    const res = await POST(req({ confirmBusinessName: 'Acme Co' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message).toContain('already pending');
    expect(cancelSubscription).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/dashboard/data-deletion — cancel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancels via email-link code without requiring a session', async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    const tenantUpdate = vi.fn().mockReturnThis();
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'data_deletion_requests') {
        return chain({
          single: vi.fn().mockResolvedValue({ data: { id: 'r-1', status: 'pending', tenant_id: 't-1' }, error: null }),
          update: vi.fn().mockReturnThis(),
        });
      }
      if (table === 'tenants') return chain({ update: tenantUpdate });
      return chain();
    });

    const { DELETE } = await import('@/app/api/dashboard/data-deletion/route');
    const res = await DELETE(new NextRequest('http://localhost/api/dashboard/data-deletion?code=abc123'));
    expect(res.status).toBe(200);
    expect(tenantUpdate).toHaveBeenCalledWith({ is_active: true });
  });

  it('requires owner role when cancelling by session (no code)', async () => {
    (getCurrentUser as any).mockResolvedValue({ ...OWNER, role: 'staff' });
    const { DELETE } = await import('@/app/api/dashboard/data-deletion/route');
    const res = await DELETE(new NextRequest('http://localhost/api/dashboard/data-deletion'));
    expect(res.status).toBe(403);
  });

  it('cancels by session for the owner without needing a code', async () => {
    (getCurrentUser as any).mockResolvedValue(OWNER);
    const tenantUpdate = vi.fn().mockReturnThis();
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'data_deletion_requests') {
        return chain({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'r-1', status: 'pending', tenant_id: 't-1' }, error: null }),
          update: vi.fn().mockReturnThis(),
        });
      }
      if (table === 'tenants') return chain({ update: tenantUpdate });
      return chain();
    });

    const { DELETE } = await import('@/app/api/dashboard/data-deletion/route');
    const res = await DELETE(new NextRequest('http://localhost/api/dashboard/data-deletion'));
    expect(res.status).toBe(200);
    expect(tenantUpdate).toHaveBeenCalledWith({ is_active: true });
  });

  it('404s when there is nothing to cancel', async () => {
    (getCurrentUser as any).mockResolvedValue(OWNER);
    (supabaseAdmin.from as any).mockImplementation(() => chain({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }));
    const { DELETE } = await import('@/app/api/dashboard/data-deletion/route');
    const res = await DELETE(new NextRequest('http://localhost/api/dashboard/data-deletion'));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/dashboard/data-deletion — status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires auth when checking by session', async () => {
    (getCurrentUser as any).mockResolvedValue(null);
    const { GET } = await import('@/app/api/dashboard/data-deletion/route');
    const res = await GET(new NextRequest('http://localhost/api/dashboard/data-deletion'));
    expect(res.status).toBe(401);
  });

  it('returns null status for a tenant with nothing pending', async () => {
    (getCurrentUser as any).mockResolvedValue(OWNER);
    (supabaseAdmin.from as any).mockImplementation(() => chain({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }));
    const { GET } = await import('@/app/api/dashboard/data-deletion/route');
    const res = await GET(new NextRequest('http://localhost/api/dashboard/data-deletion'));
    const body = await res.json();
    expect(body.status).toBeNull();
  });
});
