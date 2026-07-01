import { describe, it, expect, vi } from 'vitest';
import { ensureRequiredTemplates } from '../src/lib/whatsapp/templateProvisioner';
import { supabaseAdmin } from '../src/lib/supabase/admin';

vi.mock('../src/lib/supabase/admin', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

vi.mock('../src/lib/utils/crypto', () => {
  return {
    decryptToken: vi.fn().mockReturnValue('mock-access-token'),
  };
});

describe('templateProvisioner concurrency & placeholder lock', () => {
  it('gracefully handles pg constraint code 23505 and skips creation', async () => {
    // Mock the tenants select
    const fromMock = vi.spyOn(supabaseAdmin, 'from');

    // Simulate select returning a valid tenant
    const selectMock = vi.fn().mockResolvedValue({
      data: {
        id: 'tenant-123',
        wa_access_token: 'enc:token',
        wa_business_account_id: 'waba-123',
        business_name: 'Test Business',
      },
      error: null,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: selectMock,
        } as any;
      }
      
      if (table === 'draft_templates') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), // template does not exist locally yet
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: '23505',
              message: 'duplicate key value violates unique constraint',
            },
          }),
        } as any;
      }
      return { select: vi.fn() } as any;
    });

    // Execute
    await expect(ensureRequiredTemplates('tenant-123')).resolves.not.toThrow();

    // Verify it attempted to select from tenants and check/insert draft_templates
    expect(fromMock).toHaveBeenCalledWith('tenants');
    expect(fromMock).toHaveBeenCalledWith('draft_templates');
  });
});
