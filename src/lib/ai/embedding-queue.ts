// ═══════════════════════════════════════════════════════════
// Embedding Job Queue
// ═══════════════════════════════════════════════════════════
// Dequeues knowledge-doc embedding tasks off the API hot-path.
// Pattern mirrors broadcast/queue.ts:
//   - initEmbeddingEngine() is a no-op on Vercel
//   - worker.ts calls it to register the real BullMQ Worker
//   - enqueueEmbedding() fires inline on Vercel (non-blocking),
//     and the worker handles it properly via BullMQ when running
// ═══════════════════════════════════════════════════════════

import { storeDocEmbedding } from '@/lib/ai/rag';
import * as Sentry from '@/lib/sentry-stub';

export interface EmbeddingJobData {
  docId:       string;
  contentText: string;
}

// ── No-op on Vercel — real implementation lives in worker.ts ──
export function initEmbeddingEngine() {
  // intentionally empty — worker.ts registers the BullMQ Worker
}

// ── Simple in-process throttle: max N concurrent Gemini calls ──
const MAX_CONCURRENT = 3;
let _running = 0;
const _pending: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  return new Promise(resolve => {
    if (_running < MAX_CONCURRENT) { _running++; resolve(); return; }
    _pending.push(() => { _running++; resolve(); });
  });
}
function releaseSlot() {
  _running--;
  const next = _pending.shift();
  if (next) next();
}

// ── Called from the knowledge upload API route ────────────
export async function enqueueEmbedding(data: EmbeddingJobData): Promise<void> {
  // Fire-and-forget, non-blocking for the API caller
  (async () => {
    await acquireSlot();
    try {
      await storeDocEmbedding(data.docId, data.contentText);
    } catch (err) {
      console.error('enqueueEmbedding: failed for doc', data.docId, err);
      Sentry.captureException(err as Error);
    } finally {
      releaseSlot();
    }
  })();
}
