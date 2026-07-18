/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from '@/lib/supabase/admin';

function req() {
  return new NextRequest('http://localhost/api/cron/message-retention', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

describe('GET/POST /api/cron/message-retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  it('rejects requests without the correct bearer token', async () => {
    const { GET } = await import('@/app/api/cron/message-retention/route');
    const res = await GET(new NextRequest('http://localhost/api/cron/message-retention'));
    expect(res.status).toBe(401);
  });

  it('deletes messages older than 90 days in a single batch', async () => {
    const oldIds = [{ id: 'm-1' }, { id: 'm-2' }];
    const selectMock = vi.fn().mockReturnThis();
    const ltMock = vi.fn().mockReturnThis();
    const limitMock = vi.fn().mockResolvedValueOnce({ data: oldIds, error: null });
    const deleteMock = vi.fn().mockReturnThis();
    const inMock = vi.fn().mockResolvedValue({ error: null });

    (supabaseAdmin.from as any).mockReturnValue({
      select: selectMock, lt: ltMock, limit: limitMock, delete: deleteMock, in: inMock,
    });

    const { GET } = await import('@/app/api/cron/message-retention/route');
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deleted).toBe(2);
    expect(inMock).toHaveBeenCalledWith('id', ['m-1', 'm-2']);
  });

  it('paginates across multiple full batches until a partial batch ends it', async () => {
    const { GET } = await import('@/app/api/cron/message-retention/route');

    const BATCH_SIZE = 1000;
    const fullBatch = Array.from({ length: BATCH_SIZE }, (_, i) => ({ id: `m-${i}` }));
    const partialBatch = [{ id: 'm-last' }];

    let call = 0;
    const limitMock = vi.fn(() => {
      call += 1;
      if (call === 1) return Promise.resolve({ data: fullBatch, error: null });
      if (call === 2) return Promise.resolve({ data: partialBatch, error: null });
      return Promise.resolve({ data: [], error: null });
    });
    const inMock = vi.fn().mockResolvedValue({ error: null });

    (supabaseAdmin.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      limit: limitMock,
      delete: vi.fn().mockReturnThis(),
      in: inMock,
    });

    const res = await GET(req());
    const body = await res.json();

    expect(body.deleted).toBe(BATCH_SIZE + 1);
    expect(limitMock).toHaveBeenCalledTimes(2); // stops after the partial (< BATCH_SIZE) batch
  });

  it('stops cleanly and reports zero when nothing is old enough to purge', async () => {
    (supabaseAdmin.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: vi.fn().mockReturnThis(),
      in: vi.fn(),
    });

    const { GET } = await import('@/app/api/cron/message-retention/route');
    const res = await GET(req());
    const body = await res.json();

    expect(body.deleted).toBe(0);
  });
});
