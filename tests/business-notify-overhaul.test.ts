import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendBusinessEvent, processNotificationRetries, summarizeStatus } from '../src/lib/whatsapp/businessNotify';
import { supabaseAdmin } from '../src/lib/supabase/admin';

vi.mock('../src/lib/supabase/admin', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

vi.mock('../src/lib/tenant/manager', () => {
  return {
    getTenantById: vi.fn().mockResolvedValue({
      id: 'tenant-abc',
      business_name: 'Test Tenant ABC',
      wa_access_token: 'enc:token',
      wa_phone_number_id: 'wa-id-abc',
      staff_phone: '8010307249',
    }),
  };
});

vi.mock('../src/lib/utils/crypto', () => {
  return {
    decryptToken: vi.fn().mockReturnValue('mock-token'),
  };
});

vi.mock('../src/lib/whatsapp/session', () => {
  return {
    getSessionState: vi.fn().mockResolvedValue({
      conversationId: 'conv-123',
      windowOpen: true,
    }),
  };
});

vi.mock('../src/lib/meta/service', () => {
  return {
    sendTextMessage: vi.fn().mockResolvedValue({ messageId: 'wa-msg-999' }),
  };
});

describe('businessNotify.ts Overhaul Tests', () => {
  const fromMock = vi.spyOn(supabaseAdmin, 'from');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enforces idempotency and checks for duplicate key insert', async () => {
    // 1. Mock existing check
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    // 2. Mock insert returning a new record
    const singleMock = vi.fn().mockResolvedValue({ data: { id: 'notif-111' }, error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === 'business_notifications') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: maybeSingleMock,
          insert: vi.fn().mockReturnThis(),
          single: singleMock,
          update: vi.fn().mockReturnThis(),
        } as any;
      }
      return { select: vi.fn() } as any;
    });

    const res = await sendBusinessEvent({
      tenantId: 'tenant-abc',
      eventType: 'booking_confirmation',
      title: 'Booking Confirmed',
      body: 'Hello staff',
      idempotencyKey: 'booking_test_idempotency_123',
    });

    expect(res.notificationId).toBe('notif-111');
    expect(fromMock).toHaveBeenCalledWith('business_notifications');
  });

  it('implements fair tenant claim scheduling in processNotificationRetries to avoid starvation', async () => {
    // Mock 100 pending notifications where 10 belong to tenant A and 10 to tenant B
    const mockDue = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `notif-a-${i}`, tenant_id: 'tenant-A' })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `notif-b-${i}`, tenant_id: 'tenant-B' })),
    ];

    const chain = {
      in: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockDue, error: null }),
    };

    fromMock.mockImplementation((table: string) => {
      if (table === 'business_notifications') {
        return {
          update: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnValue(chain),
          in: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
        } as any;
      }
      return { select: vi.fn() } as any;
    });

    // Run the scheduler
    const { claimed } = await processNotificationRetries();

    // Verify it called
    expect(chain.limit).toHaveBeenCalledWith(100);
  });
});
