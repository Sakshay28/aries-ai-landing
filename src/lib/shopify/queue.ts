// Shopify sync queue + worker.
//
// Three job kinds live on the queue:
//   1) 'full_sync'      → seeds a chain of 'resource_sync' jobs
//   2) 'resource_sync'  → sync one page of one resource, enqueue the next
//                          page if cursor != null
//   3) 'webhook_event'  → dispatches a stored shopify_webhook_events row
//
// The worker is claimed atomically by claim_shopify_sync_jobs (SKIP LOCKED)
// so multiple worker instances can run without stealing each other's work.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { shopifyClientForTenant } from './client';
import { syncProductsPage } from './sync/products';
import { syncCustomersPage } from './sync/customers';
import { syncOrdersPage } from './sync/orders';
import { syncAllCollections } from './sync/collections';
import { syncAllPages, syncAllBlogsAndArticles, syncPolicies, syncAllDiscounts } from './sync/content';
import { dispatchShopifyWebhook } from './webhookHandlers';
import { notifyAdmin } from '@/lib/alerts/admin';
import { randomUUID } from 'crypto';

type Job = {
  id: string;
  tenant_id: string;
  job_type: 'full_sync' | 'resource_sync' | 'webhook_event';
  resource: string | null;
  cursor: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

const PAGINATED_RESOURCES = ['products', 'customers', 'orders'] as const;
const ONESHOT_RESOURCES = ['collections', 'pages', 'blogs', 'policies', 'discounts'] as const;

// ─── Enqueue helpers ────────────────────────────────────────

export async function enqueueFullSync(tenantId: string, opts: { lookbackDays?: number } = {}): Promise<void> {
  await supabaseAdmin.from('shopify_sync_jobs').insert({
    tenant_id: tenantId,
    job_type: 'full_sync',
    resource: null,
    payload: { lookback_days: opts.lookbackDays ?? 90 },
  });
}

export async function enqueueResourceSync(tenantId: string, resource: string, cursor: string | null, payload: Record<string, unknown> = {}): Promise<void> {
  await supabaseAdmin.from('shopify_sync_jobs').insert({
    tenant_id: tenantId,
    job_type: 'resource_sync',
    resource,
    cursor,
    payload,
  });
}

export async function enqueueWebhookEvent(input: {
  tenantId: string;
  topic: string;
  webhookEventId: string | null;
  resourceId: string | null;
  payload: unknown;
  apiVersion: string | null;
}): Promise<void> {
  await supabaseAdmin.from('shopify_sync_jobs').insert({
    tenant_id: input.tenantId,
    job_type: 'webhook_event',
    resource: 'webhook',
    payload: {
      topic: input.topic,
      webhook_event_id: input.webhookEventId,
      resource_id: input.resourceId,
      api_version: input.apiVersion,
      body: input.payload,
    },
  });
}

// ─── Worker ─────────────────────────────────────────────────

export class ShopifyWorker {
  private static activeTenants = new Set<string>();

  static async processQueue(workerId?: string, limit = 20): Promise<number> {
    const id = workerId || `worker-${randomUUID().slice(0, 8)}`;

    const { data: jobs, error } = await supabaseAdmin.rpc('claim_shopify_sync_jobs', {
      p_worker_id: id, p_limit: limit,
    });

    if (error) {
      console.error('❌ [shopify worker] claim failed', error.message);
      return 0;
    }
    if (!jobs || jobs.length === 0) return 0;

    // Group by tenant so we can serialise per-tenant (respect API rate limits).
    const byTenant = new Map<string, Job[]>();
    for (const j of jobs as Job[]) {
      const list = byTenant.get(j.tenant_id) || [];
      list.push(j);
      byTenant.set(j.tenant_id, list);
    }

    await Promise.all(Array.from(byTenant.entries()).map(([tenantId, list]) => {
      if (this.activeTenants.has(tenantId)) return this.postpone(list, 5);
      return this.processTenantLane(tenantId, list);
    }));

    return jobs.length;
  }

  private static async processTenantLane(tenantId: string, jobs: Job[]): Promise<void> {
    this.activeTenants.add(tenantId);
    try {
      for (const job of jobs) {
        await this.runOne(job).catch(err => this.failJob(job, err));
      }
    } finally {
      this.activeTenants.delete(tenantId);
    }
  }

  private static async runOne(job: Job): Promise<void> {
    const { data: tenant } = await supabaseAdmin.from('tenants')
      .select('id, shopify_store_url, shopify_access_token, shopify_api_version, shopify_shop_meta')
      .eq('id', job.tenant_id).single();
    if (!tenant) throw new Error('tenant not found');

    const client = shopifyClientForTenant(tenant);
    if (!client) throw new Error('no shopify credentials on tenant');

    if (job.job_type === 'full_sync') {
      await this.seedFullSync(job);
    } else if (job.job_type === 'resource_sync') {
      await this.runResourceSync(job, client);
    } else if (job.job_type === 'webhook_event') {
      await this.runWebhook(job);
    } else {
      throw new Error(`unknown job_type: ${job.job_type}`);
    }

    await supabaseAdmin.from('shopify_sync_jobs').update({
      status: 'completed', completed_at: new Date().toISOString(),
    }).eq('id', job.id);
  }

  private static async seedFullSync(job: Job): Promise<void> {
    await supabaseAdmin.from('tenants').update({
      shopify_sync_status: 'syncing', shopify_sync_error: null,
    }).eq('id', job.tenant_id);

    for (const r of PAGINATED_RESOURCES) {
      await enqueueResourceSync(job.tenant_id, r, null, { lookback_days: job.payload?.lookback_days ?? 90 });
    }
    for (const r of ONESHOT_RESOURCES) {
      await enqueueResourceSync(job.tenant_id, r, null);
    }
    // Terminal job that marks the tenant idle once all above complete.
    await enqueueResourceSync(job.tenant_id, 'full_sync_complete', null);
  }

  private static async runResourceSync(job: Job, client: ReturnType<typeof shopifyClientForTenant>): Promise<void> {
    if (!client) throw new Error('no client');
    const tenantId = job.tenant_id;
    const resource = job.resource;
    const shopCurrency = await this.getShopCurrency(tenantId);

    switch (resource) {
      case 'products': {
        const r = await syncProductsPage(client, tenantId, shopCurrency, job.cursor);
        if (r.nextCursor) await enqueueResourceSync(tenantId, 'products', r.nextCursor);
        return;
      }
      case 'customers': {
        const r = await syncCustomersPage(client, tenantId, job.cursor);
        if (r.nextCursor) await enqueueResourceSync(tenantId, 'customers', r.nextCursor);
        return;
      }
      case 'orders': {
        const lookback = (job.payload?.lookback_days as number) ?? 90;
        const r = await syncOrdersPage(client, tenantId, job.cursor, lookback);
        if (r.nextCursor) await enqueueResourceSync(tenantId, 'orders', r.nextCursor, { lookback_days: lookback });
        return;
      }
      case 'collections': await syncAllCollections(client, tenantId); return;
      case 'pages':       await syncAllPages(client, tenantId); return;
      case 'blogs':       await syncAllBlogsAndArticles(client, tenantId); return;
      case 'policies':    await syncPolicies(client, tenantId); return;
      case 'discounts':   await syncAllDiscounts(client, tenantId); return;
      case 'full_sync_complete':
        await supabaseAdmin.from('tenants').update({
          shopify_sync_status: 'idle',
          shopify_last_full_sync_at: new Date().toISOString(),
        }).eq('id', tenantId);
        return;
      default:
        throw new Error(`unknown resource: ${resource}`);
    }
  }

  private static async runWebhook(job: Job): Promise<void> {
    const topic = job.payload?.topic as string;
    const body = job.payload?.body;
    const webhookEventId = job.payload?.webhook_event_id as string | null;

    const result = await dispatchShopifyWebhook({
      tenantId: job.tenant_id,
      topic,
      payload: body,
    });

    if (webhookEventId) {
      await supabaseAdmin.from('shopify_webhook_events').update({
        status: result.handled ? 'processed' : 'skipped',
        processed_at: new Date().toISOString(),
        error_message: result.handled ? null : (result.note || null),
      }).eq('id', webhookEventId);
    }
  }

  private static async failJob(job: Job, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const willRetry = job.attempts < 6;

    await supabaseAdmin.from('shopify_sync_jobs').update({
      status: willRetry ? 'pending' : 'failed',
      error_message: message,
      // Exponential backoff: 30s, 2m, 8m, 30m, 2h, 6h
      run_at: willRetry
        ? new Date(Date.now() + Math.min(30 * 60_000, 30_000 * Math.pow(4, job.attempts))).toISOString()
        : new Date().toISOString(),
    }).eq('id', job.id);

    if (!willRetry) {
      await supabaseAdmin.from('tenants').update({
        shopify_sync_status: 'error',
        shopify_sync_error: `${job.job_type}${job.resource ? `/${job.resource}` : ''}: ${message}`.slice(0, 500),
      }).eq('id', job.tenant_id);
      await notifyAdmin({
        dedupeKey: `shopify-job-fail:${job.tenant_id}:${job.job_type}:${job.resource || ''}`,
        subject: `Shopify sync job failed (${job.job_type})`,
        summary: `Tenant ${job.tenant_id} — resource ${job.resource} — ${message}`,
        context: { job_id: job.id, attempts: job.attempts, tenant_id: job.tenant_id },
      }).catch(() => undefined);
    }
  }

  private static async postpone(jobs: Job[], delaySeconds: number): Promise<void> {
    const runAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
    await supabaseAdmin.from('shopify_sync_jobs').update({
      status: 'pending', run_at: runAt,
    }).in('id', jobs.map(j => j.id));
  }

  private static async getShopCurrency(tenantId: string): Promise<string | null> {
    const { data } = await supabaseAdmin.from('tenants')
      .select('shopify_shop_meta').eq('id', tenantId).single();
    const meta = data?.shopify_shop_meta as { currency?: string } | null;
    return meta?.currency || null;
  }
}
