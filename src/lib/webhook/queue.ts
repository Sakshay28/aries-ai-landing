import { Queue, Worker, type Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { processIncomingMessage } from '@/lib/whatsapp/processor';
import { processIncomingIGMessage } from '@/lib/instagram/processor';
import type { ParsedWhatsAppMessage } from '@/lib/whatsapp/service';
import * as Sentry from '@sentry/nextjs';

const WEBHOOK_QUEUE = 'incoming-webhooks';
let webhookQueue: Queue | null = null;
let webhookWorker: Worker | null = null;

const IG_WEBHOOK_QUEUE = 'ig-incoming-webhooks';
let igWebhookQueue: Queue | null = null;
let igWebhookWorker: Worker | null = null;

export function initWebhookEngine() {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('⚠️ Redis not available, incoming webhooks will be processed synchronously');
    return;
  }

  webhookQueue = new Queue(WEBHOOK_QUEUE, { connection: redis });

  webhookWorker = new Worker(
    WEBHOOK_QUEUE,
    async (job: Job<ParsedWhatsAppMessage>) => {
      await processIncomingMessage(job.data);
    },
    { 
      connection: redis, 
      concurrency: 10,
      lockDuration: 30000,
      stalledInterval: 30000,
      maxStalledCount: 1,
    }
  );

  webhookWorker.on('completed', (job) => {
    console.log(`✅ Webhook job completed: ${job.id}`);
  });

  webhookWorker.on('failed', async (job, err) => {
    console.error(`❌ Webhook job failed: ${job?.id}`, err.message);
    Sentry.captureException(err);
    if (process.env.SLACK_WEBHOOK_URL) {
      fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `🚨 *Webhook Job Failed*\nJob ID: ${job?.id}\nError: ${err.message}` })
      }).catch(console.error);
    }
  });

  igWebhookQueue = new Queue(IG_WEBHOOK_QUEUE, { connection: redis });
  igWebhookWorker = new Worker(
    IG_WEBHOOK_QUEUE,
    async (job: Job<{ igPageId: string, senderId: string, messageText: string, messageId: string }>) => {
      await processIncomingIGMessage(job.data.igPageId, job.data.senderId, job.data.messageText, job.data.messageId);
    },
    { 
      connection: redis, 
      concurrency: 10,
      lockDuration: 30000,
      stalledInterval: 30000,
      maxStalledCount: 1,
    }
  );

  igWebhookWorker.on('failed', (job, err) => {
    console.error(`❌ IG Webhook job failed: ${job?.id}`, err.message);
    Sentry.captureException(err);
  });
  
  console.log('🔗 Webhook queue engine started (BullMQ + Redis)');
}

export async function enqueueWebhookMessage(msg: ParsedWhatsAppMessage) {
  if (webhookQueue) {
    await webhookQueue.add('webhook-message', msg, {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });
  } else {
    // Fallback if Redis is not configured
    processIncomingMessage(msg).catch((err) => {
      console.error(err);
      Sentry.captureException(err);
    });
  }
}

export async function enqueueIGWebhookMessage(data: { igPageId: string, senderId: string, messageText: string, messageId: string }) {
  if (igWebhookQueue) {
    await igWebhookQueue.add('ig-webhook-message', data, {
      removeOnComplete: 100,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });
  } else {
    processIncomingIGMessage(data.igPageId, data.senderId, data.messageText, data.messageId).catch(console.error);
  }
}
