import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestSendService } from '@/lib/broadcast/services/test-send.service';
import { supabaseAdmin } from '@/lib/supabase/admin';
import * as metaService from '@/lib/meta/service';
import * as cryptoUtil from '@/lib/utils/crypto';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/meta/service', () => ({
  sendTemplateMessage: vi.fn(),
  MetaApiError: class extends Error {},
}));

vi.mock('@/lib/utils/crypto', () => ({
  decryptToken: vi.fn((token: string) => `decrypted_${token}`),
}));

describe('TestSendService — Dynamic Recipient Identity Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves CRM lead by phone number and personalizes test message with customer name', async () => {
    const tenantId = 'test-tenant-123';
    const testPhone = '919523777274';

    const mockFrom = vi.fn((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { wa_access_token: 'enc_tok', wa_phone_number_id: 'wa_phone_id' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'leads') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              ilike: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 'lead-sushant-1',
                        name: 'Sushant',
                        email: 'sushant@example.com',
                        notes: 'Devprayagjal founder',
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'broadcast_templates_cache') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'broadcast_events') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    (supabaseAdmin.from as any) = mockFrom;
    (metaService.sendTemplateMessage as any).mockResolvedValue({ messageId: 'wamid.123' });

    const variables = {
      '1': { index: '1', sourceType: 'crm_field' as const, crmField: 'name' },
    };

    const res = await TestSendService.sendTest(
      tenantId,
      'festive_template',
      variables,
      ['1'],
      testPhone
    );

    expect(res.success).toBe(true);
    expect(res.messageId).toBe('wamid.123');

    // Verify Meta received Sushant instead of hardcoded Sakshay
    expect(metaService.sendTemplateMessage).toHaveBeenCalledWith(
      'decrypted_enc_tok',
      'wa_phone_id',
      testPhone,
      'festive_template',
      expect.arrayContaining([
        expect.objectContaining({
          type: 'body',
          parameters: [{ type: 'text', text: 'Sushant' }],
        }),
      ]),
      'en'
    );
  });

  it('prioritizes explicit customRecipientName when passed in test dialog', async () => {
    const tenantId = 'test-tenant-123';
    const testPhone = '919876543210';

    const mockFrom = vi.fn((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { wa_access_token: 'enc_tok', wa_phone_number_id: 'wa_phone_id' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'leads') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              ilike: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'broadcast_templates_cache') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'broadcast_events') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {};
    });

    (supabaseAdmin.from as any) = mockFrom;
    (metaService.sendTemplateMessage as any).mockResolvedValue({ messageId: 'wamid.456' });

    const variables = {
      '1': { index: '1', sourceType: 'crm_field' as const, crmField: 'name' },
    };

    const res = await TestSendService.sendTest(
      tenantId,
      'festive_template',
      variables,
      ['1'],
      testPhone,
      'en',
      undefined,
      'Amit'
    );

    expect(res.success).toBe(true);
    expect(metaService.sendTemplateMessage).toHaveBeenCalledWith(
      'decrypted_enc_tok',
      'wa_phone_id',
      testPhone,
      'festive_template',
      expect.arrayContaining([
        expect.objectContaining({
          type: 'body',
          parameters: [{ type: 'text', text: 'Amit' }],
        }),
      ]),
      'en'
    );
  });
});
