import { supabaseAdmin } from '@/lib/supabase/admin';
import { syncCustomerToExcel } from './microsoft-excel';

export class MicrosoftExcelWorkerService {
  private static activeTenants = new Set<string>();

  /**
   * Main entrypoint called by the worker tick.
   * Claims and processes a batch of pending Microsoft Excel sync jobs.
   */
  public static async processQueue(workerId: string, limit: number = 50): Promise<number> {
    try {
      // 1. Claim pending jobs atomically using skip locked
      const { data: jobs, error } = await supabaseAdmin.rpc('claim_microsoft_excel_sync_jobs', {
        p_worker_id: workerId,
        p_limit: limit,
      });

      if (error) {
        console.error('❌ [EXCEL worker] error claiming jobs:', error.message);
        return 0;
      }

      if (!jobs || jobs.length === 0) {
        return 0;
      }

      console.log(`🚀 [EXCEL worker] claimed ${jobs.length} jobs to process.`);

      // 2. Group jobs by tenant to enforce per-tenant sequential processing & pacing (rate limiting)
      const jobsByTenant = new Map<string, any[]>();
      for (const job of jobs) {
        if (!jobsByTenant.has(job.tenant_id)) {
          jobsByTenant.set(job.tenant_id, []);
        }
        jobsByTenant.get(job.tenant_id)!.push(job);
      }

      // 3. Process each tenant's lane in parallel
      const promises: Promise<void>[] = [];
      for (const [tenantId, tenantJobs] of jobsByTenant.entries()) {
        if (this.activeTenants.has(tenantId)) {
          console.log(`⏳ [EXCEL worker] tenant ${tenantId} is already busy. Postponing its jobs.`);
          promises.push(this.postponeJobs(tenantJobs));
          continue;
        }

        promises.push(this.processTenantLane(tenantId, tenantJobs));
      }

      await Promise.all(promises);
      return jobs.length;
    } catch (err) {
      console.error('💥 [EXCEL worker] fatal error in queue processing:', err);
      return 0;
    }
  }

  /**
   * Process all claimed jobs for a single tenant sequentially, with a 1-second delay
   * between requests to respect Graph API rate limits.
   */
  private static async processTenantLane(tenantId: string, jobs: any[]): Promise<void> {
    this.activeTenants.add(tenantId);
    try {
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        
        if (i > 0) {
          await new Promise(r => setTimeout(r, 1000));
        }

        await this.processJob(job);
      }
    } finally {
      this.activeTenants.delete(tenantId);
    }
  }

  /**
   * Process a single sync job: execute the sync, handle errors, retry scheduling, and logging.
   */
  private static async processJob(job: any): Promise<void> {
    const t0 = Date.now();
    console.log(`🔄 [EXCEL worker] syncing phone ${job.phone} for tenant ${job.tenant_id}...`);

    try {
      // Execute the sync
      const result = await syncCustomerToExcel(job.tenant_id, job.phone);

      const latencyMs = Date.now() - t0;

      // Mark job as completed
      await supabaseAdmin
        .from('microsoft_excel_sync_queue')
        .delete()
        .eq('id', job.id);

      // Write success audit log
      await supabaseAdmin.from('microsoft_excel_audit_logs').insert({
        tenant_id: job.tenant_id,
        lead_id: job.lead_id,
        phone: job.phone,
        event_type: job.event_type,
        status: 'success',
        latency_ms: latencyMs,
        details: { action: result.action },
      });

      console.log(`✅ [EXCEL worker] successfully synced phone ${job.phone} in ${latencyMs}ms.`);
    } catch (err: any) {
      const latencyMs = Date.now() - t0;
      const errMsg = err.message || 'Unknown sync error';
      console.error(`❌ [EXCEL worker] failed to sync phone ${job.phone} for tenant ${job.tenant_id}:`, errMsg);

      const nextAttempts = job.attempts + 1;
      const maxAttempts = 5;

      if (nextAttempts >= maxAttempts) {
        // Exceeded max attempts: mark as failed
        await supabaseAdmin
          .from('microsoft_excel_sync_queue')
          .update({
            status: 'failed',
            attempts: nextAttempts,
            error_message: errMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        // Write failure log
        await supabaseAdmin.from('microsoft_excel_audit_logs').insert({
          tenant_id: job.tenant_id,
          lead_id: job.lead_id,
          phone: job.phone,
          event_type: job.event_type,
          status: 'failed',
          error_message: errMsg,
          latency_ms: latencyMs,
          details: { attempt: nextAttempts, fatal: true },
        });
      } else {
        // Schedule retry with exponential backoff: 30s, 60s, 120s, 240s...
        const backoffSeconds = Math.pow(2, nextAttempts) * 30;
        const runAt = new Date(Date.now() + backoffSeconds * 1000).toISOString();

        await supabaseAdmin
          .from('microsoft_excel_sync_queue')
          .update({
            status: 'pending',
            attempts: nextAttempts,
            error_message: errMsg,
            run_at: runAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        // Write failure log (non-fatal attempt)
        await supabaseAdmin.from('microsoft_excel_audit_logs').insert({
          tenant_id: job.tenant_id,
          lead_id: job.lead_id,
          phone: job.phone,
          event_type: job.event_type,
          status: 'failed',
          error_message: errMsg,
          latency_ms: latencyMs,
          details: { attempt: nextAttempts, fatal: false, nextRunAt: runAt },
        });
      }
    }
  }

  /**
   * Reset claimed processing jobs back to pending if they got postponed
   */
  private static async postponeJobs(jobs: any[]): Promise<void> {
    const ids = jobs.map(j => j.id);
    await supabaseAdmin
      .from('microsoft_excel_sync_queue')
      .update({
        status: 'pending',
        run_at: new Date(Date.now() + 5000).toISOString(), // run again in 5 seconds
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);
  }
}
