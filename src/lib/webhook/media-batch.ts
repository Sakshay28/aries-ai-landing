// ═══════════════════════════════════════════════════════════
// Media Batch Collector — debounces rapid media messages
// ═══════════════════════════════════════════════════════════
// WhatsApp sends each photo/video as a separate webhook hit.
// When a customer sends 4-5 photos in a row, we collect them
// into one batch and process a single AI reply instead of 4-5.
//
// Mechanism:
//   1. Each media msg → INCR sequence counter + SET item + SET timestamp
//   2. Caller schedules a deferred check (4s later via after())
//   3. The deferred check verifies no new media arrived recently,
//      claims the batch with SET NX, reads all items, cleans up.
//   4. If a text message arrives while a batch is pending, force-flush
//      so the AI sees the full context (photos + text together).
// ═══════════════════════════════════════════════════════════

import { getRedisClient } from '@/lib/redis/client';

const BATCH_WINDOW_MS = 4000;
const BATCH_TTL_S = 60;

export interface BatchedMedia {
  url: string;
  type: string;
  caption: string | null;
  mimeType: string | null;
  messageId: string;
  timestamp: number;
}

const KEY = {
  seq:    (cid: string) => `mbatch_seq:${cid}`,
  item:   (cid: string, n: number) => `mbatch:${cid}:${n}`,
  ts:     (cid: string) => `mbatch_ts:${cid}`,
  lock:   (cid: string) => `mbatch_lock:${cid}`,
};

export async function addToBatch(
  conversationId: string,
  media: BatchedMedia,
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;

  try {
    const seq = await redis.incr(KEY.seq(conversationId));
    await redis.expire(KEY.seq(conversationId), BATCH_TTL_S);

    await Promise.all([
      redis.set(KEY.item(conversationId, seq), JSON.stringify(media), 'EX', BATCH_TTL_S),
      redis.set(KEY.ts(conversationId), String(Date.now()), 'EX', BATCH_TTL_S),
    ]);

    return true;
  } catch (err) {
    console.error('❌ Media batch add failed:', (err as Error).message);
    return false;
  }
}

export async function hasPendingBatch(conversationId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const seq = await redis.get(KEY.seq(conversationId));
    return !!seq && parseInt(seq, 10) > 0;
  } catch {
    return false;
  }
}

async function claimAndRead(conversationId: string): Promise<BatchedMedia[] | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  const lockResult = await redis.set(KEY.lock(conversationId), '1', 'EX', 30, 'NX');
  if (!lockResult) return null;

  const seqStr = await redis.get(KEY.seq(conversationId));
  const seq = parseInt(seqStr || '0', 10);
  if (seq === 0) {
    await redis.del(KEY.lock(conversationId));
    return null;
  }

  const keysToDelete: string[] = [
    KEY.seq(conversationId),
    KEY.ts(conversationId),
    KEY.lock(conversationId),
  ];

  const reads: Promise<string | null>[] = [];
  for (let i = 1; i <= seq; i++) {
    keysToDelete.push(KEY.item(conversationId, i));
    reads.push(redis.get(KEY.item(conversationId, i)));
  }

  const results = await Promise.all(reads);
  const items: BatchedMedia[] = [];
  for (const raw of results) {
    if (raw) {
      try { items.push(JSON.parse(raw)); } catch {}
    }
  }

  await redis.del(...keysToDelete);
  items.sort((a, b) => a.timestamp - b.timestamp);
  return items.length > 0 ? items : null;
}

export async function tryFlushBatch(conversationId: string): Promise<BatchedMedia[] | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const tsStr = await redis.get(KEY.ts(conversationId));
    if (!tsStr) return null;

    const lastMediaAt = parseInt(tsStr, 10);
    if (Date.now() - lastMediaAt < BATCH_WINDOW_MS - 500) return null;

    return await claimAndRead(conversationId);
  } catch (err) {
    console.error('❌ Media batch flush failed:', (err as Error).message);
    return null;
  }
}

export async function forceFlushBatch(conversationId: string): Promise<BatchedMedia[] | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const seqStr = await redis.get(KEY.seq(conversationId));
    if (!seqStr) return null;
    return await claimAndRead(conversationId);
  } catch (err) {
    console.error('❌ Media batch force-flush failed:', (err as Error).message);
    return null;
  }
}

export function formatBatchForAI(batch: BatchedMedia[]): string {
  const counts: Record<string, number> = {};
  const captions: string[] = [];

  for (const item of batch) {
    counts[item.type] = (counts[item.type] || 0) + 1;
    if (item.caption) captions.push(item.caption);
  }

  const parts = Object.entries(counts).map(
    ([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`
  );

  let summary = `[Customer sent ${parts.join(' and ')}]`;
  if (captions.length > 0) {
    summary += `\nCaptions: ${captions.join(' | ')}`;
  }
  return summary;
}
