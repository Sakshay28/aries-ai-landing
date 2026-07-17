/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/getCurrentUser', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
    auth: { admin: { generateLink: vi.fn() } },
  },
}));

vi.mock('@/lib/audit/logger', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/lib/tenant/manager', () => ({
  invalidateTenantAllCaches: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/crypto', () => ({
  encryptToken: vi.fn((v: string) => `enc:v1:mock:${v}`),
}));

import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/logger';

const PLATFORM_ADMIN = {
  id: 'admin-1',
  tenant_id: 't-admin',
  email: 'sakshay@ariesai.in',
  full_name: 'Sakshay',
  role: 'owner',
  is_sales_agent: false,
  is_platform_admin: true,
};

// Routes a supabaseAdmin.from('table') call to a canned response chain,
// keyed by table name, so a single test can cover a route that hits
// multiple tables (e.g. tenants then users) with different results.
function mockFromByTable(responses: Record<string, any>) {
  (supabaseAdmin.from as any).mockImplementation((table: string) => responses[table]);
}

describe('Platform-admin access logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('/api/admin/provision', () => {
    it('logs platform_admin_viewed_credentials when a platform admin views one tenant', async () => {
      const { GET } = await import('@/app/api/admin/provision/route');
      (getCurrentUser as any).mockResolvedValue(PLATFORM_ADMIN);

      mockFromByTable({
        tenants: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 't-1', business_name: 'Acme', wa_access_token: 'secret-token', wa_app_secret: 'secret-app' },
            error: null,
          }),
        },
        users: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ email: 'owner@acme.com', role: 'owner' }] }),
        },
      });

      const req = new NextRequest('http://localhost/api/admin/provision?tenant_id=t-1');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      // Secrets never reach the response body unmasked.
      expect(body.tenant.wa_access_token).toBe('••••••••');

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 't-1',
          actor_email: 'sakshay@ariesai.in',
          action: 'platform_admin_viewed_credentials',
          entity_id: 't-1',
        })
      );
    });

    it('logs platform_admin_edited_tenant with only changed field names, never secret values', async () => {
      const { PATCH } = await import('@/app/api/admin/provision/route');
      (getCurrentUser as any).mockResolvedValue(PLATFORM_ADMIN);

      // Route hits `tenants` twice in sequence: an exists-check (select/eq/single),
      // then the actual update (update/eq). Each .from() call gets its own chain.
      (supabaseAdmin.from as any)
        .mockImplementationOnce(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 't-1' }, error: null }),
        }))
        .mockImplementationOnce(() => ({
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        }));

      const req = new NextRequest('http://localhost/api/admin/provision', {
        method: 'PATCH',
        body: JSON.stringify({ tenant_id: 't-1', business_name: 'New Name', wa_access_token: 'brand-new-secret' }),
      });
      const res = await PATCH(req);

      expect(res.status).toBe(200);
      const call = (logAudit as any).mock.calls.find(
        (c: any[]) => c[0].action === 'platform_admin_edited_tenant'
      );
      expect(call).toBeTruthy();
      const entry = call[0];
      expect(entry.tenant_id).toBe('t-1');
      expect(entry.new_value).toEqual(expect.arrayContaining(['business_name', 'wa_access_token']));
      // The raw secret value must never appear anywhere in the log entry.
      expect(JSON.stringify(entry)).not.toContain('brand-new-secret');
    });
  });

  describe('/api/admin/impersonate', () => {
    it('resolves the target tenant and logs platform_admin_impersonated against it', async () => {
      const { POST } = await import('@/app/api/admin/impersonate/route');
      (getCurrentUser as any).mockResolvedValue(PLATFORM_ADMIN);

      mockFromByTable({
        users: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'u-9', tenant_id: 't-9' }, error: null }),
        },
      });
      (supabaseAdmin.auth.admin.generateLink as any).mockResolvedValue({
        data: { properties: { action_link: 'https://example.com/magic' } },
        error: null,
      });

      const req = new NextRequest('http://localhost/api/admin/impersonate', {
        method: 'POST',
        body: JSON.stringify({ email: 'owner@acme.com' }),
      });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 't-9',
          action: 'platform_admin_impersonated',
          entity_id: 'u-9',
          meta: { target_email: 'owner@acme.com' },
        })
      );
    });

    it('does not log when the target email matches no user', async () => {
      const { POST } = await import('@/app/api/admin/impersonate/route');
      (getCurrentUser as any).mockResolvedValue(PLATFORM_ADMIN);

      mockFromByTable({
        users: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        },
      });
      (supabaseAdmin.auth.admin.generateLink as any).mockResolvedValue({
        data: { properties: { action_link: 'https://example.com/magic' } },
        error: null,
      });

      const req = new NextRequest('http://localhost/api/admin/impersonate', {
        method: 'POST',
        body: JSON.stringify({ email: 'ghost@nowhere.com' }),
      });
      await POST(req);

      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe('/api/admin/approvals', () => {
    it('logs platform_admin_approved_signup on approve', async () => {
      const { POST } = await import('@/app/api/admin/approvals/route');
      (getCurrentUser as any).mockResolvedValue(PLATFORM_ADMIN);

      mockFromByTable({
        tenants: {
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ error: null }),
        },
      });

      const req = new Request('http://localhost/api/admin/approvals', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: 't-5', action: 'approve' }),
      });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 't-5',
          action: 'platform_admin_approved_signup',
          entity_id: 't-5',
        })
      );
    });

    it('does not log on reject — the tenant row (and any log referencing it) is deleted', async () => {
      const { POST } = await import('@/app/api/admin/approvals/route');
      (getCurrentUser as any).mockResolvedValue(PLATFORM_ADMIN);

      mockFromByTable({
        tenants: {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { is_approved: false }, error: null }),
          delete: vi.fn().mockReturnThis(),
        },
      });

      const req = new Request('http://localhost/api/admin/approvals', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: 't-5', action: 'reject' }),
      });
      await POST(req);

      expect(logAudit).not.toHaveBeenCalled();
    });
  });
});
