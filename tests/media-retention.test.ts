/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  purgeExpiredChatMedia,
  resolveRetentionDays,
  CHAT_MEDIA_RETENTION_BUCKETS,
  type StorageLike,
} from '@/lib/media/media-retention';

const NOW = Date.parse('2026-10-30T00:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

type Tree = Record<string, Record<string, { created_at: string; size: number } | 'folder'>>;

// In-memory Storage: tree[bucket][path] = file | 'folder'
function fakeStorage(tree: Tree, opts: { failRemoveFor?: string } = {}) {
  const removed: Record<string, string[]> = {};
  const listCalls: string[] = [];
  const storage: StorageLike = {
    from(bucket: string) {
      return {
        async list(prefix: string, { limit, offset }: { limit: number; offset: number }) {
          listCalls.push(`${bucket}:${prefix}`);
          const entries = Object.entries(tree[bucket] ?? {})
            .filter(([p]) => {
              const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
              return parent === prefix;
            })
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(offset, offset + limit)
            .map(([p, v]) => {
              const name = p.slice(p.lastIndexOf('/') + 1);
              return v === 'folder'
                ? { name, id: null }
                : { name, id: `id-${p}`, created_at: v.created_at, metadata: { size: v.size } };
            });
          return { data: entries, error: null };
        },
        async remove(paths: string[]) {
          if (opts.failRemoveFor === bucket) return { data: null, error: { message: 'boom' } };
          (removed[bucket] ??= []).push(...paths);
          return { data: paths, error: null };
        },
      };
    },
  };
  return { storage, removed, listCalls };
}

describe('purgeExpiredChatMedia', () => {
  it('deletes only files older than the cutoff, including nested folders', async () => {
    const { storage, removed } = fakeStorage({
      'whatsapp-media': {
        't1': 'folder',
        't1/old.jpg': { created_at: daysAgo(45), size: 1000 },
        't1/new.jpg': { created_at: daysAgo(3), size: 2000 },
      },
      'chat-attachments': {
        't1': 'folder',
        't1/c1': 'folder',
        't1/c1/old.mp4': { created_at: daysAgo(31), size: 5000 },
        't1/c1/new.pdf': { created_at: daysAgo(29), size: 7000 },
      },
    });

    const r = await purgeExpiredChatMedia(storage, { retentionDays: 30, deadline: Date.now() + 60_000, now: NOW });

    expect(removed['whatsapp-media']).toEqual(['t1/old.jpg']);
    expect(removed['chat-attachments']).toEqual(['t1/c1/old.mp4']);
    expect(r.deletedFiles).toBe(2);
    expect(r.freedBytes).toBe(6000);
    expect(r.scannedFiles).toBe(4);
    expect(r.complete).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('never touches template or knowledge buckets', async () => {
    expect(CHAT_MEDIA_RETENTION_BUCKETS).not.toContain('template-media');
    expect(CHAT_MEDIA_RETENTION_BUCKETS).not.toContain('knowledge-docs');

    const { storage, listCalls } = fakeStorage({
      'template-media': { 'old.png': { created_at: daysAgo(400), size: 1 } },
      'knowledge-docs': { 'old.pdf': { created_at: daysAgo(400), size: 1 } },
    });
    await purgeExpiredChatMedia(storage, { retentionDays: 30, deadline: Date.now() + 60_000, now: NOW });
    expect(listCalls.some((c) => c.startsWith('template-media') || c.startsWith('knowledge-docs'))).toBe(false);
  });

  it('keeps files with a missing or unparseable created_at', async () => {
    const { storage, removed } = fakeStorage({
      'whatsapp-media': { 'x.jpg': { created_at: 'not-a-date', size: 1 } },
    });
    const r = await purgeExpiredChatMedia(storage, { retentionDays: 30, deadline: Date.now() + 60_000, now: NOW });
    expect(removed['whatsapp-media']).toBeUndefined();
    expect(r.deletedFiles).toBe(0);
  });

  it('pages through folders with more than 1000 entries', async () => {
    const files: Tree['whatsapp-media'] = {};
    for (let i = 0; i < 1500; i++) files[`f${String(i).padStart(4, '0')}.jpg`] = { created_at: daysAgo(60), size: 1 };
    const { storage, removed } = fakeStorage({ 'whatsapp-media': files });
    const r = await purgeExpiredChatMedia(storage, { retentionDays: 30, deadline: Date.now() + 60_000, now: NOW });
    expect(removed['whatsapp-media']).toHaveLength(1500);
    expect(r.deletedFiles).toBe(1500);
  });

  it('records remove errors without counting those files as deleted', async () => {
    const { storage } = fakeStorage(
      { 'whatsapp-media': { 'a.jpg': { created_at: daysAgo(90), size: 10 } } },
      { failRemoveFor: 'whatsapp-media' },
    );
    const r = await purgeExpiredChatMedia(storage, { retentionDays: 30, deadline: Date.now() + 60_000, now: NOW });
    expect(r.deletedFiles).toBe(0);
    expect(r.errors[0]).toContain('boom');
  });

  it('stops on the time budget and reports incomplete', async () => {
    const { storage, removed } = fakeStorage({
      'whatsapp-media': { 'a.jpg': { created_at: daysAgo(90), size: 10 } },
    });
    const r = await purgeExpiredChatMedia(storage, { retentionDays: 30, deadline: Date.now() - 1, now: NOW });
    expect(r.complete).toBe(false);
    expect(removed['whatsapp-media']).toBeUndefined();
  });
});

describe('resolveRetentionDays', () => {
  it('defaults to 30 and clamps to a 7-day minimum', () => {
    expect(resolveRetentionDays(undefined)).toBe(30);
    expect(resolveRetentionDays('abc')).toBe(30);
    expect(resolveRetentionDays('0')).toBe(30);
    expect(resolveRetentionDays('3')).toBe(7);
    expect(resolveRetentionDays('14')).toBe(14);
  });
});

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { storage: { from: vi.fn() } },
}));

describe('GET /api/cron/media-retention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  it('rejects requests without the cron bearer', async () => {
    const { GET } = await import('@/app/api/cron/media-retention/route');
    const res = await GET(new NextRequest('http://localhost/api/cron/media-retention'));
    expect(res.status).toBe(401);
  });

  it('runs the purge with the ?days override', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase/admin');
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    (supabaseAdmin.storage.from as any).mockReturnValue({
      list: vi.fn().mockResolvedValue({
        data: [{ name: 'old.jpg', id: 'x', created_at: new Date(Date.now() - 20 * 86_400_000).toISOString(), metadata: { size: 1048576 } }],
        error: null,
      }),
      remove,
    });
    const { GET } = await import('@/app/api/cron/media-retention/route');
    const res = await GET(new NextRequest('http://localhost/api/cron/media-retention?days=14', {
      headers: { authorization: 'Bearer test-cron-secret' },
    }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.retentionDays).toBe(14);
    expect(body.deletedFiles).toBe(CHAT_MEDIA_RETENTION_BUCKETS.length); // one old file per bucket
    expect(remove).toHaveBeenCalledWith(['old.jpg']);
  });
});
