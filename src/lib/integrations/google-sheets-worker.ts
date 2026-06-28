import { supabaseAdmin } from '@/lib/supabase/admin';
import { syncCustomerToSheet } from './google-sheets';

export class GoogleSheetsWorkerService {
  private static activeTenants = new Set<string>();

  /**
   * Main entrypoint called by the worker tick.
   * Claims and processes a batch of pending Google Sheets sync jobs.
   */
  public static async processQueue(workerId: string, limit: number = 50): Promise<number> {
    try {
      // 1. Claim pending jobs atomically using skip locked
      const { data: jobs, error } = await supabaseAdmin.rpc('claim_google_sheets_sync_jobs', {
        p_worker_id: workerId,
        p_limit: limit,
      });

      if (error) {
        console.error('❌ [GSHEETS worker] error claiming jobs:', error.message);
        return 0;
      }

      if (!jobs || jobs.length === 0) {
        return 0;
      }

      console.log(`🚀 [GSHEETS worker] claimed ${jobs.length} jobs to process.`);

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
          // If this tenant is already processing in an active lane, reschedule these jobs to run soon
          console.log(`⏳ [GSHEETS worker] tenant ${tenantId} is already busy. Postponing its jobs.`);
          promises.push(this.postponeJobs(tenantJobs));
          continue;
        }

        promises.push(this.processTenantLane(tenantId, tenantJobs));
      }

      await Promise.all(promises);
      return jobs.length;
    } catch (err) {
      console.error('💥 [GSHEETS worker] fatal error in queue processing:', err);
      return 0;
    }
  }

  /**
   * Process all claimed jobs for a single tenant sequentially, with a 1-second delay
   * between requests to strictly respect Google Sheets API rate limits (60 reqs/min).
   */
  private static async processTenantLane(tenantId: string, jobs: any[]): Promise<void> {
    this.activeTenants.add(tenantId);
    try {
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        
        // Pacing delay: sleep 1000ms between calls if not the first job
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
    console.log(`🔄 [GSHEETS worker] syncing phone ${job.phone} for tenant ${job.tenant_id}...`);

    try {
      // Execute the sync
      const result = await syncCustomerToSheet(job.tenant_id, job.phone);

      const latencyMs = Date.now() - t0;

      // Mark job as completed
      await supabaseAdmin
        .from('google_sheets_sync_queue')
        .delete() // Delete completed jobs to keep queue table lightweight, or update status:
        // We delete them to optimize database storage, but log in audit logs.
        .eq('id', job.id);

      // Write success audit log
      await supabaseAdmin.from('google_sheets_audit_logs').insert({
        tenant_id: job.tenant_id,
        lead_id: job.lead_id,
        phone: job.phone,
        event_type: job.event_type,
        status: 'success',
        latency_ms: latencyMs,
        details: { action: result.action },
      });

      console.log(`✅ [GSHEETS worker] successfully synced phone ${job.phone} in ${latencyMs}ms.`);
    } catch (err: any) {
      const latencyMs = Date.now() - t0;
      const errMsg = err.message || 'Unknown sync error';
      console.error(`❌ [GSHEETS worker] failed to sync phone ${job.phone} for tenant ${job.tenant_id}:`, errMsg);

      const nextAttempts = job.attempts + 1;
      const maxAttempts = 5;

      if (nextAttempts >= maxAttempts) {
        // Exceeded max attempts: mark as failed
        await supabaseAdmin
          .from('google_sheets_sync_queue')
          .update({
            status: 'failed',
            attempts: nextAttempts,
            error_message: errMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        // Write failure log
        await supabaseAdmin.from('google_sheets_audit_logs').insert({
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
          .from('google_sheets_sync_queue')
          .update({
            status: 'pending',
            attempts: nextAttempts,
            error_message: errMsg,
            run_at: runAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        // Write attempt failure log
        await supabaseAdmin.from('google_sheets_audit_logs').insert({
          tenant_id: job.tenant_id,
          lead_id: job.lead_id,
          phone: job.phone,
          event_type: job.event_type,
          status: 'failed',
          error_message: errMsg,
          latency_ms: latencyMs,
          details: { attempt: nextAttempts, fatal: false, next_run_at: runAt },
        });
      }
    }
  }

  /**
   * Postpone jobs back to pending status with a short delay if the tenant's lane is active.
   */
  private static async postponeJobs(jobs: any[]): Promise<void> {
    const ids = jobs.map(j => j.id);
    const runAt = new Date(Date.now() + 5000).toISOString(); // Retry in 5 seconds
    
    await supabaseAdmin
      .from('google_sheets_sync_queue')
      .update({
        status: 'pending',
        run_at: runAt,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);
  }
}
