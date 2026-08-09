/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('@/lib/shiprocket/queue', () => ({
  enqueueWebhookEvent: vi.fn(),
  ShiprocketWorker: { processQueue: vi.fn() },
}));
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  // after() requires the real Next.js server runtime request scope, which
  // doesn't exist under vitest — stub it so calling the route handler
  // directly in a unit test doesn't throw.
  return { ...actual, after: vi.fn() };
});

import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { enqueueWebhookEvent } from '@/lib/shiprocket/queue';
import { encryptTokenV2 } from '@/lib/security/keyManager';
import { POST } from '@/app/api/webhooks/shiprocket/[tenantId]/route';

function thenable(result: { data: unknown; error: unknown }) {
  const builder: any = {};
  const chainMethods = ['select', 'eq', 'in', 'order', 'limit', 'range', 'insert', 'update', 'delete'];
  for (const m of chainMethods) builder[m] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  builder.single = vi.fn(async () => result);
  builder.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

const SECRET = 'webhook-secret-abc';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/shiprocket/tenant-1', {
    method: 'POST',
    headers: { 'x-api-key': SECRET, 'content-type': 'application/json' },
    body: JSON.stringify({ awb: 'AWB123', current_status: 'DELIVERED' }),
  });
}

describe('POST /api/webhooks/shiprocket/[tenantId]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('acks the first delivery, enqueues it, then acks a duplicate without re-enqueuing', async () => {
    let insertCalls = 0;
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shiprocket_connections') {
        return thenable({ data: { webhook_secret_enc: encryptTokenV2(SECRET) }, error: null });
      }
      if (table === 'shiprocket_webhook_events') {
        insertCalls++;
        // Same raw body -> same sha256 dedupe_key -> the second INSERT hits
        // the UNIQUE(tenant_id, dedupe_key) constraint.
        if (insertCalls === 1) return thenable({ data: { id: 'evt-1' }, error: null });
        return thenable({ data: null, error: { code: '23505' } });
      }
      return thenable({ data: null, error: null });
    });

    const first = await POST(makeRequest(), { params: Promise.resolve({ tenantId: 'tenant-1' }) });
    expect(first.status).toBe(200);
    expect((await first.json()).duplicate).toBeUndefined();

    const second = await POST(makeRequest(), { params: Promise.resolve({ tenantId: 'tenant-1' }) });
    expect(second.status).toBe(200);
    expect((await second.json()).duplicate).toBe(true);

    // Only the first delivery's event should have been queued for processing.
    expect(enqueueWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it('rejects a request with the wrong x-api-key', async () => {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shiprocket_connections') return thenable({ data: { webhook_secret_enc: encryptTokenV2(SECRET) }, error: null });
      return thenable({ data: null, error: null });
    });

    const req = new NextRequest('http://localhost/api/webhooks/shiprocket/tenant-1', {
      method: 'POST',
      headers: { 'x-api-key': 'wrong-secret' },
      body: '{}',
    });
    const res = await POST(req, { params: Promise.resolve({ tenantId: 'tenant-1' }) });

    expect(res.status).toBe(401);
    expect(enqueueWebhookEvent).not.toHaveBeenCalled();
  });

  it('acks (200) an unknown tenant so the sender stops retrying, without enqueuing', async () => {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'shiprocket_connections') return thenable({ data: null, error: null });
      return thenable({ data: null, error: null });
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ tenantId: 'unknown-tenant' }) });

    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe('unknown_tenant');
    expect(enqueueWebhookEvent).not.toHaveBeenCalled();
  });
});
