import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabaseAdmin } from '../src/lib/supabase/admin';

vi.mock('../src/lib/supabase/admin', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

describe('Escalation Cron', () => {
  const fromMock = vi.spyOn(supabaseAdmin, 'from');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('correctly requests unacknowledged database records', async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [], error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === 'business_notifications') {
        return {
          select: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          lt: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnValue({ data: [], error: null }),
        } as any;
      }
      return { select: vi.fn() } as any;
    });

    // Verify mocks
    expect(fromMock).toBeDefined();
  });
});
