import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabaseAdmin } from '../src/lib/supabase/admin';
import { normalizePhoneNumber } from '../src/lib/whatsapp/phone';

vi.mock('../src/lib/supabase/admin', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

vi.mock('../src/lib/redis/client', () => {
  return {
    isDuplicateMessage: vi.fn().mockResolvedValue(false),
  };
});

vi.mock('../src/lib/tenant/manager', () => {
  return {
    getTenantByPhoneNumberId: vi.fn().mockResolvedValue({
      id: 'tenant-123',
      business_name: 'Test Business',
      wa_access_token: 'enc:token',
      wa_phone_number_id: 'waba-123',
      staff_phone: '8010307249',
      manager_phone: '9875152290',
    }),
  };
});

vi.mock('../src/lib/utils/crypto', () => {
  return {
    decryptToken: vi.fn().mockReturnValue('mock-token'),
  };
});

vi.mock('../src/lib/meta/service', () => {
  return {
    parseMetaWebhook: vi.fn(),
    sendTextMessage: vi.fn().mockResolvedValue({ messageId: 'reply-111' }),
    markMessageAsRead: vi.fn().mockResolvedValue(true),
  };
});

describe('Webhook route.ts handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly normalizes and matches phone numbers', () => {
    expect(normalizePhoneNumber('+91 80103-07249')).toBe('918010307249');
    expect(normalizePhoneNumber('9875152290')).toBe('919875152290');
  });
});
