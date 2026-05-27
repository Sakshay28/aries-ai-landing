// ═══════════════════════════════════════════════════════════
// 🚀 STANDALONE BULLMQ WORKER
// ═══════════════════════════════════════════════════════════
// This must be run as a separate process on a persistent server
// (e.g. Render, Railway, EC2) via `npx tsx worker.ts`.
// It cannot run on Vercel Serverless.
// ═══════════════════════════════════════════════════════════

import { initFollowUpEngine, shutdownFollowUpEngine } from './src/lib/followup/engine';
import { initWebhookEngine } from './src/lib/webhook/queue';
import { initBroadcastEngine, shutdownBroadcastEngine } from './src/lib/broadcast/queue';
import { initEmbeddingEngine } from './src/lib/ai/embedding-queue';

// Bull-Board Imports
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { getRedisClient } from './src/lib/redis/client';

console.log('🚀 Starting standalone BullMQ worker process...');

// Initialize all queue processors
initFollowUpEngine();
initWebhookEngine();
initBroadcastEngine();
initEmbeddingEngine();

// Setup Bull-Board
const redis = getRedisClient();
if (redis) {
  const webhookQueue = new Queue('incoming-webhooks', { connection: redis });
  const igWebhookQueue = new Queue('ig-incoming-webhooks', { connection: redis });
  const broadcastQueue  = new Queue('broadcast-jobs',          { connection: redis });
  const followupQueue   = new Queue('follow-ups',               { connection: redis });
  const timeoutQueue    = new Queue('conversation-timeouts',    { connection: redis });
  const embeddingQueue  = new Queue('embedding-jobs',           { connection: redis });

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queue');

  createBullBoard({
    queues: [
      new BullMQAdapter(webhookQueue),
      new BullMQAdapter(igWebhookQueue),
      new BullMQAdapter(broadcastQueue),
      new BullMQAdapter(followupQueue),
      new BullMQAdapter(timeoutQueue),
      new BullMQAdapter(embeddingQueue),
    ],
    serverAdapter: serverAdapter,
  });

  const app = express();
  app.use('/admin/queue', serverAdapter.getRouter());
  app.listen(3001, () => {
    console.log('📊 Bull Board running on port 3001. Accessible via Next.js proxy at /admin/queue');
  });

  // 💓 Worker Heartbeat (set immediately, then every 30s)
  const updateHeartbeat = async () => {
    try {
      await redis.set('worker:heartbeat', Date.now().toString(), 'EX', 120);
      console.log('💓 Standalone BullMQ worker heartbeat updated');
    } catch (err) {
      console.error('❌ Failed to update worker heartbeat:', err);
    }
  };
  void updateHeartbeat();
  const heartbeatInterval = setInterval(updateHeartbeat, 30000);
  heartbeatInterval.unref();
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received. Shutting down workers gracefully...');
  await shutdownFollowUpEngine();
  await shutdownBroadcastEngine();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received. Shutting down workers gracefully...');
  await shutdownFollowUpEngine();
  await shutdownBroadcastEngine();
  process.exit(0);
});
