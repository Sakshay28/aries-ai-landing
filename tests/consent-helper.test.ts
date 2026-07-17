/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '@/lib/supabase/admin';
import { recordConsent, CURRENT_POLICY_VERSION } from '@/lib/legal/consent';

describe('recordConsent()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a row tagged with the current policy version', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    (supabaseAdmin.from as any).mockReturnValue({ insert: insertMock });

    await recordConsent({ tenantId: 't-1', email: 'a@b.com', ip: '1.2.3.4', userAgent: 'ua', source: 'otp_signup' });

    expect(supabaseAdmin.from).toHaveBeenCalledWith('consent_records');
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 't-1',
        email: 'a@b.com',
        consent_type: 'terms_and_privacy',
        policy_version: CURRENT_POLICY_VERSION,
        source: 'otp_signup',
        ip_address: '1.2.3.4',
        user_agent: 'ua',
      })
    );
  });

  it('throws when the insert fails — callers must roll back, never swallow this', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: { message: 'db down' } });
    (supabaseAdmin.from as any).mockReturnValue({ insert: insertMock });

    await expect(
      recordConsent({ tenantId: 't-1', email: 'a@b.com', ip: '1.2.3.4', source: 'google_oauth' })
    ).rejects.toThrow('db down');
  });
});
