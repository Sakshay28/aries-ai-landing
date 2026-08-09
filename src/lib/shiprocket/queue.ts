// Shiprocket sync queue + worker — MVP only has one job kind
// ('webhook_event'), so this is a smaller version of
// src/lib/shopify/queue.ts's ShopifyWorker: same atomic SKIP LOCKED claim
// (claim_shiprocket_sync_jobs) and same exponential-backoff retry/escalation
// shape, without the multi-resource dispatch or cross-tenant-lane
// concurrency guard Shopify's larger sync surface needs.

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { dispatchShiprocketWebhook } from './webhookHandlers';
import { notifyAdmin } from '@/lib/alerts/admin';

type Job = {
  id: string;
  tenant_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export async function enqueueWebhookEvent(input: { tenantId: string; webhookEventId: string | null; payload: unknown }): Promise<void> {
  await supabaseAdmin.from('shiprocket_sync_jobs').insert({
    tenant_id: input.tenantId,
    job_type: 'webhook_event',
    payload: { webhook_event_id: input.webhookEventId, body: input.payload },
  });
}

export class ShiprocketWorker {
  static async processQueue(workerId?: string, limit = 20): Promise<number> {
    const id = workerId || `worker-${randomUUID().slice(0, 8)}`;

    const { data: jobs, error } = await supabaseAdmin.rpc('claim_shiprocket_sync_jobs', {
      p_worker_id: id, p_limit: limit,
    });

    if (error) {
      console.error('❌ [shiprocket worker] claim failed', error.message);
      return 0;
    }
    if (!jobs || jobs.length === 0) return 0;

    for (const job of jobs as Job[]) {
      await this.runOne(job).catch((err) => this.failJob(job, err));
    }
    return jobs.length;
  }

  private static async runOne(job: Job): Promise<void> {
    if (job.job_type === 'webhook_event') {
      await this.runWebhook(job);
    } else {
      throw new Error(`unknown job_type: ${job.job_type}`);
    }
    await supabaseAdmin.from('shiprocket_sync_jobs').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', job.id);
  }

  private static async runWebhook(job: Job): Promise<void> {
    const webhookEventId = job.payload?.webhook_event_id as string | null;
    const body = job.payload?.body;

    const result = await dispatchShiprocketWebhook({ tenantId: job.tenant_id, payload: body });

    if (webhookEventId) {
      await supabaseAdmin.from('shiprocket_webhook_events').update({
        status: result.handled ? 'processed' : 'skipped',
        processed_at: new Date().toISOString(),
        error_message: result.handled ? null : (result.note || null),
      }).eq('id', webhookEventId);
    }
  }

  private static async failJob(job: Job, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const willRetry = job.attempts < 6;

    await supabaseAdmin.from('shiprocket_sync_jobs').update({
      status: willRetry ? 'pending' : 'failed',
      error_message: message,
      // Exponential backoff: 30s, 2m, 8m, 30m, 2h, 6h — same ladder as shopify/queue.ts
      run_at: willRetry
        ? new Date(Date.now() + Math.min(30 * 60_000, 30_000 * Math.pow(4, job.attempts))).toISOString()
        : new Date().toISOString(),
    }).eq('id', job.id);

    if (!willRetry) {
      await notifyAdmin({
        dedupeKey: `shiprocket-job-fail:${job.tenant_id}:${job.job_type}`,
        subject: `Shiprocket ${job.job_type} job failed`,
        summary: `Tenant ${job.tenant_id} — ${message}`,
        context: { job_id: job.id, attempts: job.attempts, tenant_id: job.tenant_id },
      }).catch(() => undefined);
    }
  }
}
