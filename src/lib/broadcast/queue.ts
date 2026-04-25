import { Queue, Worker, type Job } from 'bullmq';
import { getRedisClient } from '@/lib/redis/client';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getTenantById } from '@/lib/tenant/manager';
import { sendTemplateMessage } from '@/lib/whatsapp/service';
import { sleep } from '@/lib/utils/safety';
import * as Sentry from '@sentry/nextjs';

const BROADCAST_QUEUE = 'broadcast-jobs';
let broadcastQueue: Queue | null = null;
let broadcastWorker: Worker | null = null;

interface BroadcastJobData {
  tenantId: string;
  templateName: string;
  language: string;
  broadcastId: string;
  leads: { id: string; name: string; phone: string }[];
  components: any[];
}

export function initBroadcastEngine() {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('⚠️ Redis not available, broadcast engine cannot start.');
    return;
  }

  broadcastQueue = new Queue(BROADCAST_QUEUE, { connection: redis });

  broadcastWorker = new Worker(
    BROADCAST_QUEUE,
    async (job: Job<BroadcastJobData>) => {
      await processBroadcastJob(job.data);
    },
    { 
      connection: redis, 
      concurrency: 1, // One broadcast at a time globally — safe for 100 tenants
      lockDuration: 30000,
      stalledInterval: 30000,
      maxStalledCount: 1,
    }
  );

  broadcastWorker.on('completed', (job) => {
    console.log(`✅ Broadcast job completed: ${job.id}`);
  });

  broadcastWorker.on('failed', async (job, err) => {
    console.error(`❌ Broadcast job failed: ${job?.id}`, err.message);
    Sentry.captureException(err);
    if (job?.data?.tenantId) {
      try {
        await supabaseAdmin.from('analytics_events').insert({
          tenant_id: job.data.tenantId,
          event_type: 'broadcast_failed',
          metadata: { broadcast_id: job.data.broadcastId, error: err.message },
        });
      } catch (e: unknown) {
        console.error('Failed to log broadcast error:', e);
      }
    }
  });

  console.log('📢 Broadcast queue engine started (BullMQ + Redis)');
}

export async function enqueueBroadcast(data: BroadcastJobData): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error('Redis is required for broadcast. Set REDIS_URL or UPSTASH_REDIS_URL.');
  }
  const producerQueue = new Queue(BROADCAST_QUEUE, { connection: redis });
  try {
    await producerQueue.add('send-broadcast', data, {
      removeOnComplete: 10,
      removeOnFail: 100,
    });
  } finally {
    await producerQueue.close();
  }
}

async function processBroadcastJob(data: BroadcastJobData) {
  const { tenantId, templateName, language, broadcastId, leads, components } = data;
  const tenant = await getTenantById(tenantId);
  
  if (!tenant) throw new Error('Tenant not found');

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const lead of leads) {
    if (!lead.phone) continue;

    const personalizedComponents = components.length > 0
      ? components
      : [
          {
            type: 'body',
            parameters: [{ type: 'text', text: lead.name || 'there' }],
          },
        ];

    try {
      await sendTemplateMessage(tenant, lead.phone, templateName, language, personalizedComponents);
      sent++;
    } catch (error: any) {
      failed++;
      errors.push(`${lead.phone}: ${error.message || 'Unknown error'}`);
    }

    // Per-message delay to stay under Meta's 80 msgs/sec limit
    // 50ms = ~20 msg/sec — well under Meta's 80/sec with safety margin
    await sleep(50);
  }

  // Log completion
  await supabaseAdmin.from('analytics_events').insert({
    tenant_id: tenantId,
    event_type: 'broadcast_completed',
    channel: 'whatsapp',
    metadata: {
      broadcast_id: broadcastId,
      template_name: templateName,
      sent,
      failed,
      total: leads.length,
      errors: errors.slice(0, 10),
    },
  });

  console.log(`📢 [${tenant.business_name}] Broadcast completed: ${sent} sent, ${failed} failed`);
}

export async function shutdownBroadcastEngine() {
  if (broadcastWorker) await broadcastWorker.close();
  if (broadcastQueue) await broadcastQueue.close();
  console.log('📢 Broadcast engine shut down');
}
