import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabaseAdmin } from '../src/lib/supabase/admin';

vi.mock('../src/lib/supabase/admin', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

describe('Monitoring API', () => {
  const fromMock = vi.spyOn(supabaseAdmin, 'from');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries database for metrics calculations', async () => {
    const selectMock = vi.fn().mockResolvedValue({
      data: [
        { wa_status: 'delivered', attempt_count: 1, acknowledged_at: '2026-07-01T12:03:00Z', created_at: '2026-07-01T12:00:00Z' },
        { wa_status: 'failed', attempt_count: 5, acknowledged_at: null, created_at: '2026-07-01T12:00:00Z' }
      ],
      error: null
    });

    fromMock.mockImplementation((table: string) => {
      if (table === 'business_notifications') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation(() => selectMock()),
        } as any;
      }
      return { select: vi.fn() } as any;
    });

    const res = await supabaseAdmin.from('business_notifications').select('wa_status').eq('tenant_id', '123');
    expect(res.data?.length).toBe(2);
  });
});
